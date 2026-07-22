package rpc

import (
	"context"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha1"
	"crypto/subtle"
	"database/sql"
	"encoding/base32"
	"encoding/binary"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/url"
	"strings"
	"time"

	"github.com/heroiclabs/nakama-common/runtime"

	"github.com/smithdouglas404/poker-next-gen/backend-core/store"
)

// secB32 is the RFC 4648 base32 alphabet without padding — the format
// authenticator apps expect for a TOTP secret.
var secB32 = base32.StdEncoding.WithPadding(base32.NoPadding)

// secTOTPIssuer is the label shown in the authenticator app.
const secTOTPIssuer = "PokerNextGen"

// secGenerateSecret returns a fresh base32 TOTP secret (160 bits).
func secGenerateSecret() string {
	var b [20]byte
	_, _ = rand.Read(b[:])
	return secB32.EncodeToString(b[:])
}

// secOtpauthURL builds the otpauth:// provisioning URI an authenticator scans.
func secOtpauthURL(account, secret string) string {
	label := url.PathEscape(secTOTPIssuer + ":" + account)
	q := url.Values{}
	q.Set("secret", secret)
	q.Set("issuer", secTOTPIssuer)
	q.Set("algorithm", "SHA1")
	q.Set("digits", "6")
	q.Set("period", "30")
	return "otpauth://totp/" + label + "?" + q.Encode()
}

// secTOTPAt computes the 6-digit TOTP for a given 30-second counter.
func secTOTPAt(secret string, counter uint64) string {
	key, err := secB32.DecodeString(strings.ToUpper(strings.TrimSpace(secret)))
	if err != nil {
		return ""
	}
	var msg [8]byte
	binary.BigEndian.PutUint64(msg[:], counter)
	h := hmac.New(sha1.New, key)
	h.Write(msg[:])
	sum := h.Sum(nil)
	offset := sum[len(sum)-1] & 0x0f
	code := (uint32(sum[offset]&0x7f) << 24) |
		(uint32(sum[offset+1]) << 16) |
		(uint32(sum[offset+2]) << 8) |
		uint32(sum[offset+3])
	return fmt.Sprintf("%06d", code%1000000)
}

// secTOTPVerify checks a code against the secret, allowing ±1 step of clock
// drift. Comparison is constant-time.
func secTOTPVerify(secret, code string) bool {
	code = strings.TrimSpace(code)
	if len(code) != 6 || secret == "" {
		return false
	}
	counter := uint64(time.Now().Unix() / 30)
	for _, d := range []int64{-1, 0, 1} {
		want := secTOTPAt(secret, uint64(int64(counter)+d))
		if want != "" && subtle.ConstantTimeCompare([]byte(want), []byte(code)) == 1 {
			return true
		}
	}
	return false
}

// secGenerateBackupCodes returns n plaintext single-use recovery codes.
func secGenerateBackupCodes(n int) []string {
	out := make([]string, 0, n)
	for i := 0; i < n; i++ {
		var b [5]byte
		_, _ = rand.Read(b[:])
		out = append(out, hex.EncodeToString(b[:]))
	}
	return out
}

// Auth2FASetup provisions (or re-provisions) TOTP for the caller. It returns the
// otpauth URL, the raw secret, and one-time backup codes — all shown to the
// player exactly once. 2FA is not active until auth_2fa_verify confirms a code.
func Auth2FASetup(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	userID, err := callerID(ctx)
	if err != nil {
		return "", err
	}
	account := userID
	if u, _ := ctx.Value(runtime.RUNTIME_CTX_USERNAME).(string); u != "" {
		account = u
	}

	secret := secGenerateSecret()
	backup := secGenerateBackupCodes(10)
	hashed := make([]string, len(backup))
	for i, c := range backup {
		hashed[i] = rgSHA256Hex(c)
	}
	if err := store.NewResponsibleStore(db).UpsertTwoFA(ctx, userID, secret, hashed); err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}

	out, _ := json.Marshal(map[string]interface{}{
		"otpauth_url":  secOtpauthURL(account, secret),
		"secret":       secret,
		"backup_codes": backup,
	})
	return string(out), nil
}

// Auth2FAVerify confirms a TOTP code and activates 2FA on the account.
func Auth2FAVerify(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	userID, err := callerID(ctx)
	if err != nil {
		return "", err
	}
	var req struct {
		Code string `json:"code"`
	}
	if err := json.Unmarshal([]byte(payload), &req); err != nil || req.Code == "" {
		return "", runtime.NewError("code required", 3)
	}
	rs := store.NewResponsibleStore(db)
	t, err := rs.GetTwoFA(ctx, userID)
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	if t == nil {
		return "", runtime.NewError("start 2FA setup first", 9)
	}
	if !secTOTPVerify(t.Secret, req.Code) {
		return "", runtime.NewError("invalid code", 3)
	}
	if err := rs.SetTwoFAEnabled(ctx, userID, true); err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	return `{"ok":true,"enabled":true}`, nil
}

// Auth2FADisable turns off 2FA after a valid current code (TOTP or backup).
func Auth2FADisable(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	userID, err := callerID(ctx)
	if err != nil {
		return "", err
	}
	var req struct {
		Code string `json:"code"`
	}
	if err := json.Unmarshal([]byte(payload), &req); err != nil || req.Code == "" {
		return "", runtime.NewError("code required", 3)
	}
	rs := store.NewResponsibleStore(db)
	t, err := rs.GetTwoFA(ctx, userID)
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	if t == nil || !t.Enabled {
		return "", runtime.NewError("2FA is not enabled", 9)
	}
	ok := secTOTPVerify(t.Secret, req.Code)
	if !ok {
		if used, _ := rs.ConsumeBackupCode(ctx, userID, rgSHA256Hex(strings.TrimSpace(req.Code))); used {
			ok = true
		}
	}
	if !ok {
		return "", runtime.NewError("invalid code", 3)
	}
	if err := rs.DeleteTwoFA(ctx, userID); err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	return `{"ok":true,"enabled":false}`, nil
}

// AuthChangePassword verifies the caller's current password and sets a new one.
// It re-authenticates against the account's email (proof of the current secret),
// then relinks the email with the new password.
func AuthChangePassword(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	userID, err := callerID(ctx)
	if err != nil {
		return "", err
	}
	var req struct {
		CurrentPassword string `json:"current_password"`
		NewPassword     string `json:"new_password"`
	}
	if err := json.Unmarshal([]byte(payload), &req); err != nil {
		return "", runtime.NewError("invalid payload", 3)
	}
	if len(req.NewPassword) < 8 {
		return "", runtime.NewError("new password must be at least 8 characters", 3)
	}
	acct, err := nk.AccountGetId(ctx, userID)
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	email := ""
	if acct != nil && acct.Email != "" {
		email = acct.Email
	}
	if email == "" {
		return "", runtime.NewError("no email password is set on this account", 9)
	}
	if _, _, _, err := nk.AuthenticateEmail(ctx, email, req.CurrentPassword, "", false); err != nil {
		return "", runtime.NewError("current password is incorrect", 7)
	}
	if err := nk.LinkEmail(ctx, userID, email, req.NewPassword); err != nil {
		return "", runtime.NewError("could not update password", 13)
	}
	return `{"ok":true}`, nil
}

// ApiKeyCreate mints a personal API key. The raw key is returned exactly once;
// only its SHA-256 hash and a short display prefix are persisted.
func ApiKeyCreate(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	userID, err := callerID(ctx)
	if err != nil {
		return "", err
	}
	var req struct {
		Label string `json:"label"`
	}
	if payload != "" {
		_ = json.Unmarshal([]byte(payload), &req)
	}
	req.Label = strings.TrimSpace(req.Label)
	if req.Label == "" {
		req.Label = "API key"
	}

	var raw [24]byte
	if _, err := rand.Read(raw[:]); err != nil {
		return "", runtime.NewError("key generation failed", 13)
	}
	key := "pk_" + hex.EncodeToString(raw[:])
	prefix := key[:11] // "pk_" + 8 hex chars, safe to display
	id, err := store.NewResponsibleStore(db).CreateApiKey(ctx, userID, req.Label, prefix, rgSHA256Hex(key))
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	out, _ := json.Marshal(map[string]interface{}{
		"id":     id,
		"label":  req.Label,
		"prefix": prefix,
		"key":    key,
	})
	return string(out), nil
}

// ApiKeyList returns the caller's API keys (never the raw secret or hash).
func ApiKeyList(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	userID, err := callerID(ctx)
	if err != nil {
		return "", err
	}
	keys, err := store.NewResponsibleStore(db).ListApiKeys(ctx, userID)
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	out, _ := json.Marshal(map[string]interface{}{"api_keys": keys})
	return string(out), nil
}

// ApiKeyRevoke revokes one of the caller's keys.
func ApiKeyRevoke(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	userID, err := callerID(ctx)
	if err != nil {
		return "", err
	}
	var req struct {
		ID string `json:"id"`
	}
	if err := json.Unmarshal([]byte(payload), &req); err != nil || req.ID == "" {
		return "", runtime.NewError("id required", 3)
	}
	ok, err := store.NewResponsibleStore(db).RevokeApiKey(ctx, userID, req.ID)
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	if !ok {
		return "", runtime.NewError("api key not found", 5)
	}
	return `{"ok":true}`, nil
}
