package store

import (
	"context"
	"database/sql"
	"time"

	"github.com/smithdouglas404/poker-next-gen/backend-core/billing"
)

// Subscription is a user's current membership state.
type Subscription struct {
	UserID               string     `json:"user_id"`
	Tier                 string     `json:"tier"`
	Status               string     `json:"status"` // active | inactive | expired
	ExpiresAt            *time.Time `json:"expires_at,omitempty"`
	StripeCustomerID     string     `json:"stripe_customer_id,omitempty"`
	StripeSubscriptionID string     `json:"stripe_subscription_id,omitempty"`
	// CancelAtPeriodEnd: the member cancelled and keeps their tier until
	// ExpiresAt, then drops to free. Without this the UI could not tell an
	// active subscription from one that had been cancelled and was running out,
	// so cancelling produced no visible change anywhere.
	CancelAtPeriodEnd bool `json:"cancel_at_period_end,omitempty"`
}

type SubscriptionStore struct{ db *sql.DB }

func NewSubscriptionStore(db *sql.DB) *SubscriptionStore { return &SubscriptionStore{db: db} }

// Get returns the user's subscription, lazily downgrading to free if a paid tier
// has passed its expiry. The downgrade is persisted so state stays consistent.
func (s *SubscriptionStore) Get(ctx context.Context, userID string) (Subscription, error) {
	sub := Subscription{UserID: userID, Tier: "free", Status: "inactive"}
	var expires sql.NullTime
	err := s.db.QueryRowContext(ctx, `
		SELECT tier, status, expires_at, stripe_customer_id, stripe_subscription_id,
		       COALESCE(cancel_at_period_end, FALSE)
		FROM poker_subscription WHERE user_id=$1`, userID).
		Scan(&sub.Tier, &sub.Status, &expires, &sub.StripeCustomerID, &sub.StripeSubscriptionID,
			&sub.CancelAtPeriodEnd)
	if err == sql.ErrNoRows {
		return sub, nil
	}
	if err != nil {
		return sub, err
	}
	if expires.Valid {
		t := expires.Time
		sub.ExpiresAt = &t
	}
	// Lazy expiry: a paid tier past its expiry reverts to free.
	if billing.IsPaidTier(sub.Tier) && expires.Valid && time.Now().After(expires.Time) {
		if err := s.expire(ctx, userID, sub.Tier); err != nil {
			return sub, err
		}
		return Subscription{UserID: userID, Tier: "free", Status: "expired", ExpiresAt: sub.ExpiresAt}, nil
	}
	return sub, nil
}

// SetCancelAtPeriodEnd records (or clears) a scheduled cancellation.
//
// Local state, not a guess: the membership screen reads this to say "cancels on
// <date>" instead of "active", and to offer Resume. Stripe remains the
// authority on billing — this is what the player is shown between the click and
// the period actually ending.
func (s *SubscriptionStore) SetCancelAtPeriodEnd(ctx context.Context, userID string, cancel bool) error {
	_, err := s.db.ExecContext(ctx,
		`UPDATE poker_subscription SET cancel_at_period_end=$2, updated_at=NOW() WHERE user_id=$1`,
		userID, cancel)
	return err
}

func (s *SubscriptionStore) expire(ctx context.Context, userID, fromTier string) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if _, err := tx.ExecContext(ctx, `
		UPDATE poker_subscription SET tier='free', status='expired', updated_at=NOW()
		WHERE user_id=$1`, userID); err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, `
		INSERT INTO poker_subscription_ledger (id, user_id, from_tier, to_tier, source)
		VALUES ($1,$2,$3,'free','expiry')`, NewID("subl"), userID, fromTier); err != nil {
		return err
	}
	return tx.Commit()
}

// Grant activates a tier for `months` and records the change. This is the ONLY
// way a paid tier is assigned — it is called exclusively by server-side code
// (the verified Stripe webhook or an admin RPC), never by a client. This closes
// HighRollersClub's self-grant bypass, where a user could assign themselves any
// tier with no payment.
func (s *SubscriptionStore) Grant(ctx context.Context, userID, tier string, months int, source, reference, customerID, subscriptionID string) (Subscription, error) {
	return s.grant(ctx, userID, tier, months, nil, source, reference, customerID, subscriptionID)
}

// GrantUntil is Grant with the expiry supplied by the payment provider rather
// than computed from a month count.
//
// The renewal path needs this. A Stripe invoice states the period it paid for
// (`lines.data[].period.end`), and that is the only correct expiry: deriving one
// from a month count means the server and the customer's actual billing period
// drift apart, and an annual plan renewing on a hardcoded month count silently
// bills a year and grants a month.
//
// `until` in the past (or nil) falls back to the month count, so a malformed
// invoice cannot expire a paying customer's membership on arrival.
func (s *SubscriptionStore) GrantUntil(ctx context.Context, userID, tier string, until time.Time, fallbackMonths int, source, reference, customerID, subscriptionID string) (Subscription, error) {
	var u *time.Time
	if !until.IsZero() && until.After(time.Now()) {
		u = &until
	}
	return s.grant(ctx, userID, tier, fallbackMonths, u, source, reference, customerID, subscriptionID)
}

func (s *SubscriptionStore) grant(ctx context.Context, userID, tier string, months int, until *time.Time, source, reference, customerID, subscriptionID string) (Subscription, error) {
	if !billing.IsValidTier(tier) {
		tier = "free"
	}
	if months <= 0 {
		months = 1
	}
	current, _ := s.Get(ctx, userID)
	var expires *time.Time
	status := "inactive"
	if billing.IsPaidTier(tier) {
		t := time.Now().AddDate(0, months, 0)
		if until != nil {
			t = *until
		}
		expires = &t
		status = "active"
	}

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return Subscription{}, err
	}
	defer tx.Rollback()
	if _, err := tx.ExecContext(ctx, `
		INSERT INTO poker_subscription (user_id, tier, status, expires_at, stripe_customer_id, stripe_subscription_id, cancel_at_period_end, updated_at)
		VALUES ($1,$2,$3,$4,$5,$6,FALSE,NOW())
		ON CONFLICT (user_id) DO UPDATE SET
			tier=EXCLUDED.tier, status=EXCLUDED.status, expires_at=EXCLUDED.expires_at,
			-- A new grant CLEARS any scheduled cancellation. Someone who cancels
			-- and then resubscribes (or whose renewal arrives) is not cancelling
			-- any more, and a stale flag would tell them their live subscription
			-- was about to end.
			cancel_at_period_end=FALSE,
			stripe_customer_id=CASE WHEN EXCLUDED.stripe_customer_id<>'' THEN EXCLUDED.stripe_customer_id ELSE poker_subscription.stripe_customer_id END,
			stripe_subscription_id=CASE WHEN EXCLUDED.stripe_subscription_id<>'' THEN EXCLUDED.stripe_subscription_id ELSE poker_subscription.stripe_subscription_id END,
			updated_at=NOW()`,
		userID, tier, status, expires, customerID, subscriptionID); err != nil {
		return Subscription{}, err
	}
	if _, err := tx.ExecContext(ctx, `
		INSERT INTO poker_subscription_ledger (id, user_id, from_tier, to_tier, source, reference)
		VALUES ($1,$2,$3,$4,$5,$6)`,
		NewID("subl"), userID, current.Tier, tier, source, reference); err != nil {
		return Subscription{}, err
	}
	if err := tx.Commit(); err != nil {
		return Subscription{}, err
	}
	return Subscription{
		UserID: userID, Tier: tier, Status: status, ExpiresAt: expires,
		StripeCustomerID: customerID, StripeSubscriptionID: subscriptionID,
	}, nil
}

// SubscriptionTier is a convenience returning the user's current (post-expiry)
// tier id, defaulting to "free" on any error. Handy for inline tier gates.
func SubscriptionTier(ctx context.Context, db *sql.DB, userID string) string {
	sub, err := NewSubscriptionStore(db).Get(ctx, userID)
	if err != nil || sub.Tier == "" {
		return "free"
	}
	return sub.Tier
}

// FindByStripeSubscription resolves the local user for a Stripe subscription id
// (used by the webhook on renewal/cancel events).
func (s *SubscriptionStore) FindByStripeSubscription(ctx context.Context, subscriptionID string) (string, error) {
	var userID string
	err := s.db.QueryRowContext(ctx,
		`SELECT user_id FROM poker_subscription WHERE stripe_subscription_id=$1`, subscriptionID).Scan(&userID)
	if err == sql.ErrNoRows {
		return "", nil
	}
	return userID, err
}
