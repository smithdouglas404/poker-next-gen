package store

import (
	"context"
	"database/sql"
	"time"
)

// ConsentStore records explicit sign-offs a player gives — the signup ToS/age/
// gambling-risk disclosure and the KYC provider's document-processing consent —
// each keyed by (user_id, kind, version) so a version bump is a new record
// rather than overwriting what an earlier signup actually agreed to.
type ConsentStore struct{ db *sql.DB }

func NewConsentStore(db *sql.DB) *ConsentStore { return &ConsentStore{db: db} }

// ConsentRecord is one accepted disclosure.
type ConsentRecord struct {
	Kind       string    `json:"kind"`
	Version    string    `json:"version"`
	AcceptedAt time.Time `json:"accepted_at"`
}

// Record stores an acceptance. Idempotent: re-accepting the same
// (user, kind, version) — e.g. a retried request — is a no-op, not a second row.
func (s *ConsentStore) Record(ctx context.Context, userID, kind, version string) error {
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO poker_consent (id, user_id, kind, version, accepted_at)
		VALUES ($1,$2,$3,$4,NOW())
		ON CONFLICT (user_id, kind, version) DO NOTHING`,
		NewID("consent"), userID, kind, version)
	return err
}

// Has reports whether the user has accepted this kind at this-or-a-later
// version is NOT evaluated here — callers gate on the exact version they
// require, so a bumped disclosure re-prompts rather than being silently
// satisfied by an old acceptance.
func (s *ConsentStore) Has(ctx context.Context, userID, kind, version string) (bool, error) {
	var exists bool
	err := s.db.QueryRowContext(ctx,
		`SELECT EXISTS(SELECT 1 FROM poker_consent WHERE user_id=$1 AND kind=$2 AND version=$3)`,
		userID, kind, version).Scan(&exists)
	return exists, err
}

// List returns every consent the user has on record, most recent first.
func (s *ConsentStore) List(ctx context.Context, userID string) ([]ConsentRecord, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT kind, version, accepted_at FROM poker_consent
		WHERE user_id=$1 ORDER BY accepted_at DESC`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []ConsentRecord{}
	for rows.Next() {
		var c ConsentRecord
		if err := rows.Scan(&c.Kind, &c.Version, &c.AcceptedAt); err != nil {
			return nil, err
		}
		out = append(out, c)
	}
	return out, rows.Err()
}
