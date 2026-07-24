package rpc

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"os"
	"strings"
	"time"

	"github.com/heroiclabs/nakama-common/runtime"

	"github.com/smithdouglas404/poker-next-gen/backend-core/store"
)

// Account recovery RPCs are intentionally PUBLIC (server-key / HTTP, no user
// session) — a locked-out player has no auth token. They therefore never call
// callerID; the email plus a single-use code is the credential. Responses are
// deliberately uniform so an attacker cannot enumerate which emails have
// accounts.

// recGenCode returns a short single-use recovery code (10 hex chars).
func recGenCode() string {
	var b [5]byte
	_, _ = rand.Read(b[:])
	return hex.EncodeToString(b[:])
}

// AccountRecoveryRequestEmail issues an email-recovery code for an account. It
// always reports success (even for unknown emails) to avoid account enumeration.
// The code is delivered out-of-band by email; only its hash is stored.
func AccountRecoveryRequestEmail(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	var req struct {
		Email string `json:"email"`
	}
	if err := json.Unmarshal([]byte(payload), &req); err != nil {
		return "", runtime.NewError("invalid payload", 3)
	}
	email := strings.ToLower(strings.TrimSpace(req.Email))
	if email == "" {
		return "", runtime.NewError("email required", 3)
	}

	rs := store.NewResponsibleStore(db)
	userID, err := rs.ResolveUserByEmail(ctx, email)
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	if userID != "" {
		code := recGenCode()
		expires := time.Now().UTC().Add(30 * time.Minute)
		if err := rs.CreateRecoveryCode(ctx, userID, email, rgSHA256Hex(code), expires); err != nil {
			return "", runtime.NewError(err.Error(), 13)
		}
		// Delivery is out-of-band (email). Without a mail integration configured the
		// code is only observable via server logs in a dev environment.
		if os.Getenv("RECOVERY_DEBUG") == "1" {
			logger.Info("recovery code for %s: %s", email, code)
		}
	}
	return `{"ok":true}`, nil
}

// AccountRecoveryVerifyEmail consumes a valid email-recovery code and sets a new
// password on the account.
func AccountRecoveryVerifyEmail(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	var req struct {
		Email       string `json:"email"`
		Code        string `json:"code"`
		NewPassword string `json:"new_password"`
	}
	if err := json.Unmarshal([]byte(payload), &req); err != nil {
		return "", runtime.NewError("invalid payload", 3)
	}
	email := strings.ToLower(strings.TrimSpace(req.Email))
	code := strings.TrimSpace(req.Code)
	if email == "" || code == "" {
		return "", runtime.NewError("email and code required", 3)
	}
	if len(req.NewPassword) < 8 {
		return "", runtime.NewError("new password must be at least 8 characters", 3)
	}

	rs := store.NewResponsibleStore(db)
	userID, err := rs.ConsumeRecoveryCode(ctx, email, rgSHA256Hex(code))
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	if userID == "" {
		return "", runtime.NewError("invalid or expired code", 7)
	}
	if err := nk.LinkEmail(ctx, userID, email, req.NewPassword); err != nil {
		return "", runtime.NewError("could not reset password", 13)
	}
	return `{"ok":true}`, nil
}

// AccountRecoveryBackupCode recovers an account using a 2FA backup code (for a
// player who lost their authenticator). It consumes the backup code, resets the
// password, and disables 2FA so the player can re-enrol.
func AccountRecoveryBackupCode(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	var req struct {
		Email       string `json:"email"`
		BackupCode  string `json:"backup_code"`
		NewPassword string `json:"new_password"`
	}
	if err := json.Unmarshal([]byte(payload), &req); err != nil {
		return "", runtime.NewError("invalid payload", 3)
	}
	email := strings.ToLower(strings.TrimSpace(req.Email))
	backup := strings.TrimSpace(req.BackupCode)
	if email == "" || backup == "" {
		return "", runtime.NewError("email and backup_code required", 3)
	}
	if len(req.NewPassword) < 8 {
		return "", runtime.NewError("new password must be at least 8 characters", 3)
	}

	rs := store.NewResponsibleStore(db)
	userID, err := rs.ResolveUserByEmail(ctx, email)
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	if userID == "" {
		return "", runtime.NewError("invalid backup code", 7)
	}
	used, err := rs.ConsumeBackupCode(ctx, userID, rgSHA256Hex(backup))
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	if !used {
		return "", runtime.NewError("invalid backup code", 7)
	}
	if err := nk.LinkEmail(ctx, userID, email, req.NewPassword); err != nil {
		return "", runtime.NewError("could not reset password", 13)
	}
	// A lost authenticator means 2FA must be re-enrolled from scratch.
	_ = rs.DeleteTwoFA(ctx, userID)

	return `{"ok":true}`, nil
}

// recoveryWalletMessage is the exact string a recovering player signs with their
// linked wallet. Distinct from the link-flow message so a link signature can
// never be replayed to recover an account.
func recoveryWalletMessage(nonce string) string {
	return "High Rollers Club: recover account\nnonce: " + nonce
}

// AccountRecoveryWalletChallenge issues a signing nonce for wallet-based
// recovery. PUBLIC (a locked-out player has no session). Given a wallet address,
// it resolves the single account that verified it and mints a single-use nonce
// bound to that account. The response is uniform whether or not the address is
// linked (a random, unstored nonce is returned for unknown addresses) so an
// attacker cannot enumerate which addresses map to accounts.
func AccountRecoveryWalletChallenge(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	var req struct {
		Address string `json:"address"`
	}
	if err := json.Unmarshal([]byte(payload), &req); err != nil {
		return "", runtime.NewError("invalid payload", 3)
	}
	address := strings.TrimSpace(req.Address)
	if address == "" {
		return "", runtime.NewError("address required", 3)
	}

	ls := store.NewLinkedWalletStore(db)
	userID, _, err := ls.FindByAddress(ctx, address)
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}

	var nonce string
	if userID != "" {
		nonce, err = ls.IssueNonce(ctx, userID)
		if err != nil {
			return "", runtime.NewError(err.Error(), 13)
		}
	} else {
		// Unknown/ambiguous address → a decoy nonce that will never consume.
		var b [16]byte
		_, _ = rand.Read(b[:])
		nonce = hex.EncodeToString(b[:])
	}
	out, _ := json.Marshal(map[string]interface{}{
		"ok":      true,
		"nonce":   nonce,
		"message": recoveryWalletMessage(nonce),
	})
	return string(out), nil
}

// AccountRecoveryWalletVerify completes wallet-based recovery. PUBLIC. It
// cryptographically verifies the signature over recoveryWalletMessage(nonce),
// confirms the recovered address is a verified linked wallet, resolves the owning
// account, consumes the nonce, and resets that account's email password. Because
// only a wallet the account itself already linked (via the #91 signature-proven
// flow) can satisfy this, possession of a random public address is not enough.
func AccountRecoveryWalletVerify(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	var req struct {
		Address     string `json:"address"`
		Chain       string `json:"chain"`
		Nonce       string `json:"nonce"`
		Signature   string `json:"signature"`
		NewPassword string `json:"new_password"`
	}
	if err := json.Unmarshal([]byte(payload), &req); err != nil {
		return "", runtime.NewError("invalid payload", 3)
	}
	req.Address = strings.TrimSpace(req.Address)
	if req.Address == "" || req.Nonce == "" || req.Signature == "" {
		return "", runtime.NewError("address, nonce and signature required", 3)
	}
	if len(req.NewPassword) < 8 {
		return "", runtime.NewError("new password must be at least 8 characters", 3)
	}

	// 1) Verify the signature and recover the address that actually signed.
	msg := recoveryWalletMessage(req.Nonce)
	var verifiedAddr string
	var err error
	switch strings.ToLower(req.Chain) {
	case "solana":
		verifiedAddr, err = verifySolana(req.Address, msg, req.Signature)
	default:
		verifiedAddr, err = recoverEVM(msg, req.Signature)
	}
	if err != nil || !strings.EqualFold(verifiedAddr, req.Address) {
		return "", runtime.NewError("invalid signature or address", 7)
	}

	// 2) The recovered address must be a verified linked wallet of exactly one
	//    account — that account is the recovery target.
	ls := store.NewLinkedWalletStore(db)
	userID, _, err := ls.FindByAddress(ctx, verifiedAddr)
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	if userID == "" {
		return "", runtime.NewError("wallet is not linked to a recoverable account", 7)
	}

	// 3) Consume the single-use nonce bound to that account (proves this exact
	//    challenge was issued for this account and has not expired/been reused).
	ok, err := ls.ConsumeNonce(ctx, userID, req.Nonce, walletNonceTTL)
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	if !ok {
		return "", runtime.NewError("challenge expired or unknown — request a new one", 7)
	}

	// 4) Reset the account's email password (parity with email/backup recovery).
	acct, err := nk.AccountGetId(ctx, userID)
	if err != nil {
		return "", runtime.NewError("could not load account", 13)
	}
	email := strings.TrimSpace(acct.GetEmail())
	if email == "" {
		return "", runtime.NewError("account has no email identity to reset — contact support", 9)
	}
	if err := nk.LinkEmail(ctx, userID, email, req.NewPassword); err != nil {
		return "", runtime.NewError("could not reset password", 13)
	}
	return `{"ok":true}`, nil
}
