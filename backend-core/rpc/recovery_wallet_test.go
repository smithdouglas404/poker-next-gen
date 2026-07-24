package rpc

import (
	"encoding/hex"
	"fmt"
	"strings"
	"testing"

	secp "github.com/decred/dcrd/dcrec/secp256k1/v4"
	"github.com/decred/dcrd/dcrec/secp256k1/v4/ecdsa"
)

// TestRecoverWalletMessageRoundTrip proves the positive path of wallet-based
// account recovery: a signature over recoveryWalletMessage(nonce) recovers the
// exact address that signed it, and a signature over the *link* message does NOT
// verify against the recovery message (so a link signature can't be replayed to
// take over an account). This is the cryptographic core the public recovery RPC
// relies on before it will reset any password.
func TestRecoverWalletMessageRoundTrip(t *testing.T) {
	priv, err := secp.GeneratePrivateKey()
	if err != nil {
		t.Fatalf("keygen: %v", err)
	}
	uncompressed := priv.PubKey().SerializeUncompressed()
	want := "0x" + hex.EncodeToString(keccak256(uncompressed[1:])[12:])

	sign := func(msg string) string {
		prefixed := fmt.Sprintf("\x19Ethereum Signed Message:\n%d%s", len(msg), msg)
		digest := keccak256([]byte(prefixed))
		compact := ecdsa.SignCompact(priv, digest, false)
		mm := make([]byte, 65)
		copy(mm[0:64], compact[1:65])
		mm[64] = compact[0]
		return "0x" + hex.EncodeToString(mm)
	}

	nonce := "a729984d93054715c36e48a6a5ab1e1f"
	recMsg := recoveryWalletMessage(nonce)
	got, err := recoverEVM(recMsg, sign(recMsg))
	if err != nil {
		t.Fatalf("recoverEVM(recovery): %v", err)
	}
	if !strings.EqualFold(got, want) {
		t.Fatalf("recovery: recovered %s, want %s", got, want)
	}

	// A signature made over the LINK message must not recover the same address
	// when checked against the RECOVERY message digest — the two flows are
	// domain-separated, so cross-message replay fails.
	linkSig := sign(linkMessage(nonce))
	if cross, err := recoverEVM(recMsg, linkSig); err == nil && strings.EqualFold(cross, want) {
		t.Fatalf("link-message signature replayed into recovery message")
	}
}
