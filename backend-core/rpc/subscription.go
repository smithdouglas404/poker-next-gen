package rpc

import (
	"context"
	"database/sql"
	"encoding/json"
	"os"
	"strings"

	"github.com/heroiclabs/nakama-common/runtime"

	"github.com/smithdouglas404/poker-next-gen/backend-core/billing"
	"github.com/smithdouglas404/poker-next-gen/backend-core/store"
)

// SubscriptionTiers returns the full membership catalog (prices + limits +
// benefits). Public — used by the pricing/upgrade UI.
func SubscriptionTiers(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	out, _ := json.Marshal(map[string]interface{}{
		"tiers": billing.Tiers,
		"order": billing.TierOrder,
	})
	return string(out), nil
}

// SubscriptionStatus returns the caller's current membership + the limits it
// unlocks. Reading applies lazy expiry (a lapsed paid tier reverts to free).
func SubscriptionStatus(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	userID, ok := ctx.Value(runtime.RUNTIME_CTX_USER_ID).(string)
	if !ok || userID == "" {
		return "", runtime.NewError("unauthorized", 16)
	}
	sub, err := store.NewSubscriptionStore(db).Get(ctx, userID)
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	out, _ := json.Marshal(map[string]interface{}{
		"subscription": sub,
		"tier":         billing.GetTierDef(sub.Tier),
		"billing_configured": stripeConfigured(),
	})
	return string(out), nil
}

// SubscriptionGrantAdmin manually grants a tier. Gated to admin user ids listed
// in the ADMIN_USER_IDS env var (comma-separated). Disabled when unset. This is
// a back-office path (comps, support) — the normal path is the Stripe webhook.
func SubscriptionGrantAdmin(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	callerID, _ := ctx.Value(runtime.RUNTIME_CTX_USER_ID).(string)
	if !isAdmin(callerID) {
		return "", runtime.NewError("forbidden", 7)
	}
	var req struct {
		UserID string `json:"user_id"`
		Tier   string `json:"tier"`
		Months int    `json:"months"`
	}
	if err := json.Unmarshal([]byte(payload), &req); err != nil {
		return "", runtime.NewError("invalid payload", 3)
	}
	if req.UserID == "" || !billing.IsValidTier(req.Tier) {
		return "", runtime.NewError("user_id and valid tier required", 3)
	}
	sub, err := store.NewSubscriptionStore(db).Grant(ctx, req.UserID, req.Tier, req.Months, "admin", callerID, "", "")
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	out, _ := json.Marshal(map[string]interface{}{"subscription": sub})
	return string(out), nil
}

func isAdmin(userID string) bool {
	if userID == "" {
		return false
	}
	for _, id := range strings.Split(os.Getenv("ADMIN_USER_IDS"), ",") {
		if strings.TrimSpace(id) == userID {
			return true
		}
	}
	return false
}
