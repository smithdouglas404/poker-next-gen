package store

import (
	"context"
	"database/sql"
)

// ModelAssetStore durably stores generated character GLBs. Tripo download URLs
// are temporary/signed, so we re-host the bytes here (keyed by cosmetic id) and
// serve them via the model_asset RPC behind /api/model/<id>. This keeps an
// equipped character alive after its original Tripo URL expires.
type ModelAssetStore struct{ db *sql.DB }

func NewModelAssetStore(db *sql.DB) *ModelAssetStore { return &ModelAssetStore{db: db} }

// Save stores (or replaces) a model's bytes for a cosmetic.
func (s *ModelAssetStore) Save(ctx context.Context, cosmeticID, contentType string, data []byte) error {
	if contentType == "" {
		contentType = "model/gltf-binary"
	}
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO poker_model_asset (cosmetic_id, content_type, data, byte_size)
		VALUES ($1,$2,$3,$4)
		ON CONFLICT (cosmetic_id) DO UPDATE
		  SET content_type=EXCLUDED.content_type, data=EXCLUDED.data, byte_size=EXCLUDED.byte_size`,
		cosmeticID, contentType, data, int64(len(data)))
	return err
}

// Get returns the stored bytes for a cosmetic, or (empty, nil, nil) if absent.
func (s *ModelAssetStore) Get(ctx context.Context, cosmeticID string) (string, []byte, error) {
	var ct string
	var data []byte
	err := s.db.QueryRowContext(ctx,
		`SELECT content_type, data FROM poker_model_asset WHERE cosmetic_id=$1`, cosmeticID).
		Scan(&ct, &data)
	if err == sql.ErrNoRows {
		return "", nil, nil
	}
	if err != nil {
		return "", nil, err
	}
	return ct, data, nil
}
