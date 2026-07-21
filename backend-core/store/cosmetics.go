package store

import (
	"context"
	"database/sql"
)

// Cosmetic is a sellable/ownable item (character model, taunt, card back, …).
type Cosmetic struct {
	ID          string `json:"id"`
	Kind        string `json:"kind"`
	Name        string `json:"name"`
	Rarity      string `json:"rarity"`
	AssetRef    string `json:"asset_ref"`
	PreviewRef  string `json:"preview_ref"`
	OwnerUserID string `json:"owner_user_id,omitempty"`
	PriceCents  int64  `json:"price_cents"`
	Active      bool   `json:"active"`
}

type CosmeticStore struct{ db *sql.DB }

func NewCosmeticStore(db *sql.DB) *CosmeticStore { return &CosmeticStore{db: db} }

// Create inserts a cosmetic and returns its id.
func (s *CosmeticStore) Create(ctx context.Context, c *Cosmetic) (string, error) {
	if c.ID == "" {
		c.ID = NewID("cos")
	}
	if c.Rarity == "" {
		c.Rarity = "common"
	}
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO poker_cosmetic (id, kind, name, rarity, asset_ref, preview_ref, owner_user_id, price_cents, active)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,TRUE)`,
		c.ID, c.Kind, c.Name, c.Rarity, c.AssetRef, c.PreviewRef, c.OwnerUserID, c.PriceCents)
	return c.ID, err
}

// SetAssetRef updates a cosmetic's asset reference — used to repoint a freshly
// minted generated model from its temporary Tripo URL to the durable
// /api/model/<id> URL once the bytes are re-hosted.
func (s *CosmeticStore) SetAssetRef(ctx context.Context, id, assetRef string) error {
	_, err := s.db.ExecContext(ctx, `UPDATE poker_cosmetic SET asset_ref=$2 WHERE id=$1`, id, assetRef)
	return err
}

// GetByID returns a cosmetic, or (nil, nil) if missing.
func (s *CosmeticStore) GetByID(ctx context.Context, id string) (*Cosmetic, error) {
	var c Cosmetic
	err := s.db.QueryRowContext(ctx, `
		SELECT id, kind, name, rarity, asset_ref, preview_ref, owner_user_id, price_cents, active
		FROM poker_cosmetic WHERE id=$1`, id).
		Scan(&c.ID, &c.Kind, &c.Name, &c.Rarity, &c.AssetRef, &c.PreviewRef, &c.OwnerUserID, &c.PriceCents, &c.Active)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &c, nil
}

// ListActive returns active catalog items, optionally filtered by kind.
func (s *CosmeticStore) ListActive(ctx context.Context, kind string) ([]Cosmetic, error) {
	q := `SELECT id, kind, name, rarity, asset_ref, preview_ref, owner_user_id, price_cents, active
	      FROM poker_cosmetic WHERE active`
	args := []interface{}{}
	if kind != "" {
		q += ` AND kind=$1`
		args = append(args, kind)
	}
	q += ` ORDER BY created_at DESC LIMIT 200`
	rows, err := s.db.QueryContext(ctx, q, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanCosmetics(rows)
}

// --- Inventory ---

// Grant adds a cosmetic to a user's inventory (idempotent).
func (s *CosmeticStore) Grant(ctx context.Context, userID, cosmeticID, source string) error {
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO poker_inventory (user_id, cosmetic_id, source, acquired_at)
		VALUES ($1,$2,$3,NOW()) ON CONFLICT (user_id, cosmetic_id) DO NOTHING`,
		userID, cosmeticID, source)
	return err
}

// Owns reports whether a user holds a cosmetic.
func (s *CosmeticStore) Owns(ctx context.Context, userID, cosmeticID string) bool {
	var one int
	err := s.db.QueryRowContext(ctx,
		`SELECT 1 FROM poker_inventory WHERE user_id=$1 AND cosmetic_id=$2`, userID, cosmeticID).Scan(&one)
	return err == nil
}

// Inventory returns the cosmetics a user owns.
func (s *CosmeticStore) Inventory(ctx context.Context, userID string) ([]Cosmetic, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT c.id, c.kind, c.name, c.rarity, c.asset_ref, c.preview_ref, c.owner_user_id, c.price_cents, c.active
		FROM poker_inventory i JOIN poker_cosmetic c ON c.id=i.cosmetic_id
		WHERE i.user_id=$1 ORDER BY i.acquired_at DESC`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanCosmetics(rows)
}

// TransferOwnership moves a cosmetic from one user's inventory to another (used
// by the marketplace). Idempotent-safe on the destination.
func (s *CosmeticStore) TransferOwnership(ctx context.Context, tx *sql.Tx, cosmeticID, fromUser, toUser string) error {
	if _, err := tx.ExecContext(ctx, `DELETE FROM poker_inventory WHERE user_id=$1 AND cosmetic_id=$2`, fromUser, cosmeticID); err != nil {
		return err
	}
	_, err := tx.ExecContext(ctx, `
		INSERT INTO poker_inventory (user_id, cosmetic_id, source, acquired_at)
		VALUES ($1,$2,'marketplace',NOW()) ON CONFLICT (user_id, cosmetic_id) DO NOTHING`, toUser, cosmeticID)
	return err
}

// --- Equipped ---

// Equip sets the user's equipped cosmetic for a kind (must own it).
func (s *CosmeticStore) Equip(ctx context.Context, userID, kind, cosmeticID string) error {
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO poker_equipped (user_id, kind, cosmetic_id) VALUES ($1,$2,$3)
		ON CONFLICT (user_id, kind) DO UPDATE SET cosmetic_id=EXCLUDED.cosmetic_id`,
		userID, kind, cosmeticID)
	return err
}

// Equipped returns a user's equipped cosmetic ids keyed by kind.
func (s *CosmeticStore) Equipped(ctx context.Context, userID string) (map[string]string, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT kind, cosmetic_id FROM poker_equipped WHERE user_id=$1`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[string]string{}
	for rows.Next() {
		var k, c string
		if err := rows.Scan(&k, &c); err != nil {
			return nil, err
		}
		out[k] = c
	}
	return out, rows.Err()
}

func scanCosmetics(rows *sql.Rows) ([]Cosmetic, error) {
	var out []Cosmetic
	for rows.Next() {
		var c Cosmetic
		if err := rows.Scan(&c.ID, &c.Kind, &c.Name, &c.Rarity, &c.AssetRef, &c.PreviewRef, &c.OwnerUserID, &c.PriceCents, &c.Active); err != nil {
			return nil, err
		}
		out = append(out, c)
	}
	return out, rows.Err()
}
