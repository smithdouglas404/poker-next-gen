package store

import (
	"context"
	crand "crypto/rand"
	"database/sql"
	"encoding/hex"
	"errors"
	"strings"
	"time"
)

// RewardsStore backs the sponsor/rewards marketplace: sponsors, the reward-item
// catalog, redemptions (vouchers), and point-purchase records. Point balances
// live on poker_loyalty (see LoyaltyStore) — this store never mutates them; the
// RPC layer composes a redemption with LoyaltyStore.SpendPoints in the right
// order so points are only drawn down once the record is written.
type RewardsStore struct{ db *sql.DB }

func NewRewardsStore(db *sql.DB) *RewardsStore { return &RewardsStore{db: db} }

// RewardCategories is the fixed set of marketplace categories.
var RewardCategories = []string{"travel", "food", "recreation", "experiences", "merch"}

// ValidRewardCategory clamps an arbitrary string to a known category.
func ValidRewardCategory(c string) string {
	for _, v := range RewardCategories {
		if v == c {
			return c
		}
	}
	return "experiences"
}

// RewardSponsor is a brand offering rewards in a category.
type RewardSponsor struct {
	ID          string    `json:"id"`
	Name        string    `json:"name"`
	Category    string    `json:"category"`
	Description string    `json:"description"`
	LogoURL     string    `json:"logo_url"`
	Active      bool      `json:"active"`
	CreatedAt   time.Time `json:"created_at"`
}

// RewardItem is a single redeemable reward priced in spendable points.
type RewardItem struct {
	ID             string    `json:"id"`
	SponsorID      string    `json:"sponsor_id"`
	SponsorName    string    `json:"sponsor_name,omitempty"`
	Category       string    `json:"category"`
	Title          string    `json:"title"`
	Description    string    `json:"description"`
	ImageURL       string    `json:"image_url"`
	PointsCost     int64     `json:"points_cost"`
	CashValueCents int64     `json:"cash_value_cents"`
	Stock          int       `json:"stock"` // -1 = unlimited
	Active         bool      `json:"active"`
	CreatedAt      time.Time `json:"created_at"`
}

// RewardRedemption is a voucher created when a player redeems an item.
type RewardRedemption struct {
	ID          string     `json:"id"`
	UserID      string     `json:"user_id"`
	ItemID      string     `json:"item_id"`
	SponsorID   string     `json:"sponsor_id"`
	Title       string     `json:"title"`
	Category    string     `json:"category"`
	PointsSpent int64      `json:"points_spent"`
	Status      string     `json:"status"`
	VoucherCode string     `json:"voucher_code"`
	CreatedAt   time.Time  `json:"created_at"`
	FulfilledAt *time.Time `json:"fulfilled_at,omitempty"`
}

// UpsertSponsor inserts or updates a sponsor (admin catalog management).
func (s *RewardsStore) UpsertSponsor(ctx context.Context, sp *RewardSponsor) (string, error) {
	if sp.ID == "" {
		sp.ID = NewID("rsp")
	}
	sp.Category = ValidRewardCategory(sp.Category)
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO poker_reward_sponsor (id, name, category, description, logo_url, active)
		VALUES ($1,$2,$3,$4,$5,$6)
		ON CONFLICT (id) DO UPDATE SET
			name=EXCLUDED.name, category=EXCLUDED.category, description=EXCLUDED.description,
			logo_url=EXCLUDED.logo_url, active=EXCLUDED.active`,
		sp.ID, sp.Name, sp.Category, sp.Description, sp.LogoURL, sp.Active)
	return sp.ID, err
}

// UpsertItem inserts or updates a reward item.
func (s *RewardsStore) UpsertItem(ctx context.Context, it *RewardItem) (string, error) {
	if it.ID == "" {
		it.ID = NewID("rwd")
	}
	it.Category = ValidRewardCategory(it.Category)
	// A negative price would MINT points on redemption: the atomic redeem
	// subtracts points_cost from hrp_spendable, so a mistyped "-5000" hands the
	// redeemer 5000 points and a voucher.
	if it.PointsCost < 0 || it.CashValueCents < 0 {
		return "", errors.New("points_cost and cash_value_cents must not be negative")
	}
	if it.Stock < -1 {
		return "", errors.New("stock must be -1 (unlimited) or a non-negative count")
	}
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO poker_reward_item (id, sponsor_id, category, title, description, image_url, points_cost, cash_value_cents, stock, active)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
		ON CONFLICT (id) DO UPDATE SET
			sponsor_id=EXCLUDED.sponsor_id, category=EXCLUDED.category, title=EXCLUDED.title,
			description=EXCLUDED.description, image_url=EXCLUDED.image_url, points_cost=EXCLUDED.points_cost,
			cash_value_cents=EXCLUDED.cash_value_cents, stock=EXCLUDED.stock, active=EXCLUDED.active`,
		it.ID, it.SponsorID, it.Category, it.Title, it.Description, it.ImageURL,
		it.PointsCost, it.CashValueCents, it.Stock, it.Active)
	return it.ID, err
}

// ListSponsors returns active sponsors (optionally filtered by category).
func (s *RewardsStore) ListSponsors(ctx context.Context, category string) ([]RewardSponsor, error) {
	q := `SELECT id, name, category, description, logo_url, active, created_at
		FROM poker_reward_sponsor WHERE active = TRUE`
	args := []interface{}{}
	if category != "" {
		q += " AND category = $1"
		args = append(args, ValidRewardCategory(category))
	}
	q += " ORDER BY name ASC"
	rows, err := s.db.QueryContext(ctx, q, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []RewardSponsor{}
	for rows.Next() {
		var sp RewardSponsor
		if err := rows.Scan(&sp.ID, &sp.Name, &sp.Category, &sp.Description, &sp.LogoURL, &sp.Active, &sp.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, sp)
	}
	return out, rows.Err()
}

// ListItems returns active items (optionally by category), joined to sponsor name.
func (s *RewardsStore) ListItems(ctx context.Context, category string) ([]RewardItem, error) {
	q := `SELECT i.id, i.sponsor_id, COALESCE(s.name,''), i.category, i.title, i.description,
		i.image_url, i.points_cost, i.cash_value_cents, i.stock, i.active, i.created_at
		FROM poker_reward_item i
		LEFT JOIN poker_reward_sponsor s ON s.id = i.sponsor_id
		WHERE i.active = TRUE AND (i.stock <> 0)`
	args := []interface{}{}
	if category != "" {
		q += " AND i.category = $1"
		args = append(args, ValidRewardCategory(category))
	}
	q += " ORDER BY i.points_cost ASC"
	rows, err := s.db.QueryContext(ctx, q, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []RewardItem{}
	for rows.Next() {
		var it RewardItem
		if err := rows.Scan(&it.ID, &it.SponsorID, &it.SponsorName, &it.Category, &it.Title,
			&it.Description, &it.ImageURL, &it.PointsCost, &it.CashValueCents, &it.Stock, &it.Active, &it.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, it)
	}
	return out, rows.Err()
}

// GetItem fetches one item (for redemption pricing/stock checks).
func (s *RewardsStore) GetItem(ctx context.Context, id string) (*RewardItem, error) {
	var it RewardItem
	err := s.db.QueryRowContext(ctx, `
		SELECT id, sponsor_id, category, title, description, image_url, points_cost, cash_value_cents, stock, active, created_at
		FROM poker_reward_item WHERE id=$1`, id).
		Scan(&it.ID, &it.SponsorID, &it.Category, &it.Title, &it.Description, &it.ImageURL,
			&it.PointsCost, &it.CashValueCents, &it.Stock, &it.Active, &it.CreatedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &it, nil
}

// rewardVoucherCode returns a human-friendly single-use voucher code.
func rewardVoucherCode() string {
	var b [4]byte
	_, _ = crand.Read(b[:])
	h := strings.ToUpper(hex.EncodeToString(b[:]))
	return "HRC-" + h[:4] + "-" + h[4:8]
}

// RedeemRewardAtomic spends points, reserves stock, and records the
// redemption voucher in ONE database transaction — either all three happen
// or none do.
//
// The RPC-level version this replaces chained three separate calls
// (LoyaltyStore.SpendPoints, RewardsStore.DecrementStock,
// RewardsStore.CreateRedemption), compensating with AddSpendable/stock
// refunds on failure. That closed the CONCURRENCY window (two redeemers
// racing the same last unit of stock) correctly, but not a process CRASH
// between any two of the three calls — which left points spent with no
// voucher ever created, and the compensating refund code never having run
// either, since the request that would have run it was gone.
//
// Returns (nil, "insufficient_points"|"out_of_stock", nil) for the ordinary
// "can't afford it / sold out" cases — not an error — so the caller's
// existing message branching still applies unchanged.
func (s *RewardsStore) RedeemRewardAtomic(ctx context.Context, item *RewardItem, userID string) (*RewardRedemption, string, error) {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, "", err
	}
	defer tx.Rollback()

	res, err := tx.ExecContext(ctx, `
		UPDATE poker_loyalty SET hrp_spendable = hrp_spendable - $2, updated_at = NOW()
		WHERE user_id = $1 AND hrp_spendable >= $2`, userID, item.PointsCost)
	if err != nil {
		return nil, "", err
	}
	if n, _ := res.RowsAffected(); n != 1 {
		return nil, "insufficient_points", nil
	}

	if item.Stock > 0 {
		res, err := tx.ExecContext(ctx,
			`UPDATE poker_reward_item SET stock = stock - 1 WHERE id=$1 AND stock > 0`, item.ID)
		if err != nil {
			return nil, "", err
		}
		if n, _ := res.RowsAffected(); n != 1 {
			return nil, "out_of_stock", nil
		}
	}

	red := &RewardRedemption{
		ID: NewID("rdm"), UserID: userID, ItemID: item.ID, SponsorID: item.SponsorID,
		Title: item.Title, Category: item.Category, PointsSpent: item.PointsCost,
		Status: "pending", VoucherCode: rewardVoucherCode(),
	}
	if _, err := tx.ExecContext(ctx, `
		INSERT INTO poker_reward_redemption (id, user_id, item_id, sponsor_id, title, category, points_spent, status, voucher_code)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
		red.ID, red.UserID, red.ItemID, red.SponsorID, red.Title, red.Category, red.PointsSpent, red.Status, red.VoucherCode); err != nil {
		return nil, "", err
	}
	if err := tx.Commit(); err != nil {
		return nil, "", err
	}
	return red, "", nil
}

// ListRedemptions returns a user's redemptions (newest first).
func (s *RewardsStore) ListRedemptions(ctx context.Context, userID string, limit int) ([]RewardRedemption, error) {
	if limit <= 0 || limit > 200 {
		limit = 50
	}
	rows, err := s.db.QueryContext(ctx, `
		SELECT id, user_id, item_id, sponsor_id, title, category, points_spent, status, voucher_code, created_at, fulfilled_at
		FROM poker_reward_redemption WHERE user_id=$1 ORDER BY created_at DESC LIMIT $2`, userID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanRedemptions(rows)
}

// ListPendingRedemptions returns redemptions awaiting fulfilment (admin queue).
func (s *RewardsStore) ListPendingRedemptions(ctx context.Context, limit int) ([]RewardRedemption, error) {
	if limit <= 0 || limit > 500 {
		limit = 100
	}
	rows, err := s.db.QueryContext(ctx, `
		SELECT id, user_id, item_id, sponsor_id, title, category, points_spent, status, voucher_code, created_at, fulfilled_at
		FROM poker_reward_redemption WHERE status='pending' ORDER BY created_at ASC LIMIT $1`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanRedemptions(rows)
}

func scanRedemptions(rows *sql.Rows) ([]RewardRedemption, error) {
	out := []RewardRedemption{}
	for rows.Next() {
		var r RewardRedemption
		var fulfilled sql.NullTime
		if err := rows.Scan(&r.ID, &r.UserID, &r.ItemID, &r.SponsorID, &r.Title, &r.Category,
			&r.PointsSpent, &r.Status, &r.VoucherCode, &r.CreatedAt, &fulfilled); err != nil {
			return nil, err
		}
		if fulfilled.Valid {
			r.FulfilledAt = &fulfilled.Time
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

// FulfilRedemption marks a redemption fulfilled (or cancelled). Returns false if
// the redemption is not found or already resolved.
// RedemptionFulfilled / RedemptionCancelled are the only two terminal states an
// operator may move a pending redemption to.
const (
	RedemptionFulfilled = "fulfilled"
	RedemptionCancelled = "cancelled"
)

// ValidRedemptionStatus reports whether a status is one an operator may set.
//
// This used to be a silent coercion — anything that was not "cancelled" became
// "fulfilled". That turned a typo into the WORST possible outcome: an operator
// meaning to cancel and refund would instead mark the reward delivered, and the
// player would lose the points with nothing to show. An unrecognised status is
// now an error, so the mistake is visible instead of expensive.
func ValidRedemptionStatus(status string) bool {
	return status == RedemptionFulfilled || status == RedemptionCancelled
}

// It returns the resolved redemption so the caller can compensate the player on
// a cancellation — the row carries the user, the points spent and the item, and
// re-reading it separately would race another admin resolving the same one.
// A nil return means the redemption was missing or already resolved.
func (s *RewardsStore) FulfilRedemption(ctx context.Context, id, status string) (*RewardRedemption, error) {
	if !ValidRedemptionStatus(status) {
		return nil, errors.New("status must be fulfilled or cancelled")
	}
	// RETURNING, not ExecContext + a follow-up SELECT: the `status='pending'`
	// predicate is what makes this idempotent under two admins clicking at once,
	// and the returned row is the one this call actually claimed.
	var r RewardRedemption
	err := s.db.QueryRowContext(ctx, `
		UPDATE poker_reward_redemption SET status=$2, fulfilled_at=NOW()
		WHERE id=$1 AND status='pending'
		RETURNING id, user_id, item_id, sponsor_id, title, category, points_spent, status, voucher_code, created_at, fulfilled_at`,
		id, status,
	).Scan(&r.ID, &r.UserID, &r.ItemID, &r.SponsorID, &r.Title, &r.Category,
		&r.PointsSpent, &r.Status, &r.VoucherCode, &r.CreatedAt, &r.FulfilledAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &r, nil
}

// IncrementStock returns a reserved unit to a limited-stock item.
//
// Guarded on `stock >= 0` so it never resurrects an unlimited item: stock -1 is
// the sentinel for "no limit", and blindly incrementing it would turn an
// unlimited reward into one with a single unit.
func (s *RewardsStore) IncrementStock(ctx context.Context, id string) error {
	_, err := s.db.ExecContext(ctx,
		`UPDATE poker_reward_item SET stock = stock + 1 WHERE id=$1 AND stock >= 0`, id)
	return err
}

// RecordPointsPurchase logs a buy-points transaction.
func (s *RewardsStore) RecordPointsPurchase(ctx context.Context, userID string, points, costCents int64) error {
	_, err := s.db.ExecContext(ctx,
		`INSERT INTO poker_points_purchase (id, user_id, points, cost_cents) VALUES ($1,$2,$3,$4)`,
		NewID("ptp"), userID, points, costCents)
	return err
}
