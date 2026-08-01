package rpc

import (
	"context"
	"database/sql"
	"encoding/json"

	"github.com/heroiclabs/nakama-common/runtime"

	"github.com/smithdouglas404/poker-next-gen/backend-core/store"
)

func WalletGet(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	userID, ok := ctx.Value(runtime.RUNTIME_CTX_USER_ID).(string)
	if !ok || userID == "" {
		return "", runtime.NewError("unauthorized", 16)
	}
	bal, err := store.NewWalletStore(db).Get(ctx, userID)
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	out, _ := json.Marshal(map[string]interface{}{
		"user_id":       userID,
		"balance_cents": bal,
	})
	return string(out), nil
}

// WalletLedger returns the caller's recent wallet movements (the new
// append-only ledger backing every debit/credit).
func WalletLedger(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	userID, ok := ctx.Value(runtime.RUNTIME_CTX_USER_ID).(string)
	if !ok || userID == "" {
		return "", runtime.NewError("unauthorized", 16)
	}
	var req struct {
		Limit int `json:"limit"`
	}
	if payload != "" {
		_ = json.Unmarshal([]byte(payload), &req)
	}
	entries, err := store.NewWalletStore(db).LedgerList(ctx, userID, req.Limit)
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	out, _ := json.Marshal(map[string]interface{}{"user_id": userID, "ledger": entries})
	return string(out), nil
}

func ProfileGet(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	userID, ok := ctx.Value(runtime.RUNTIME_CTX_USER_ID).(string)
	if !ok || userID == "" {
		return "", runtime.NewError("unauthorized", 16)
	}
	username, _ := ctx.Value(runtime.RUNTIME_CTX_USERNAME).(string)
	bal, err := store.NewWalletStore(db).Get(ctx, userID)
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	// Real join date, not a fabricated one — Nakama already tracks account
	// creation time; the frontend was previously hardcoding "2020-05-15" for
	// every player. Best-effort: a lookup failure omits the field rather than
	// failing the whole profile fetch.
	memberSince := ""
	if acct, aerr := nk.AccountGetId(ctx, userID); aerr == nil && acct.GetUser().GetCreateTime() != nil {
		memberSince = acct.GetUser().GetCreateTime().AsTime().UTC().Format("2006-01-02")
	}
	out, _ := json.Marshal(map[string]interface{}{
		"user_id":       userID,
		"username":      username,
		"balance_cents": bal,
		"member_since":  memberSince,
	})
	return string(out), nil
}
