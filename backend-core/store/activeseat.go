package store

import (
	"context"
	"database/sql"
)

// ActiveSeatStore tracks which tables a user is currently seated at (across all
// matches), backing the tier's multi-table limit.
type ActiveSeatStore struct{ db *sql.DB }

func NewActiveSeatStore(db *sql.DB) *ActiveSeatStore { return &ActiveSeatStore{db: db} }

// Register records the user as seated at a match (idempotent).
func (s *ActiveSeatStore) Register(ctx context.Context, userID, matchID string) error {
	_, err := s.db.ExecContext(ctx,
		`INSERT INTO poker_active_seat (user_id, match_id) VALUES ($1,$2)
		 ON CONFLICT (user_id, match_id) DO NOTHING`, userID, matchID)
	return err
}

// Unregister removes a user's seat at a match.
func (s *ActiveSeatStore) Unregister(ctx context.Context, userID, matchID string) error {
	_, err := s.db.ExecContext(ctx,
		`DELETE FROM poker_active_seat WHERE user_id=$1 AND match_id=$2`, userID, matchID)
	return err
}

// Count returns how many distinct tables the user is seated at.
func (s *ActiveSeatStore) Count(ctx context.Context, userID string) (int, error) {
	var n int
	err := s.db.QueryRowContext(ctx,
		`SELECT COUNT(*) FROM poker_active_seat WHERE user_id=$1`, userID).Scan(&n)
	return n, err
}

// IsSeated reports whether the user is already registered at this match (so
// re-seating the same table does not count against the limit again).
func (s *ActiveSeatStore) IsSeated(ctx context.Context, userID, matchID string) bool {
	var one int
	err := s.db.QueryRowContext(ctx,
		`SELECT 1 FROM poker_active_seat WHERE user_id=$1 AND match_id=$2`, userID, matchID).Scan(&one)
	return err == nil
}
