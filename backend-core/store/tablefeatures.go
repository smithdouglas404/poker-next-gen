package store

import (
	"context"
	"database/sql"
	"encoding/json"
)

// RunItTwiceStore persists the boards dealt when an all-in hand is run multiple
// times, so the outcome is auditable/replayable per hand. It is purely a record;
// pot settlement happens in the match loop.
type RunItTwiceStore struct{ db *sql.DB }

func NewRunItTwiceStore(db *sql.DB) *RunItTwiceStore { return &RunItTwiceStore{db: db} }

// Record stores the full boards (each a concatenated card-code string) for a
// run-it-twice hand. Idempotent per (match_id, hand_no).
func (s *RunItTwiceStore) Record(ctx context.Context, matchID string, handNo int, boards []string) error {
	if matchID == "" || len(boards) == 0 {
		return nil
	}
	blob, err := json.Marshal(boards)
	if err != nil {
		return err
	}
	_, err = s.db.ExecContext(ctx, `
		INSERT INTO poker_run_it_twice (id, match_id, hand_no, boards, board_count)
		VALUES ($1,$2,$3,$4,$5)
		ON CONFLICT (match_id, hand_no) DO UPDATE SET
			boards=EXCLUDED.boards, board_count=EXCLUDED.board_count`,
		NewID("rit"), matchID, handNo, string(blob), len(boards))
	return err
}

// InsuranceStore persists all-in insurance policies. Money movement (premium
// debit on accept, payout credit on loss) happens against the wallet in the
// match loop; this store is the durable ledger of what was written.
type InsuranceStore struct{ db *sql.DB }

func NewInsuranceStore(db *sql.DB) *InsuranceStore { return &InsuranceStore{db: db} }

// RecordAccepted writes an accepted policy (status "accepted"). Idempotent per
// (match_id, hand_no, user_id).
func (s *InsuranceStore) RecordAccepted(ctx context.Context, matchID string, handNo int, userID string, premium, payout int64, equity float64) error {
	if matchID == "" || userID == "" {
		return nil
	}
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO poker_insurance (id, match_id, hand_no, user_id, premium, payout, equity, status)
		VALUES ($1,$2,$3,$4,$5,$6,$7,'accepted')
		ON CONFLICT (match_id, hand_no, user_id) DO UPDATE SET
			premium=EXCLUDED.premium, payout=EXCLUDED.payout, equity=EXCLUDED.equity, status='accepted'`,
		NewID("ins"), matchID, handNo, userID, premium, payout, equity)
	return err
}

// Settle marks a policy resolved: "paid" when the insured player lost and the
// payout was credited, "won" when the player won the hand (no payout owed).
func (s *InsuranceStore) Settle(ctx context.Context, matchID string, handNo int, userID string, paid bool) error {
	status := "won"
	if paid {
		status = "paid"
	}
	_, err := s.db.ExecContext(ctx, `
		UPDATE poker_insurance SET status=$4, settled_at=NOW()
		WHERE match_id=$1 AND hand_no=$2 AND user_id=$3`,
		matchID, handNo, userID, status)
	return err
}
