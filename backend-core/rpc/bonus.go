package rpc

import (
	"context"
	"database/sql"
	"encoding/json"
	"time"

	"github.com/heroiclabs/nakama-common/runtime"

	"github.com/smithdouglas404/poker-next-gen/backend-core/billing"
	"github.com/smithdouglas404/poker-next-gen/backend-core/store"
)

// DailyBonusStatus reports the caller's claimable daily bonus (chips scale with
// tier) and when it next becomes available.
func DailyBonusStatus(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	userID, err := callerID(ctx)
	if err != nil {
		return "", err
	}
	tier := store.SubscriptionTier(ctx, db, userID)
	chips := billing.GetTierDef(tier).DailyBonusChips
	last, streak, err := store.NewDailyBonusStore(db).Status(ctx, userID)
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	canClaim := true
	var nextAt *time.Time
	if last != nil {
		next := last.Add(20 * time.Hour)
		if time.Now().Before(next) {
			canClaim = false
			nextAt = &next
		}
	}
	out, _ := json.Marshal(map[string]interface{}{
		"chips":        chips,
		"can_claim":    canClaim,
		"streak":       streak,
		"next_claim_at": nextAt,
	})
	return string(out), nil
}

// DailyBonusClaim credits the tier's daily bonus (once per ~24h).
func DailyBonusClaim(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	userID, err := callerID(ctx)
	if err != nil {
		return "", err
	}
	tier := store.SubscriptionTier(ctx, db, userID)
	chips := billing.GetTierDef(tier).DailyBonusChips
	claimed, balance, err := store.NewDailyBonusStore(db).Claim(ctx, userID, chips)
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	if !claimed {
		out, _ := json.Marshal(map[string]interface{}{
			"claimed": false,
			"message": "Daily bonus already claimed — come back later.",
		})
		return string(out), nil
	}
	out, _ := json.Marshal(map[string]interface{}{
		"claimed":       true,
		"chips":         chips,
		"balance_cents": balance,
	})
	return string(out), nil
}
