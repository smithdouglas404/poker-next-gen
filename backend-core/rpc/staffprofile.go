package rpc

import (
	"context"
	"database/sql"
	"encoding/json"

	"github.com/heroiclabs/nakama-common/runtime"

	"github.com/smithdouglas404/poker-next-gen/backend-core/store"
)

// Comprehensive staff player profile (_16). Assembles a player's performance,
// responsible-gambling limits, and moderation flag for the staff dashboard, plus
// the two mutations the dashboard exposes beyond the existing wallet adjust:
// Edit Limit (writes the ENFORCED rg deposit limit) and Flag. All admin-gated.

// AdminPlayerProfile returns performance + limits + flag + loyalty for one user.
func AdminPlayerProfile(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	if _, err := adminCaller(ctx); err != nil {
		return "", err
	}
	var req struct {
		UserID string `json:"user_id"`
	}
	if err := json.Unmarshal([]byte(payload), &req); err != nil || req.UserID == "" {
		return "", runtime.NewError("user_id required", 3)
	}
	stats, err := store.NewStatsStore(db).Aggregate(ctx, req.UserID, "")
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	limits, err := store.NewResponsibleStore(db).GetLimits(ctx, req.UserID)
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	flag, err := store.NewPlayerFlagStore(db).Get(ctx, req.UserID)
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	loy, _ := store.NewLoyaltyStore(db).Get(ctx, req.UserID)
	out, _ := json.Marshal(map[string]interface{}{
		"user_id": req.UserID,
		"stats":   stats,
		"limits":  limits,
		"flag":    flag,
		"loyalty": loy,
	})
	return string(out), nil
}

// AdminPlayerSetLimit sets a player's daily deposit limit through the same
// enforced rg-limit store the player's own controls use. cents=0 clears it.
func AdminPlayerSetLimit(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	admin, err := adminCaller(ctx)
	if err != nil {
		return "", err
	}
	var req struct {
		UserID            string `json:"user_id"`
		DepositDailyCents int64  `json:"deposit_daily_cents"`
	}
	if err := json.Unmarshal([]byte(payload), &req); err != nil || req.UserID == "" {
		return "", runtime.NewError("user_id required", 3)
	}
	if req.DepositDailyCents < 0 {
		return "", runtime.NewError("limit must be >= 0", 3)
	}
	rs := store.NewResponsibleStore(db)
	cur, err := rs.GetLimits(ctx, req.UserID)
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	cur.DepositDailyCents = req.DepositDailyCents // preserve weekly/monthly/loss/session
	if err := rs.SetLimits(ctx, cur); err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	adminAuditDetail(ctx, logger, db, admin, "player_set_limit", req.UserID, req)
	out, _ := json.Marshal(map[string]interface{}{"ok": true, "limits": cur})
	return string(out), nil
}

// AdminPlayerFlag sets or clears a staff moderation flag on a player.
func AdminPlayerFlag(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	admin, err := adminCaller(ctx)
	if err != nil {
		return "", err
	}
	var req struct {
		UserID  string `json:"user_id"`
		Flagged bool   `json:"flagged"`
		Reason  string `json:"reason"`
	}
	if err := json.Unmarshal([]byte(payload), &req); err != nil || req.UserID == "" {
		return "", runtime.NewError("user_id required", 3)
	}
	if err := store.NewPlayerFlagStore(db).Set(ctx, req.UserID, req.Flagged, req.Reason, admin); err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	adminAuditDetail(ctx, logger, db, admin, "player_flag", req.UserID, req)
	return `{"ok":true}`, nil
}
