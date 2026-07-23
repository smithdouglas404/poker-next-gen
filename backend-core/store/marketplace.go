package store

import (
	"context"
	"database/sql"
	"fmt"
	"os"
)

// Listing is a cosmetic offered for sale by a member.
type Listing struct {
	ID           string `json:"id"`
	SellerUserID string `json:"seller_user_id"`
	CosmeticID   string `json:"cosmetic_id"`
	PriceCents   int64  `json:"price_cents"`
	Status       string `json:"status"`
	// Joined cosmetic fields for browsing.
	Name       string `json:"name,omitempty"`
	Kind       string `json:"kind,omitempty"`
	Rarity     string `json:"rarity,omitempty"`
	PreviewRef string `json:"preview_ref,omitempty"`
}

type MarketplaceStore struct{ db *sql.DB }

func NewMarketplaceStore(db *sql.DB) *MarketplaceStore { return &MarketplaceStore{db: db} }

func platformWalletID() string {
	if v := os.Getenv("PLATFORM_WALLET_USER_ID"); v != "" {
		return v
	}
	return "platform-house"
}

// CreateListing lists a cosmetic the seller owns and hasn't already listed.
func (s *MarketplaceStore) CreateListing(ctx context.Context, sellerID, cosmeticID string, priceCents int64) (string, error) {
	if priceCents < 1 {
		return "", fmt.Errorf("price must be positive")
	}
	var owns int
	if err := s.db.QueryRowContext(ctx,
		`SELECT 1 FROM poker_inventory WHERE user_id=$1 AND cosmetic_id=$2`, sellerID, cosmeticID).Scan(&owns); err != nil {
		if err == sql.ErrNoRows {
			return "", fmt.Errorf("you don't own this item")
		}
		return "", err
	}
	var existing int
	if err := s.db.QueryRowContext(ctx,
		`SELECT 1 FROM poker_listing WHERE seller_user_id=$1 AND cosmetic_id=$2 AND status='open'`,
		sellerID, cosmeticID).Scan(&existing); err == nil {
		return "", fmt.Errorf("already listed")
	}
	id := NewID("lst")
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO poker_listing (id, seller_user_id, cosmetic_id, price_cents, status)
		VALUES ($1,$2,$3,$4,'open')`, id, sellerID, cosmeticID, priceCents)
	return id, err
}

// Browse returns open listings with cosmetic details.
func (s *MarketplaceStore) Browse(ctx context.Context, limit int) ([]Listing, error) {
	if limit <= 0 || limit > 200 {
		limit = 100
	}
	rows, err := s.db.QueryContext(ctx, `
		SELECT l.id, l.seller_user_id, l.cosmetic_id, l.price_cents, l.status,
		       c.name, c.kind, c.rarity, c.preview_ref
		FROM poker_listing l JOIN poker_cosmetic c ON c.id=l.cosmetic_id
		WHERE l.status='open' ORDER BY l.created_at DESC LIMIT $1`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Listing
	for rows.Next() {
		var l Listing
		if err := rows.Scan(&l.ID, &l.SellerUserID, &l.CosmeticID, &l.PriceCents, &l.Status,
			&l.Name, &l.Kind, &l.Rarity, &l.PreviewRef); err != nil {
			return nil, err
		}
		out = append(out, l)
	}
	return out, rows.Err()
}

// Cancel closes an open listing (seller only).
func (s *MarketplaceStore) Cancel(ctx context.Context, listingID, sellerID string) error {
	res, err := s.db.ExecContext(ctx,
		`UPDATE poker_listing SET status='cancelled', updated_at=NOW()
		 WHERE id=$1 AND seller_user_id=$2 AND status='open'`, listingID, sellerID)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return fmt.Errorf("listing not open or not yours")
	}
	return nil
}

// Buy executes a sale in ONE transaction: debit buyer, credit seller (minus the
// platform fee), credit the platform wallet the fee, transfer the cosmetic, and
// mark the listing sold. feeBps is the seller tier's marketplace fee.
func (s *MarketplaceStore) Buy(ctx context.Context, listingID, buyerID string, feeBps int) (int64, error) {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return 0, err
	}
	defer tx.Rollback()

	var sellerID, cosmeticID string
	var price int64
	err = tx.QueryRowContext(ctx, `
		SELECT seller_user_id, cosmetic_id, price_cents FROM poker_listing
		WHERE id=$1 AND status='open' FOR UPDATE`, listingID).Scan(&sellerID, &cosmeticID, &price)
	if err == sql.ErrNoRows {
		return 0, fmt.Errorf("listing not available")
	}
	if err != nil {
		return 0, err
	}
	if sellerID == buyerID {
		return 0, fmt.Errorf("you can't buy your own listing")
	}
	fee := price * int64(feeBps) / 10000
	sellerNet := price - fee

	// Ensure a wallet row exists (starting at ZERO — buyers are never auto-funded;
	// they must have real balance to purchase). Debit is balance-guarded below.
	if _, err := tx.ExecContext(ctx, `
		INSERT INTO poker_global_wallet (user_id, balance, currency, updated_at)
		VALUES ($1, 0, 'USD', NOW()) ON CONFLICT (user_id) DO NOTHING`, buyerID); err != nil {
		return 0, err
	}
	var buyerAfter int64
	err = tx.QueryRowContext(ctx, `
		UPDATE poker_global_wallet SET balance=balance-$2, updated_at=NOW()
		WHERE user_id=$1 AND balance>=$2 RETURNING balance`, buyerID, price).Scan(&buyerAfter)
	if err == sql.ErrNoRows {
		return 0, fmt.Errorf("insufficient balance")
	}
	if err != nil {
		return 0, err
	}
	if err := ledger(ctx, tx, buyerID, -price, buyerAfter, "marketplace_buy:"+listingID); err != nil {
		return 0, err
	}

	// Credit seller (net) and platform (fee).
	if err := creditWallet(ctx, tx, sellerID, sellerNet, "marketplace_sale:"+listingID); err != nil {
		return 0, err
	}
	if fee > 0 {
		if err := creditWallet(ctx, tx, platformWalletID(), fee, "marketplace_fee:"+listingID); err != nil {
			return 0, err
		}
	}

	// Transfer ownership.
	if _, err := tx.ExecContext(ctx, `DELETE FROM poker_inventory WHERE user_id=$1 AND cosmetic_id=$2`, sellerID, cosmeticID); err != nil {
		return 0, err
	}
	if _, err := tx.ExecContext(ctx, `
		INSERT INTO poker_inventory (user_id, cosmetic_id, source, acquired_at)
		VALUES ($1,$2,'marketplace',NOW()) ON CONFLICT (user_id, cosmetic_id) DO NOTHING`, buyerID, cosmeticID); err != nil {
		return 0, err
	}
	// Un-equip the item for the seller if it was equipped.
	if _, err := tx.ExecContext(ctx, `DELETE FROM poker_equipped WHERE user_id=$1 AND cosmetic_id=$2`, sellerID, cosmeticID); err != nil {
		return 0, err
	}
	// Reflect new ownership on the cosmetic record.
	if _, err := tx.ExecContext(ctx, `UPDATE poker_cosmetic SET owner_user_id=$2 WHERE id=$1`, cosmeticID, buyerID); err != nil {
		return 0, err
	}

	if _, err := tx.ExecContext(ctx, `
		UPDATE poker_listing SET status='sold', buyer_user_id=$2, fee_cents=$3, updated_at=NOW()
		WHERE id=$1`, listingID, buyerID, fee); err != nil {
		return 0, err
	}
	if err := tx.Commit(); err != nil {
		return 0, err
	}
	return price, nil
}

// GetSellerAndStatus returns the seller id + status for a listing (for fee lookup).
func (s *MarketplaceStore) GetSellerAndStatus(ctx context.Context, listingID string) (string, string, error) {
	var seller, status string
	err := s.db.QueryRowContext(ctx,
		`SELECT seller_user_id, status FROM poker_listing WHERE id=$1`, listingID).Scan(&seller, &status)
	if err == sql.ErrNoRows {
		return "", "", nil
	}
	return seller, status, err
}

func creditWallet(ctx context.Context, tx *sql.Tx, userID string, amount int64, reason string) error {
	if amount <= 0 {
		return nil
	}
	if _, err := tx.ExecContext(ctx, `
		INSERT INTO poker_global_wallet (user_id, balance, currency, updated_at)
		VALUES ($1, 0, 'USD', NOW()) ON CONFLICT (user_id) DO NOTHING`, userID); err != nil {
		return err
	}
	var after int64
	if err := tx.QueryRowContext(ctx, `
		UPDATE poker_global_wallet SET balance=balance+$2, updated_at=NOW()
		WHERE user_id=$1 RETURNING balance`, userID, amount).Scan(&after); err != nil {
		return err
	}
	return ledger(ctx, tx, userID, amount, after, reason)
}

func ledger(ctx context.Context, tx *sql.Tx, userID string, delta, after int64, reason string) error {
	_, err := tx.ExecContext(ctx, `
		INSERT INTO poker_wallet_ledger (id, user_id, delta, balance_after, reason)
		VALUES ($1,$2,$3,$4,$5)`, NewID("wl"), userID, delta, after, reason)
	return err
}
