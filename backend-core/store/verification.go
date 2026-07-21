package store

import (
	"context"
	"database/sql"
)

// VerificationStore tracks progressive identity verification per kind
// (email | biometric | kyc_aml).
type VerificationStore struct{ db *sql.DB }

func NewVerificationStore(db *sql.DB) *VerificationStore { return &VerificationStore{db: db} }

// StartPending records that a verification session was opened for a kind.
func (s *VerificationStore) StartPending(ctx context.Context, userID, kind, sessionID string) error {
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO poker_verification (user_id, kind, status, session_id, updated_at)
		VALUES ($1,$2,'pending',$3,NOW())
		ON CONFLICT (user_id, kind) DO UPDATE SET
			status='pending', session_id=$3, updated_at=NOW()`,
		userID, kind, sessionID)
	return err
}

// ResolveSession maps a Didit session id back to its (user, kind).
func (s *VerificationStore) ResolveSession(ctx context.Context, sessionID string) (userID, kind string, err error) {
	err = s.db.QueryRowContext(ctx,
		`SELECT user_id, kind FROM poker_verification WHERE session_id=$1`, sessionID).
		Scan(&userID, &kind)
	if err == sql.ErrNoRows {
		return "", "", nil
	}
	return userID, kind, err
}

// SetStatus applies a decision to a specific (user, kind).
func (s *VerificationStore) SetStatus(ctx context.Context, userID, kind, status string) error {
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO poker_verification (user_id, kind, status, updated_at)
		VALUES ($1,$2,$3,NOW())
		ON CONFLICT (user_id, kind) DO UPDATE SET status=$3, updated_at=NOW()`,
		userID, kind, status)
	return err
}

// Statuses returns kind -> status for a user (kinds with no row are omitted).
func (s *VerificationStore) Statuses(ctx context.Context, userID string) (map[string]string, error) {
	rows, err := s.db.QueryContext(ctx,
		`SELECT kind, status FROM poker_verification WHERE user_id=$1`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[string]string{}
	for rows.Next() {
		var k, st string
		if err := rows.Scan(&k, &st); err != nil {
			return nil, err
		}
		out[k] = st
	}
	return out, rows.Err()
}

// Verified reports whether a user has a verified status for a kind.
func (s *VerificationStore) Verified(ctx context.Context, userID, kind string) (bool, error) {
	var status string
	err := s.db.QueryRowContext(ctx,
		`SELECT status FROM poker_verification WHERE user_id=$1 AND kind=$2`, userID, kind).
		Scan(&status)
	if err == sql.ErrNoRows {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	return status == "verified", nil
}
