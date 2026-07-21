package rpc

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"os"

	"github.com/heroiclabs/nakama-common/runtime"

	"github.com/smithdouglas404/poker-next-gen/backend-core/integrations"
	"github.com/smithdouglas404/poker-next-gen/backend-core/store"
)

var kycLevels = map[string]bool{"basic": true, "standard": true, "full": true, "enhanced": true}

// KycStart opens a Didit verification session for the requested KYC level and
// returns the hosted verification URL. Progressive: each level maps to a Didit
// workflow with escalating checks. No-ops with a clear error until DIDIT_API_KEY
// (and the level's workflow id) are configured.
func KycStart(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	userID, err := callerID(ctx)
	if err != nil {
		return "", err
	}
	var req struct {
		Level string `json:"level"`
	}
	if payload != "" {
		_ = json.Unmarshal([]byte(payload), &req)
	}
	if !kycLevels[req.Level] {
		return "", runtime.NewError("level must be one of: basic, standard, full, enhanced", 3)
	}
	if !integrations.DiditConfigured() {
		return "", runtime.NewError("identity verification is not enabled yet (DIDIT_API_KEY unset)", 9)
	}
	workflow := integrations.DiditWorkflowFor(req.Level)
	if workflow == "" {
		return "", runtime.NewError(fmt.Sprintf("no Didit workflow configured for level %q", req.Level), 9)
	}
	callback := ""
	if base := os.Getenv("APP_BASE_URL"); base != "" {
		callback = base + "/membership?kyc=complete"
	}
	sess, err := integrations.CreateDiditSession(userID, workflow, callback)
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	// Record the target level as pending; the webhook flips it to verified while
	// preserving this level.
	data, _ := json.Marshal(map[string]string{"session_id": sess.SessionID, "provider": "didit"})
	if err := store.NewKYCStore(db).Submit(ctx, userID, req.Level, string(data)); err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	out, _ := json.Marshal(map[string]any{
		"url":        sess.URL,
		"session_id": sess.SessionID,
		"status":     sess.Status,
		"level":      req.Level,
	})
	return string(out), nil
}

// KycApply is the server-to-server webhook apply path. Our Next.js /api/kyc/webhook
// route verifies Didit's HMAC signature, then calls this with a shared secret so a
// verified/declined result updates the store. Protected by KYC_APPLY_SECRET (falls
// back to DIDIT_WEBHOOK_SECRET) — NOT meant for direct client use.
func KycApply(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	var req struct {
		UserID string `json:"user_id"`
		Status string `json:"status"`
		Level  string `json:"level"`
		Reason string `json:"reason"`
		Secret string `json:"secret"`
	}
	if payload != "" {
		_ = json.Unmarshal([]byte(payload), &req)
	}
	secret := os.Getenv("KYC_APPLY_SECRET")
	if secret == "" {
		secret = os.Getenv("DIDIT_WEBHOOK_SECRET")
	}
	if secret == "" || req.Secret != secret {
		return "", runtime.NewError("unauthorized", 16)
	}
	if req.UserID == "" {
		return "", runtime.NewError("user_id required", 3)
	}
	status := "pending"
	switch {
	case eqFold(req.Status, "approved", "verified"):
		status = "verified"
	case eqFold(req.Status, "declined", "rejected", "abandoned", "expired"):
		status = "rejected"
	}
	if err := store.NewKYCStore(db).SetStatus(ctx, req.UserID, status, req.Level, req.Reason, "didit"); err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	out, _ := json.Marshal(map[string]any{"ok": true, "status": status})
	return string(out), nil
}

func eqFold(s string, opts ...string) bool {
	for _, o := range opts {
		if len(s) == len(o) {
			match := true
			for i := 0; i < len(s); i++ {
				a, b := s[i], o[i]
				if a >= 'A' && a <= 'Z' {
					a += 32
				}
				if a != b {
					match = false
					break
				}
			}
			if match {
				return true
			}
		}
	}
	return false
}

// KycStatus returns the caller's identity-verification state.
func KycStatus(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	userID, err := callerID(ctx)
	if err != nil {
		return "", err
	}
	k, err := store.NewKYCStore(db).Get(ctx, userID)
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	out, _ := json.Marshal(map[string]interface{}{"kyc": k})
	return string(out), nil
}

// KycSubmit records a manual KYC submission (→ pending) for admin review. The
// caller supplies identity fields; documents/backing files are handled out of
// band. This is the fallback path when a live provider (Didit/Sumsub) is not
// configured.
func KycSubmit(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	userID, err := callerID(ctx)
	if err != nil {
		return "", err
	}
	var req struct {
		Level string          `json:"level"`
		Data  json.RawMessage `json:"data"`
	}
	if payload != "" {
		_ = json.Unmarshal([]byte(payload), &req)
	}
	if req.Level == "" {
		req.Level = "basic"
	}
	dataJSON := "{}"
	if len(req.Data) > 0 {
		dataJSON = string(req.Data)
	}
	if err := store.NewKYCStore(db).Submit(ctx, userID, req.Level, dataJSON); err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	k, _ := store.NewKYCStore(db).Get(ctx, userID)
	out, _ := json.Marshal(map[string]interface{}{"kyc": k})
	return string(out), nil
}

// KycVerifyAdmin is the server-authoritative decision (verify/reject). Gated to
// ADMIN_USER_IDS. When a live KYC provider is wired, its verified webhook calls
// the same store path instead.
func KycVerifyAdmin(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	callerUserID, _ := ctx.Value(runtime.RUNTIME_CTX_USER_ID).(string)
	if !isAdmin(callerUserID) {
		return "", runtime.NewError("forbidden", 7)
	}
	var req struct {
		UserID string `json:"user_id"`
		Status string `json:"status"`
		Level  string `json:"level"`
		Reason string `json:"reason"`
	}
	if err := json.Unmarshal([]byte(payload), &req); err != nil {
		return "", runtime.NewError("invalid payload", 3)
	}
	if req.UserID == "" || (req.Status != "verified" && req.Status != "rejected") {
		return "", runtime.NewError("user_id and status (verified|rejected) required", 3)
	}
	if err := store.NewKYCStore(db).SetStatus(ctx, req.UserID, req.Status, req.Level, req.Reason, "admin"); err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	k, _ := store.NewKYCStore(db).Get(ctx, req.UserID)
	out, _ := json.Marshal(map[string]interface{}{"kyc": k})
	return string(out), nil
}
