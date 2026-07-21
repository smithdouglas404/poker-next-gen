package rpc

import (
	"context"
	"database/sql"
	"encoding/json"

	"github.com/heroiclabs/nakama-common/runtime"

	"github.com/smithdouglas404/poker-next-gen/backend-core/store"
)

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
