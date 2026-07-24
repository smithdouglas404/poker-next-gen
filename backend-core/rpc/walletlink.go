package rpc

import (
	"context"
	"crypto/ed25519"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"math/big"
	"strings"
	"time"

	"github.com/decred/dcrd/dcrec/secp256k1/v4/ecdsa"
	"github.com/heroiclabs/nakama-common/runtime"
	"golang.org/x/crypto/sha3"

	"github.com/smithdouglas404/poker-next-gen/backend-core/store"
)

// Self-custody wallet linking (#91). The client connects an external wallet
// (MetaMask/Coinbase/WalletConnect = EVM secp256k1; Phantom = Solana ed25519),
// signs a server-issued nonce message, and the server proves ownership by
// recovering/verifying the signature against the claimed address before binding
// it to the account. No private keys or seeds ever touch the server.

const walletNonceTTL = 10 * time.Minute

// linkMessage is the exact human-readable string the wallet signs. Kept stable
// so the client and server derive identical bytes.
func linkMessage(nonce string) string {
	return "High Rollers Club: link wallet\nnonce: " + nonce
}

// WalletLinkChallenge issues a one-time nonce + the message the wallet must sign.
func WalletLinkChallenge(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	userID, err := callerID(ctx)
	if err != nil {
		return "", err
	}
	nonce, err := store.NewLinkedWalletStore(db).IssueNonce(ctx, userID)
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	out, _ := json.Marshal(map[string]string{"nonce": nonce, "message": linkMessage(nonce)})
	return string(out), nil
}

// WalletLink verifies the signature over the challenge message proves control of
// `address`, then binds the wallet to the caller's account.
func WalletLink(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	userID, err := callerID(ctx)
	if err != nil {
		return "", err
	}
	var req struct {
		Provider  string `json:"provider"`
		Chain     string `json:"chain"`
		Address   string `json:"address"`
		Nonce     string `json:"nonce"`
		Signature string `json:"signature"`
	}
	if err := json.Unmarshal([]byte(payload), &req); err != nil {
		return "", runtime.NewError("invalid payload", 3)
	}
	req.Address = strings.TrimSpace(req.Address)
	if req.Address == "" || req.Nonce == "" || req.Signature == "" {
		return "", runtime.NewError("address, nonce and signature required", 3)
	}

	ls := store.NewLinkedWalletStore(db)
	ok, err := ls.ConsumeNonce(ctx, userID, req.Nonce, walletNonceTTL)
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	if !ok {
		return "", runtime.NewError("challenge expired or unknown — request a new one", 3)
	}

	msg := linkMessage(req.Nonce)
	chain := strings.ToLower(req.Chain)
	var verifiedAddr string
	switch chain {
	case "solana":
		verifiedAddr, err = verifySolana(req.Address, msg, req.Signature)
	default: // evm
		chain = "evm"
		verifiedAddr, err = recoverEVM(msg, req.Signature)
	}
	if err != nil {
		return "", runtime.NewError("signature verification failed: "+err.Error(), 7)
	}
	if !strings.EqualFold(verifiedAddr, req.Address) {
		return "", runtime.NewError("signature does not match the provided address", 7)
	}

	w, err := ls.Link(ctx, userID, strings.ToLower(req.Provider), chain, verifiedAddr)
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	out, _ := json.Marshal(map[string]interface{}{"ok": true, "wallet": w})
	return string(out), nil
}

// WalletLinkedList returns the caller's verified linked wallets.
func WalletLinkedList(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	userID, err := callerID(ctx)
	if err != nil {
		return "", err
	}
	list, err := store.NewLinkedWalletStore(db).List(ctx, userID)
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	out, _ := json.Marshal(map[string]interface{}{"wallets": list})
	return string(out), nil
}

// WalletUnlink removes a linked wallet the caller owns.
func WalletUnlink(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	userID, err := callerID(ctx)
	if err != nil {
		return "", err
	}
	var req struct {
		Address string `json:"address"`
	}
	if err := json.Unmarshal([]byte(payload), &req); err != nil || strings.TrimSpace(req.Address) == "" {
		return "", runtime.NewError("address required", 3)
	}
	if err := store.NewLinkedWalletStore(db).Unlink(ctx, userID, strings.TrimSpace(req.Address)); err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	return `{"ok":true}`, nil
}

// recoverEVM recovers the Ethereum address that produced a personal_sign (EIP-191)
// signature over `msg`, returning it lowercased with the 0x prefix.
func recoverEVM(msg, sigHex string) (string, error) {
	sig, err := hex.DecodeString(strings.TrimPrefix(strings.TrimSpace(sigHex), "0x"))
	if err != nil {
		return "", fmt.Errorf("bad signature hex")
	}
	if len(sig) != 65 {
		return "", fmt.Errorf("signature must be 65 bytes")
	}
	// EIP-191 personal_sign digest.
	prefixed := fmt.Sprintf("\x19Ethereum Signed Message:\n%d%s", len(msg), msg)
	digest := keccak256([]byte(prefixed))

	// MetaMask returns R||S||V with V in {27,28} (or {0,1}). decred's RecoverCompact
	// wants the recovery id + 27 in the FIRST byte.
	v := sig[64]
	if v >= 27 {
		v -= 27
	}
	if v != 0 && v != 1 {
		return "", fmt.Errorf("invalid recovery id")
	}
	compact := make([]byte, 65)
	compact[0] = 27 + v
	copy(compact[1:], sig[:64])

	pub, _, err := ecdsa.RecoverCompact(compact, digest)
	if err != nil {
		return "", fmt.Errorf("recover failed")
	}
	// EVM address = last 20 bytes of keccak256(uncompressed pubkey without 0x04 tag).
	uncompressed := pub.SerializeUncompressed()
	h := keccak256(uncompressed[1:])
	return "0x" + hex.EncodeToString(h[12:]), nil
}

// verifySolana checks an ed25519 signature over `msg` by the base58 pubkey
// `address`, returning the address unchanged on success.
func verifySolana(address, msg, sigB string) (string, error) {
	pub, err := base58Decode(address)
	if err != nil || len(pub) != ed25519.PublicKeySize {
		return "", fmt.Errorf("bad solana address")
	}
	// Accept hex or base58 signatures (Phantom returns raw bytes; clients encode).
	sig, err := hex.DecodeString(strings.TrimPrefix(strings.TrimSpace(sigB), "0x"))
	if err != nil {
		sig, err = base58Decode(sigB)
	}
	if err != nil || len(sig) != ed25519.SignatureSize {
		return "", fmt.Errorf("bad solana signature")
	}
	if !ed25519.Verify(pub, []byte(msg), sig) {
		return "", fmt.Errorf("ed25519 verify failed")
	}
	return address, nil
}

func keccak256(b []byte) []byte {
	h := sha3.NewLegacyKeccak256()
	h.Write(b)
	return h.Sum(nil)
}

const b58Alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"

// base58Decode decodes a base58 (Bitcoin/Solana alphabet) string to bytes.
func base58Decode(s string) ([]byte, error) {
	result := big.NewInt(0)
	radix := big.NewInt(58)
	for _, r := range s {
		idx := strings.IndexRune(b58Alphabet, r)
		if idx < 0 {
			return nil, fmt.Errorf("invalid base58 char")
		}
		result.Mul(result, radix)
		result.Add(result, big.NewInt(int64(idx)))
	}
	decoded := result.Bytes()
	// Restore leading zero bytes (each leading '1' == a zero byte).
	var leading int
	for _, r := range s {
		if r == '1' {
			leading++
		} else {
			break
		}
	}
	return append(make([]byte, leading), decoded...), nil
}
