package store

import (
	"context"
	"database/sql"
)

// Generation is an async Tripo3D character-generation job.
type Generation struct {
	ID         string `json:"id"`
	UserID     string `json:"user_id"`
	Prompt     string `json:"prompt"`
	TripoTask  string `json:"tripo_task_id"`
	Status     string `json:"status"`
	FeeCents   int64  `json:"fee_cents"`
	CosmeticID string `json:"cosmetic_id,omitempty"`
}

type GenerationStore struct{ db *sql.DB }

func NewGenerationStore(db *sql.DB) *GenerationStore { return &GenerationStore{db: db} }

func (s *GenerationStore) Create(ctx context.Context, userID, prompt string, feeCents int64) (string, error) {
	id := NewID("gen")
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO poker_generation (id, user_id, prompt, fee_cents, status)
		VALUES ($1,$2,$3,$4,'pending')`, id, userID, prompt, feeCents)
	return id, err
}

func (s *GenerationStore) SetTaskID(ctx context.Context, id, taskID string) error {
	_, err := s.db.ExecContext(ctx,
		`UPDATE poker_generation SET tripo_task_id=$2, status='running', updated_at=NOW() WHERE id=$1`, id, taskID)
	return err
}

func (s *GenerationStore) GetByID(ctx context.Context, id string) (*Generation, error) {
	var g Generation
	err := s.db.QueryRowContext(ctx, `
		SELECT id, user_id, prompt, tripo_task_id, status, fee_cents, cosmetic_id
		FROM poker_generation WHERE id=$1`, id).
		Scan(&g.ID, &g.UserID, &g.Prompt, &g.TripoTask, &g.Status, &g.FeeCents, &g.CosmeticID)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &g, nil
}

// Complete marks the job successful and records the minted cosmetic id.
func (s *GenerationStore) Complete(ctx context.Context, id, cosmeticID string) error {
	_, err := s.db.ExecContext(ctx,
		`UPDATE poker_generation SET status='success', cosmetic_id=$2, updated_at=NOW() WHERE id=$1`, id, cosmeticID)
	return err
}

func (s *GenerationStore) Fail(ctx context.Context, id string) error {
	_, err := s.db.ExecContext(ctx,
		`UPDATE poker_generation SET status='failed', updated_at=NOW() WHERE id=$1`, id)
	return err
}

func (s *GenerationStore) List(ctx context.Context, userID string, limit int) ([]Generation, error) {
	if limit <= 0 || limit > 50 {
		limit = 20
	}
	rows, err := s.db.QueryContext(ctx, `
		SELECT id, user_id, prompt, tripo_task_id, status, fee_cents, cosmetic_id
		FROM poker_generation WHERE user_id=$1 ORDER BY created_at DESC LIMIT $2`, userID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Generation
	for rows.Next() {
		var g Generation
		if err := rows.Scan(&g.ID, &g.UserID, &g.Prompt, &g.TripoTask, &g.Status, &g.FeeCents, &g.CosmeticID); err != nil {
			return nil, err
		}
		out = append(out, g)
	}
	return out, rows.Err()
}
