package store

import (
	"context"
	"database/sql"
	"fmt"
	"time"
)

// EconomyExtStore backs the extended economy domain: multi-bucket wallets,
// cosmetic wishlists, per-cosmetic dye params, multi-slot loadouts, and NFT
// mint records. It is self-contained — the bucket ledger is separate from the
// single global wallet (poker_global_wallet) so the deferred multi-wallet UI can
// opt in without disturbing existing balances.
type EconomyExtStore struct{ db *sql.DB }

func NewEconomyExtStore(db *sql.DB) *EconomyExtStore { return &EconomyExtStore{db: db} }

// economyBuckets is the canonical set of wallet buckets a user holds.
var economyBuckets = []string{"main", "cash_game", "sng", "tournament", "bonus"}

// EconomyBucketBalance is one bucket's balance for a user.
type EconomyBucketBalance struct {
	Bucket   string `json:"bucket"`
	Balance  int64  `json:"balance"`
	Currency string `json:"currency"`
}

// EnsureBuckets creates any missing bucket rows for a user (idempotent).
func (s *EconomyExtStore) EnsureBuckets(ctx context.Context, userID string) error {
	for _, b := range economyBuckets {
		if _, err := s.db.ExecContext(ctx, `
			INSERT INTO poker_wallet_bucket (user_id, bucket, balance, currency, updated_at)
			VALUES ($1,$2,0,'USD',NOW()) ON CONFLICT (user_id, bucket) DO NOTHING`, userID, b); err != nil {
			return err
		}
	}
	return nil
}

// BucketBalances returns every bucket balance for a user (ensuring rows exist).
func (s *EconomyExtStore) BucketBalances(ctx context.Context, userID string) ([]EconomyBucketBalance, error) {
	if err := s.EnsureBuckets(ctx, userID); err != nil {
		return nil, err
	}
	rows, err := s.db.QueryContext(ctx, `
		SELECT bucket, balance, currency FROM poker_wallet_bucket
		WHERE user_id=$1 ORDER BY bucket`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []EconomyBucketBalance
	for rows.Next() {
		var b EconomyBucketBalance
		if err := rows.Scan(&b.Bucket, &b.Balance, &b.Currency); err != nil {
			return nil, err
		}
		out = append(out, b)
	}
	return out, rows.Err()
}

// economyValidBucket reports whether name is a known bucket.
func economyValidBucket(name string) bool {
	for _, b := range economyBuckets {
		if b == name {
			return true
		}
	}
	return false
}

// TransferBucket atomically moves funds between two of a user's buckets. The
// debit balance check and the credit apply in one transaction, or neither does.
func (s *EconomyExtStore) TransferBucket(ctx context.Context, userID, from, to string, amount int64) error {
	if amount <= 0 {
		return fmt.Errorf("amount must be positive")
	}
	if from == to {
		return fmt.Errorf("source and destination buckets must differ")
	}
	if !economyValidBucket(from) || !economyValidBucket(to) {
		return fmt.Errorf("unknown bucket")
	}
	if err := s.EnsureBuckets(ctx, userID); err != nil {
		return err
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	var after int64
	err = tx.QueryRowContext(ctx, `
		UPDATE poker_wallet_bucket SET balance=balance-$3, updated_at=NOW()
		WHERE user_id=$1 AND bucket=$2 AND balance>=$3 RETURNING balance`, userID, from, amount).Scan(&after)
	if err == sql.ErrNoRows {
		return fmt.Errorf("insufficient balance")
	}
	if err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, `
		UPDATE poker_wallet_bucket SET balance=balance+$3, updated_at=NOW()
		WHERE user_id=$1 AND bucket=$2`, userID, to, amount); err != nil {
		return err
	}
	return tx.Commit()
}

// --- Wishlist ---

// WishlistAdd adds a cosmetic to a user's wishlist (idempotent).
func (s *EconomyExtStore) WishlistAdd(ctx context.Context, userID, cosmeticID string) error {
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO poker_cosmetic_wishlist (user_id, cosmetic_id, created_at)
		VALUES ($1,$2,NOW()) ON CONFLICT (user_id, cosmetic_id) DO NOTHING`, userID, cosmeticID)
	return err
}

// WishlistRemove drops a cosmetic from a user's wishlist.
func (s *EconomyExtStore) WishlistRemove(ctx context.Context, userID, cosmeticID string) error {
	_, err := s.db.ExecContext(ctx, `
		DELETE FROM poker_cosmetic_wishlist WHERE user_id=$1 AND cosmetic_id=$2`, userID, cosmeticID)
	return err
}

// WishlistList returns the cosmetics a user has wishlisted (full catalog rows).
func (s *EconomyExtStore) WishlistList(ctx context.Context, userID string) ([]Cosmetic, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT c.id, c.kind, c.name, c.rarity, c.asset_ref, c.preview_ref, c.owner_user_id, c.price_cents, c.active
		FROM poker_cosmetic_wishlist w JOIN poker_cosmetic c ON c.id=w.cosmetic_id
		WHERE w.user_id=$1 ORDER BY w.created_at DESC`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanCosmetics(rows)
}

// --- Dye ---

// DyeSet stores (or replaces) a user's dye params for a cosmetic.
func (s *EconomyExtStore) DyeSet(ctx context.Context, userID, cosmeticID, paramsJSON string) error {
	if paramsJSON == "" {
		paramsJSON = "{}"
	}
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO poker_cosmetic_dye (user_id, cosmetic_id, params_json, updated_at)
		VALUES ($1,$2,$3,NOW())
		ON CONFLICT (user_id, cosmetic_id) DO UPDATE SET params_json=EXCLUDED.params_json, updated_at=NOW()`,
		userID, cosmeticID, paramsJSON)
	return err
}

// DyeGet returns a user's dye params for a cosmetic, or "" if none set.
func (s *EconomyExtStore) DyeGet(ctx context.Context, userID, cosmeticID string) (string, error) {
	var params string
	err := s.db.QueryRowContext(ctx, `
		SELECT params_json FROM poker_cosmetic_dye WHERE user_id=$1 AND cosmetic_id=$2`, userID, cosmeticID).Scan(&params)
	if err == sql.ErrNoRows {
		return "", nil
	}
	if err != nil {
		return "", err
	}
	return params, nil
}

// --- Loadouts ---

// EconomyLoadout is a named, multi-slot outfit (slots_json maps kind→cosmetic_id).
type EconomyLoadout struct {
	ID        string    `json:"id"`
	UserID    string    `json:"user_id"`
	Name      string    `json:"name"`
	SlotsJSON string    `json:"slots_json"`
	CreatedAt time.Time `json:"created_at"`
}

// LoadoutSave inserts a new loadout and returns its id.
func (s *EconomyExtStore) LoadoutSave(ctx context.Context, userID, name, slotsJSON string) (string, error) {
	if slotsJSON == "" {
		slotsJSON = "{}"
	}
	id := NewID("load")
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO poker_loadout (id, user_id, name, slots_json, created_at)
		VALUES ($1,$2,$3,$4,NOW())`, id, userID, name, slotsJSON)
	if err != nil {
		return "", err
	}
	return id, nil
}

// LoadoutList returns a user's saved loadouts (newest first).
func (s *EconomyExtStore) LoadoutList(ctx context.Context, userID string) ([]EconomyLoadout, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT id, user_id, name, slots_json, created_at FROM poker_loadout
		WHERE user_id=$1 ORDER BY created_at DESC LIMIT 100`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []EconomyLoadout
	for rows.Next() {
		var l EconomyLoadout
		if err := rows.Scan(&l.ID, &l.UserID, &l.Name, &l.SlotsJSON, &l.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, l)
	}
	return out, rows.Err()
}

// LoadoutGet returns a single loadout, or (nil, nil) if missing.
func (s *EconomyExtStore) LoadoutGet(ctx context.Context, id string) (*EconomyLoadout, error) {
	var l EconomyLoadout
	err := s.db.QueryRowContext(ctx, `
		SELECT id, user_id, name, slots_json, created_at FROM poker_loadout WHERE id=$1`, id).
		Scan(&l.ID, &l.UserID, &l.Name, &l.SlotsJSON, &l.CreatedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &l, nil
}

// --- NFT mint records ---

// EconomyNFTMint is an on-chain mint record for a cosmetic.
type EconomyNFTMint struct {
	ID         string    `json:"id"`
	UserID     string    `json:"user_id"`
	CosmeticID string    `json:"cosmetic_id"`
	Status     string    `json:"status"`
	TxHash     string    `json:"tx_hash"`
	Chain      string    `json:"chain"`
	CreatedAt  time.Time `json:"created_at"`
	UpdatedAt  time.Time `json:"updated_at"`
}

// NFTGetByCosmetic returns the mint record for a cosmetic, or (nil, nil).
func (s *EconomyExtStore) NFTGetByCosmetic(ctx context.Context, cosmeticID string) (*EconomyNFTMint, error) {
	var m EconomyNFTMint
	err := s.db.QueryRowContext(ctx, `
		SELECT id, user_id, cosmetic_id, status, tx_hash, chain, created_at, updated_at
		FROM poker_cosmetic_nft WHERE cosmetic_id=$1`, cosmeticID).
		Scan(&m.ID, &m.UserID, &m.CosmeticID, &m.Status, &m.TxHash, &m.Chain, &m.CreatedAt, &m.UpdatedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &m, nil
}

// NFTCreatePending records a pending mint (idempotent per cosmetic) and returns its id.
func (s *EconomyExtStore) NFTCreatePending(ctx context.Context, userID, cosmeticID, chain string) (string, error) {
	if chain == "" {
		chain = "polygon"
	}
	id := NewID("nft")
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO poker_cosmetic_nft (id, user_id, cosmetic_id, status, tx_hash, chain, created_at, updated_at)
		VALUES ($1,$2,$3,'pending','',$4,NOW(),NOW())
		ON CONFLICT (cosmetic_id) DO NOTHING`, id, userID, cosmeticID, chain)
	if err != nil {
		return "", err
	}
	// If a row already existed, return its id.
	existing, gerr := s.NFTGetByCosmetic(ctx, cosmeticID)
	if gerr == nil && existing != nil {
		return existing.ID, nil
	}
	return id, nil
}

// NFTMarkMinted records a successful mint (tx hash + status).
func (s *EconomyExtStore) NFTMarkMinted(ctx context.Context, cosmeticID, txHash string) error {
	_, err := s.db.ExecContext(ctx, `
		UPDATE poker_cosmetic_nft SET status='minted', tx_hash=$2, updated_at=NOW()
		WHERE cosmetic_id=$1`, cosmeticID, txHash)
	return err
}

// NFTMarkFailed records a failed mint attempt.
func (s *EconomyExtStore) NFTMarkFailed(ctx context.Context, cosmeticID string) error {
	_, err := s.db.ExecContext(ctx, `
		UPDATE poker_cosmetic_nft SET status='failed', updated_at=NOW() WHERE cosmetic_id=$1`, cosmeticID)
	return err
}
