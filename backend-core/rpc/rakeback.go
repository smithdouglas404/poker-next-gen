package rpc

import (
	"context"
	"database/sql"
	"encoding/json"

	"github.com/heroiclabs/nakama-common/runtime"

	"github.com/smithdouglas404/poker-next-gen/backend-core/billing"
	"github.com/smithdouglas404/poker-next-gen/backend-core/store"
)

// RakebackStatus returns the caller's claimable + lifetime rakeback and their
// tier's rakeback percent.
func RakebackStatus(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	userID, err := callerID(ctx)
	if err != nil {
		return "", err
	}
	balance, lifetime, err := store.NewRakebackStore(db).Get(ctx, userID)
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	pct := billing.GetTierDef(store.SubscriptionTier(ctx, db, userID)).RakebackPercent
	out, _ := json.Marshal(map[string]interface{}{
		"balance_cents":  balance,
		"lifetime_cents": lifetime,
		"percent":        pct,
	})
	return string(out), nil
}

// RakebackClaim moves the caller's accrued rakeback to their wallet.
func RakebackClaim(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	userID, err := callerID(ctx)
	if err != nil {
		return "", err
	}
	amount, err := store.NewRakebackStore(db).Claim(ctx, userID)
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	out, _ := json.Marshal(map[string]interface{}{
		"claimed_cents": amount,
	})
	return string(out), nil
}
