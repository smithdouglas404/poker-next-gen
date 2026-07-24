package store

import (
	"context"
	"database/sql"
	"time"
)

// PlayerFlagStore holds staff moderation flags on players.
type PlayerFlagStore struct{ db *sql.DB }

func NewPlayerFlagStore(db *sql.DB) *PlayerFlagStore { return &PlayerFlagStore{db: db} }

// PlayerFlag is a staff-set moderation flag.
type PlayerFlag struct {
	UserID    string    `json:"user_id"`
	Flagged   bool      `json:"flagged"`
	Reason    string    `json:"reason"`
	FlaggedBy string    `json:"flagged_by"`
	UpdatedAt time.Time `json:"updated_at"`
}

// Get returns a player's flag (zero-valued/unflagged if none).
func (s *PlayerFlagStore) Get(ctx context.Context, userID string) (PlayerFlag, error) {
	f := PlayerFlag{UserID: userID}
	err := s.db.QueryRowContext(ctx,
		`SELECT flagged, reason, flagged_by, updated_at FROM poker_player_flag WHERE user_id=$1`, userID).
		Scan(&f.Flagged, &f.Reason, &f.FlaggedBy, &f.UpdatedAt)
	if err == sql.ErrNoRows {
		return f, nil
	}
	return f, err
}

// Set upserts a player's flag state, reason, and the staff member who set it.
func (s *PlayerFlagStore) Set(ctx context.Context, userID string, flagged bool, reason, by string) error {
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO poker_player_flag (user_id, flagged, reason, flagged_by, updated_at)
		VALUES ($1,$2,$3,$4,NOW())
		ON CONFLICT (user_id) DO UPDATE SET
			flagged=EXCLUDED.flagged, reason=EXCLUDED.reason,
			flagged_by=EXCLUDED.flagged_by, updated_at=NOW()`,
		userID, flagged, reason, by)
	return err
}
