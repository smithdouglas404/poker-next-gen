package store

import (
	"context"
	"database/sql"
	"time"
)

// GuestSessionStore tracks a GUEST (no registered account) who sits at a club's
// private/coded table, so the club operator can reconcile that player's position
// after they leave. The guest plays under the operator's default limit; every
// chip move is already in the double-entry ledger (account "user:<guest>"), and
// this record is the operator-facing "still owed / to settle" row. Mirrors the
// credit-request pattern: an atomic Reconcile guard resolves each session once.
type GuestSessionStore struct{ db *sql.DB }

func NewGuestSessionStore(db *sql.DB) *GuestSessionStore { return &GuestSessionStore{db: db} }

// GuestSession is one guest's tracked appearance at a club table.
type GuestSession struct {
	ID           string     `json:"id"`
	ClubID       string     `json:"club_id"`
	MatchID      string     `json:"match_id"`
	UserID       string     `json:"user_id"`
	Username     string     `json:"username"`
	LimitMinor   int64      `json:"limit_minor"`  // operator's default guest limit applied
	BuyInMinor   int64      `json:"buy_in_minor"` // chips reserved when they sat
	Status       string     `json:"status"`       // open | reconciled
	NetMinor     int64      `json:"net_minor"`    // ledger net at reconciliation (settle time)
	ReconciledBy string     `json:"reconciled_by"`
	CreatedAt    time.Time  `json:"created_at"`
	ReconciledAt *time.Time `json:"reconciled_at,omitempty"`
}

// Create inserts an open guest-session and returns its id.
func (s *GuestSessionStore) Create(ctx context.Context, g *GuestSession) (string, error) {
	if g.ID == "" {
		g.ID = NewID("gs")
	}
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO poker_guest_session (id, club_id, match_id, user_id, username, limit_minor, buy_in_minor, status)
		VALUES ($1,$2,$3,$4,$5,$6,$7,'open')`,
		g.ID, g.ClubID, g.MatchID, g.UserID, g.Username, g.LimitMinor, g.BuyInMinor)
	return g.ID, err
}

// ListOpen returns a club's still-open guest sessions (oldest first).
func (s *GuestSessionStore) ListOpen(ctx context.Context, clubID string) ([]GuestSession, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT id, club_id, match_id, user_id, username, limit_minor, buy_in_minor, status, net_minor, reconciled_by, created_at, reconciled_at
		FROM poker_guest_session WHERE club_id=$1 AND status='open' ORDER BY created_at ASC`, clubID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []GuestSession{}
	for rows.Next() {
		var g GuestSession
		var reconciled sql.NullTime
		if err := rows.Scan(&g.ID, &g.ClubID, &g.MatchID, &g.UserID, &g.Username, &g.LimitMinor, &g.BuyInMinor, &g.Status, &g.NetMinor, &g.ReconciledBy, &g.CreatedAt, &reconciled); err != nil {
			return nil, err
		}
		if reconciled.Valid {
			g.ReconciledAt = &reconciled.Time
		}
		out = append(out, g)
	}
	return out, rows.Err()
}

// Get returns a guest session by id (nil if missing).
func (s *GuestSessionStore) Get(ctx context.Context, id string) (*GuestSession, error) {
	var g GuestSession
	var reconciled sql.NullTime
	err := s.db.QueryRowContext(ctx, `
		SELECT id, club_id, match_id, user_id, username, limit_minor, buy_in_minor, status, net_minor, reconciled_by, created_at, reconciled_at
		FROM poker_guest_session WHERE id=$1`, id).
		Scan(&g.ID, &g.ClubID, &g.MatchID, &g.UserID, &g.Username, &g.LimitMinor, &g.BuyInMinor, &g.Status, &g.NetMinor, &g.ReconciledBy, &g.CreatedAt, &reconciled)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	if reconciled.Valid {
		g.ReconciledAt = &reconciled.Time
	}
	return &g, nil
}

// Reconcile atomically closes an open guest session, recording the settled net
// position. Returns false if it was not still open, so a session settles once.
func (s *GuestSessionStore) Reconcile(ctx context.Context, id, reconciledBy string, netMinor int64) (bool, error) {
	res, err := s.db.ExecContext(ctx, `
		UPDATE poker_guest_session SET status='reconciled', net_minor=$2, reconciled_by=$3, reconciled_at=NOW()
		WHERE id=$1 AND status='open'`, id, netMinor, reconciledBy)
	if err != nil {
		return false, err
	}
	n, _ := res.RowsAffected()
	return n == 1, nil
}
