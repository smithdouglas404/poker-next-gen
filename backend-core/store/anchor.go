package store

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
)

// AnchorBatch is a Merkle-root anchor of a batch of audit events.
type AnchorBatch struct {
	ID         string `json:"id"`
	MerkleRoot string `json:"merkle_root"`
	EventCount int    `json:"event_count"`
	TxHash     string `json:"tx_hash"`
	Chain      string `json:"chain"`
	Status     string `json:"status"`
}

type AnchorStore struct{ db *sql.DB }

func NewAnchorStore(db *sql.DB) *AnchorStore { return &AnchorStore{db: db} }

// UnanchoredEvents returns up to `limit` audit events not yet anchored, oldest
// first, as (ids, payloadHashes).
func (s *AnchorStore) UnanchoredEvents(ctx context.Context, limit int) (ids []string, hashes []string, err error) {
	if limit <= 0 || limit > 5000 {
		limit = 1000
	}
	rows, err := s.db.QueryContext(ctx, `
		SELECT id, payload_hash FROM poker_audit_event
		WHERE anchor_ref='' ORDER BY created_at ASC, id ASC LIMIT $1`, limit)
	if err != nil {
		return nil, nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var id, h string
		if err := rows.Scan(&id, &h); err != nil {
			return nil, nil, err
		}
		ids = append(ids, id)
		hashes = append(hashes, h)
	}
	return ids, hashes, rows.Err()
}

// MerkleRoot computes a binary SHA-256 Merkle root over the leaf hashes (odd
// nodes are duplicated). Returns "" for an empty set.
func MerkleRoot(hashes []string) string {
	if len(hashes) == 0 {
		return ""
	}
	level := make([][]byte, len(hashes))
	for i, h := range hashes {
		b, err := hex.DecodeString(h)
		if err != nil {
			// Fall back to hashing the raw string so non-hex inputs still work.
			sum := sha256.Sum256([]byte(h))
			b = sum[:]
		}
		level[i] = b
	}
	for len(level) > 1 {
		if len(level)%2 == 1 {
			level = append(level, level[len(level)-1]) // duplicate last
		}
		next := make([][]byte, 0, len(level)/2)
		for i := 0; i < len(level); i += 2 {
			h := sha256.New()
			h.Write(level[i])
			h.Write(level[i+1])
			next = append(next, h.Sum(nil))
		}
		level = next
	}
	return "0x" + hex.EncodeToString(level[0])
}

// CreateBatch inserts a pending batch and returns its id.
func (s *AnchorStore) CreateBatch(ctx context.Context, root string, count int, chain string) (string, error) {
	id := NewID("anch")
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO poker_anchor_batch (id, merkle_root, event_count, chain, status)
		VALUES ($1,$2,$3,$4,'pending')`, id, root, count, chain)
	return id, err
}

// MarkAnchored records the tx hash on the batch and stamps anchor_ref on every
// event in the batch — in one transaction.
func (s *AnchorStore) MarkAnchored(ctx context.Context, batchID, txHash string, eventIDs []string) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if _, err := tx.ExecContext(ctx,
		`UPDATE poker_anchor_batch SET status='anchored', tx_hash=$2 WHERE id=$1`, batchID, txHash); err != nil {
		return err
	}
	for _, id := range eventIDs {
		if _, err := tx.ExecContext(ctx,
			`UPDATE poker_audit_event SET anchor_ref=$2 WHERE id=$1`, id, txHash); err != nil {
			return err
		}
	}
	return tx.Commit()
}

// MarkFailed flips a batch to failed (events stay unanchored for retry).
func (s *AnchorStore) MarkFailed(ctx context.Context, batchID string) error {
	_, err := s.db.ExecContext(ctx, `UPDATE poker_anchor_batch SET status='failed' WHERE id=$1`, batchID)
	return err
}

// Latest returns the most recent anchored batch, or nil.
func (s *AnchorStore) Latest(ctx context.Context) (*AnchorBatch, error) {
	var b AnchorBatch
	err := s.db.QueryRowContext(ctx, `
		SELECT id, merkle_root, event_count, tx_hash, chain, status
		FROM poker_anchor_batch WHERE status='anchored' ORDER BY created_at DESC LIMIT 1`).
		Scan(&b.ID, &b.MerkleRoot, &b.EventCount, &b.TxHash, &b.Chain, &b.Status)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &b, nil
}
