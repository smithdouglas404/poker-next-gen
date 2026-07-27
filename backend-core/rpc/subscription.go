package rpc

import (
	"context"
	"database/sql"
	"encoding/json"
	"os"
	"strings"
	"time"

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
//
// Comping the SAME tier a member already holds EXTENDS their term instead of
// resetting it. Grant computes the expiry as now+months, so a support agent
// adding a comped month to someone with ten months left would have replaced ten
// months with one — a silent refund-sized loss on the exact screen that exists
// to make a customer whole. A tier CHANGE still starts from now, because that is
// a different plan, not more of the same one.
func SubscriptionGrantAdmin(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	callerID, _ := ctx.Value(runtime.RUNTIME_CTX_USER_ID).(string)
	if !isAdmin(callerID) {
		return "", runtime.NewError("forbidden", 7)
	}
	var req struct {
		UserID string `json:"user_id"`
		Tier   string `json:"tier"`
		Months int    `json:"months"`
		Reason string `json:"reason"`
	}
	if err := json.Unmarshal([]byte(payload), &req); err != nil {
		return "", runtime.NewError("invalid payload", 3)
	}
	if req.UserID == "" || !billing.IsValidTier(req.Tier) {
		return "", runtime.NewError("user_id and valid tier required", 3)
	}
	if req.Months <= 0 {
		req.Months = 1
	}
	subs := store.NewSubscriptionStore(db)
	current, _ := subs.Get(ctx, req.UserID)

	reference := callerID
	if r := strings.TrimSpace(req.Reason); r != "" {
		reference = callerID + ": " + r
	}

	var (
		sub store.Subscription
		err error
	)
	if until, extend := adminGrantExpiry(req.Tier, current, req.Months, time.Now()); extend {
		sub, err = subs.GrantUntil(ctx, req.UserID, req.Tier, until, req.Months, "admin", reference, "", "")
	} else {
		sub, err = subs.Grant(ctx, req.UserID, req.Tier, req.Months, "admin", reference, "", "")
	}
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	adminAuditDetail(ctx, logger, db, callerID, "subscription_grant", req.UserID, map[string]interface{}{
		"from_tier": current.Tier, "to_tier": req.Tier, "months": req.Months,
		"reason": strings.TrimSpace(req.Reason), "expires_at": sub.ExpiresAt,
	})
	out, _ := json.Marshal(map[string]interface{}{"subscription": sub})
	return string(out), nil
}

// adminGrantExpiry decides when an admin-granted tier should end.
//
// It returns (expiry, true) when the grant should EXTEND an existing term, and
// (zero, false) when it should start a fresh one from today. Extending applies
// only when all of it holds: the target is a paid tier, it is the tier the
// member already has, and that membership has not already lapsed. Anything else
// — an upgrade, a downgrade, a comp to someone on free, a re-grant after expiry
// — is a new term.
func adminGrantExpiry(tier string, current store.Subscription, months int, now time.Time) (time.Time, bool) {
	if !billing.IsPaidTier(tier) || current.Tier != tier {
		return time.Time{}, false
	}
	if current.ExpiresAt == nil || !current.ExpiresAt.After(now) {
		return time.Time{}, false
	}
	return current.ExpiresAt.AddDate(0, months, 0), true
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
