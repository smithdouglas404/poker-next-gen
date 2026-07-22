package rpc

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"time"

	"github.com/heroiclabs/nakama-common/runtime"

	"github.com/smithdouglas404/poker-next-gen/backend-core/store"
)

// rgSHA256Hex is the shared hashing helper for the account-security domain
// (responsible gambling / 2FA / recovery / API keys). Backup codes, recovery
// codes, and API keys are all stored only as their SHA-256 hex digest — never in
// the clear.
func rgSHA256Hex(s string) string {
	sum := sha256.Sum256([]byte(s))
	return hex.EncodeToString(sum[:])
}

// rgFarFuture is the sentinel stored for a permanent self-exclusion.
var rgFarFuture = time.Date(9999, 12, 31, 0, 0, 0, 0, time.UTC)

// RgLimitsGet returns the caller's responsible-gambling configuration.
func RgLimitsGet(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	userID, err := callerID(ctx)
	if err != nil {
		return "", err
	}
	l, err := store.NewResponsibleStore(db).GetLimits(ctx, userID)
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	out, _ := json.Marshal(map[string]interface{}{"limits": l})
	return string(out), nil
}

// RgLimitsSet upserts the caller's deposit / loss / session limits. Values of 0
// clear the corresponding limit (unlimited). Cool-off and self-exclusion windows
// are managed by their own RPCs and left untouched here.
func RgLimitsSet(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	userID, err := callerID(ctx)
	if err != nil {
		return "", err
	}
	var req struct {
		DepositDailyCents   int64 `json:"deposit_daily_cents"`
		DepositWeeklyCents  int64 `json:"deposit_weekly_cents"`
		DepositMonthlyCents int64 `json:"deposit_monthly_cents"`
		LossDailyCents      int64 `json:"loss_daily_cents"`
		SessionMinutes      int64 `json:"session_minutes"`
	}
	if payload != "" {
		if err := json.Unmarshal([]byte(payload), &req); err != nil {
			return "", runtime.NewError("invalid payload", 3)
		}
	}
	if req.DepositDailyCents < 0 || req.DepositWeeklyCents < 0 || req.DepositMonthlyCents < 0 ||
		req.LossDailyCents < 0 || req.SessionMinutes < 0 {
		return "", runtime.NewError("limits must be non-negative", 3)
	}
	l := &store.RgLimit{
		UserID:              userID,
		DepositDailyCents:   req.DepositDailyCents,
		DepositWeeklyCents:  req.DepositWeeklyCents,
		DepositMonthlyCents: req.DepositMonthlyCents,
		LossDailyCents:      req.LossDailyCents,
		SessionMinutes:      req.SessionMinutes,
	}
	if err := store.NewResponsibleStore(db).SetLimits(ctx, l); err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	out, _ := json.Marshal(map[string]interface{}{"ok": true, "limits": l})
	return string(out), nil
}

// RgCoolOff arms a short, self-lifting cool-off break. Payload accepts `hours`
// (preferred) or `days`; defaults to 24 hours.
func RgCoolOff(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	userID, err := callerID(ctx)
	if err != nil {
		return "", err
	}
	var req struct {
		Hours int64 `json:"hours"`
		Days  int64 `json:"days"`
	}
	if payload != "" {
		_ = json.Unmarshal([]byte(payload), &req)
	}
	hours := req.Hours + req.Days*24
	if hours <= 0 {
		hours = 24
	}
	// Cool-off is a short break by design; cap it at 30 days (use self-exclude for
	// anything longer).
	if hours > 30*24 {
		hours = 30 * 24
	}
	until := time.Now().UTC().Add(time.Duration(hours) * time.Hour)
	if err := store.NewResponsibleStore(db).SetCoolOff(ctx, userID, until); err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	out, _ := json.Marshal(map[string]interface{}{"ok": true, "cool_off_until": until})
	return string(out), nil
}

// RgSelfExclude arms a self-exclusion window. Payload accepts `days`, or
// `permanent: true` for an indefinite exclusion. A minimum of 1 day is enforced;
// self-exclusion cannot be lifted early by the player.
func RgSelfExclude(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	userID, err := callerID(ctx)
	if err != nil {
		return "", err
	}
	var req struct {
		Days      int64 `json:"days"`
		Permanent bool  `json:"permanent"`
	}
	if payload != "" {
		_ = json.Unmarshal([]byte(payload), &req)
	}
	var until time.Time
	if req.Permanent {
		until = rgFarFuture
	} else {
		days := req.Days
		if days < 1 {
			days = 1
		}
		until = time.Now().UTC().AddDate(0, 0, int(days))
	}
	if err := store.NewResponsibleStore(db).SetSelfExcluded(ctx, userID, until); err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	out, _ := json.Marshal(map[string]interface{}{"ok": true, "self_excluded_until": until, "permanent": req.Permanent})
	return string(out), nil
}
