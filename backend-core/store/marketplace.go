package store

import (
	"context"
	"database/sql"
	"fmt"
	"os"
	"time"
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

// Activity is one line of a member's own trading history — a listing they
// posted or a purchase they made, in any state.
type Activity struct {
	ID         string `json:"id"`
	CosmeticID string `json:"cosmetic_id"`
	Name       string `json:"name,omitempty"`
	Kind       string `json:"kind,omitempty"`
	Rarity     string `json:"rarity,omitempty"`
	PreviewRef string `json:"preview_ref,omitempty"`
	PriceCents int64  `json:"price_cents"`
	FeeCents   int64  `json:"fee_cents"`
	// NetCents is what the SELLER actually received. Zero on a purchase line.
	NetCents  int64  `json:"net_cents"`
	Status    string `json:"status"` // open | sold | cancelled
	Side      string `json:"side"`   // sell | buy
	UpdatedAt string `json:"updated_at"`
}

// MyActivity returns the caller's own listings and purchases, newest first.
//
// Nothing read the sold rows. A seller's item left the floor, their wallet moved
// by an amount that was not the price they set (the fee came out of it), and
// there was no record anywhere connecting the two — the only trace of a
// completed trade was a balance that had changed for no stated reason.
func (s *MarketplaceStore) MyActivity(ctx context.Context, userID string, limit int) ([]Activity, error) {
	if limit <= 0 || limit > 200 {
		limit = 50
	}
	rows, err := s.db.QueryContext(ctx, `
		SELECT l.id, l.cosmetic_id, c.name, c.kind, c.rarity, c.preview_ref,
		       l.price_cents, l.fee_cents, l.status,
		       CASE WHEN l.seller_user_id=$1 THEN 'sell' ELSE 'buy' END,
		       l.updated_at
		FROM poker_listing l JOIN poker_cosmetic c ON c.id=l.cosmetic_id
		WHERE l.seller_user_id=$1 OR (l.buyer_user_id=$1 AND l.buyer_user_id<>'')
		ORDER BY l.updated_at DESC LIMIT $2`, userID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Activity{}
	for rows.Next() {
		var a Activity
		var updated sql.NullTime
		if err := rows.Scan(&a.ID, &a.CosmeticID, &a.Name, &a.Kind, &a.Rarity, &a.PreviewRef,
			&a.PriceCents, &a.FeeCents, &a.Status, &a.Side, &updated); err != nil {
			return nil, err
		}
		if updated.Valid {
			a.UpdatedAt = updated.Time.UTC().Format(time.RFC3339)
		}
		// The fee is the seller's cost, so netting it off a buy line would
		// misreport what the buyer paid — they paid the full price.
		if a.Side == "sell" && a.Status == "sold" {
			a.NetCents = a.PriceCents - a.FeeCents
		}
		out = append(out, a)
	}
	return out, rows.Err()
}

// OpenListingCosmetics returns the cosmetic ids the caller currently has on the
// floor, so the sell grid can mark them instead of offering a "List for sale"
// button the server will refuse with "already listed".
func (s *MarketplaceStore) OpenListingCosmetics(ctx context.Context, userID string) ([]string, error) {
	rows, err := s.db.QueryContext(ctx,
		`SELECT cosmetic_id FROM poker_listing WHERE seller_user_id=$1 AND status='open'`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []string{}
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		out = append(out, id)
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

	// Both ownership checks run BEFORE any money moves. They used to be implicit
	// in the transfer below, where each failed silently:
	//
	//   * The seller's copy was removed with a bare DELETE whose row count was
	//     never checked. A stale listing — the seller having disposed of the item
	//     some other way since posting — deleted nothing, yet the buyer was still
	//     charged and still received the item. That mints inventory out of
	//     nothing, and on a one-of-one cosmetic it mints a second original.
	//
	//   * The buyer's copy was added with ON CONFLICT DO NOTHING. A buyer who
	//     already owned the item paid full price for a no-op: debited, seller
	//     credited, seller's copy destroyed, buyer's holdings unchanged.
	//
	// A purchase that cannot deliver has to fail before it takes the money.
	var sellerOwns bool
	if err := tx.QueryRowContext(ctx,
		`SELECT EXISTS(SELECT 1 FROM poker_inventory WHERE user_id=$1 AND cosmetic_id=$2)`,
		sellerID, cosmeticID).Scan(&sellerOwns); err != nil {
		return 0, err
	}
	if !sellerOwns {
		return 0, fmt.Errorf("this listing is no longer valid — the seller no longer holds the item")
	}
	var buyerOwns bool
	if err := tx.QueryRowContext(ctx,
		`SELECT EXISTS(SELECT 1 FROM poker_inventory WHERE user_id=$1 AND cosmetic_id=$2)`,
		buyerID, cosmeticID).Scan(&buyerOwns); err != nil {
		return 0, err
	}
	if buyerOwns {
		return 0, fmt.Errorf("you already own this item")
	}

	// A fee outside 0..100% is a misconfiguration, not a trade: above 10000 bps
	// the seller's net goes negative, and creditWallet skips non-positive
	// amounts, so the seller would be paid nothing while the buyer still paid in
	// full and the books still balanced.
	if feeBps < 0 {
		feeBps = 0
	}
	if feeBps > 10000 {
		feeBps = 10000
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

	// Double-entry: ONE transaction with three legs, not three transactions.
	//
	// A trade is a single economic event — the buyer's price is exactly the
	// seller's net plus the platform's fee — and splitting it into separate
	// two-leg postings would lose that relationship, leaving a reader unable to
	// tell which fee belonged to which sale. The three legs sum to zero by
	// construction (sellerNet = price - fee), and PostTx refuses the write if
	// that ever stops being true, so a fee-rounding change cannot quietly break
	// the books.
	postings := []Posting{
		{Account: UserAcct(buyerID), AmountMinor: -price, Reason: "marketplace_buy:" + listingID},
		{Account: UserAcct(sellerID), AmountMinor: sellerNet, Reason: "marketplace_sale:" + listingID},
	}
	if fee > 0 {
		postings = append(postings, Posting{
			Account: AcctHouseMarketplaceFee, AmountMinor: fee, Reason: "marketplace_fee:" + listingID,
		})
	}
	if _, err := PostTx(ctx, tx, "marketplace", listingID, "marketplace trade", postings); err != nil {
		return 0, err
	}

	// Transfer ownership. The row counts are asserted rather than assumed: the
	// checks above hold the listing under FOR UPDATE, but the inventory rows are
	// not locked by that, so this is the point where a concurrent transfer would
	// show up. Returning an error rolls the whole transaction back, money
	// included — the alternative is a charge with nothing delivered.
	res, err := tx.ExecContext(ctx, `DELETE FROM poker_inventory WHERE user_id=$1 AND cosmetic_id=$2`, sellerID, cosmeticID)
	if err != nil {
		return 0, err
	}
	if n, _ := res.RowsAffected(); n != 1 {
		return 0, fmt.Errorf("the seller no longer holds this item — the sale was not completed")
	}
	res, err = tx.ExecContext(ctx, `
		INSERT INTO poker_inventory (user_id, cosmetic_id, source, acquired_at)
		VALUES ($1,$2,'marketplace',NOW()) ON CONFLICT (user_id, cosmetic_id) DO NOTHING`, buyerID, cosmeticID)
	if err != nil {
		return 0, err
	}
	if n, _ := res.RowsAffected(); n != 1 {
		return 0, fmt.Errorf("you already own this item — the sale was not completed")
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
