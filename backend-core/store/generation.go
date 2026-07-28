package store

import (
	"context"
	"database/sql"
)

// Generation is an async Tripo3D character-generation job.
type Generation struct {
	ID           string `json:"id"`
	UserID       string `json:"user_id"`
	Prompt       string `json:"prompt"`
	TripoTask    string `json:"tripo_task_id"`
	Status       string `json:"status"`
	Stage        string `json:"stage"` // model | rig
	BaseModelURL string `json:"base_model_url,omitempty"`
	FeeCents     int64  `json:"fee_cents"`
	CosmeticID   string `json:"cosmetic_id,omitempty"`
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
		SELECT id, user_id, prompt, tripo_task_id, status, stage, base_model_url, fee_cents, cosmetic_id
		FROM poker_generation WHERE id=$1`, id).
		Scan(&g.ID, &g.UserID, &g.Prompt, &g.TripoTask, &g.Status, &g.Stage, &g.BaseModelURL, &g.FeeCents, &g.CosmeticID)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &g, nil
}

// AdvanceToRig records the base model URL and moves the job to the rig stage
// with the rig task id.
func (s *GenerationStore) AdvanceToRig(ctx context.Context, id, baseModelURL, rigTaskID string) error {
	_, err := s.db.ExecContext(ctx, `
		UPDATE poker_generation SET stage='rig', base_model_url=$2, tripo_task_id=$3, updated_at=NOW()
		WHERE id=$1`, id, baseModelURL, rigTaskID)
	return err
}

// AdvanceToRetarget moves a rigged job into the animation-retarget stage, keeping
// the rigged model as the fallback if the retarget fails.
func (s *GenerationStore) AdvanceToRetarget(ctx context.Context, id, riggedModelURL, retargetTaskID string) error {
	_, err := s.db.ExecContext(ctx, `
		UPDATE poker_generation SET stage='retarget', base_model_url=$2, tripo_task_id=$3, updated_at=NOW()
		WHERE id=$1`, id, riggedModelURL, retargetTaskID)
	return err
}

// ClaimMinting atomically transitions a generation from a non-terminal state
// to 'minting', reporting whether THIS call won the claim. Status is polled by
// the client, so two concurrent polls can both observe Tripo's task as
// "success" and both reach the mint step — without this claim, both would
// call CosmeticStore.Create (which has no dedup on generation id) and mint TWO
// cosmetics for one character_generate_fee. Only the caller that wins the
// claim may mint; the loser reports "still running" and picks up the real
// terminal state (with the winner's cosmetic id) on its next poll.
func (s *GenerationStore) ClaimMinting(ctx context.Context, id string) (bool, error) {
	res, err := s.db.ExecContext(ctx,
		`UPDATE poker_generation SET status='minting', updated_at=NOW()
		 WHERE id=$1 AND status NOT IN ('minting','success','failed')`, id)
	if err != nil {
		return false, err
	}
	n, err := res.RowsAffected()
	if err != nil {
		return false, err
	}
	return n == 1, nil
}

// Complete marks the job successful and records the minted cosmetic id. Only
// transitions a row this same flow already claimed via ClaimMinting — a
// no-op guard, since ClaimMinting is what actually prevents the double-mint,
// but it keeps this call honest about what state it expects to be finishing.
func (s *GenerationStore) Complete(ctx context.Context, id, cosmeticID string) error {
	_, err := s.db.ExecContext(ctx,
		`UPDATE poker_generation SET status='success', cosmetic_id=$2, updated_at=NOW()
		 WHERE id=$1 AND status='minting'`, id, cosmeticID)
	return err
}

// Fail marks a generation failed and reports whether THIS call performed the
// transition.
//
// The bool is what makes a refund safe. Status is polled by the client, so two
// polls can reach the failure branch at once; refunding on every call that
// "failed" the job would credit the fee twice. Only the caller that actually
// moved the row out of a running state pays the refund.
func (s *GenerationStore) Fail(ctx context.Context, id string) (bool, error) {
	res, err := s.db.ExecContext(ctx,
		`UPDATE poker_generation SET status='failed', updated_at=NOW()
		 WHERE id=$1 AND status NOT IN ('failed','success')`, id)
	if err != nil {
		return false, err
	}
	n, err := res.RowsAffected()
	if err != nil {
		return false, err
	}
	return n == 1, nil
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
