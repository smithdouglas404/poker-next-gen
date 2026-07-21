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
}

type SubscriptionStore struct{ db *sql.DB }

func NewSubscriptionStore(db *sql.DB) *SubscriptionStore { return &SubscriptionStore{db: db} }

// Get returns the user's subscription, lazily downgrading to free if a paid tier
// has passed its expiry. The downgrade is persisted so state stays consistent.
func (s *SubscriptionStore) Get(ctx context.Context, userID string) (Subscription, error) {
	sub := Subscription{UserID: userID, Tier: "free", Status: "inactive"}
	var expires sql.NullTime
	err := s.db.QueryRowContext(ctx, `
		SELECT tier, status, expires_at, stripe_customer_id, stripe_subscription_id
		FROM poker_subscription WHERE user_id=$1`, userID).
		Scan(&sub.Tier, &sub.Status, &expires, &sub.StripeCustomerID, &sub.StripeSubscriptionID)
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
		expires = &t
		status = "active"
	}

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return Subscription{}, err
	}
	defer tx.Rollback()
	if _, err := tx.ExecContext(ctx, `
		INSERT INTO poker_subscription (user_id, tier, status, expires_at, stripe_customer_id, stripe_subscription_id, updated_at)
		VALUES ($1,$2,$3,$4,$5,$6,NOW())
		ON CONFLICT (user_id) DO UPDATE SET
			tier=EXCLUDED.tier, status=EXCLUDED.status, expires_at=EXCLUDED.expires_at,
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
