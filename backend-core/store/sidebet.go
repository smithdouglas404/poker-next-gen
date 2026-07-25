package store

import (
	"context"
	"database/sql"
	"time"
)

// SidebetStore backs player-vs-player side bets. It owns only the sidebet rows;
// the RPC layer pairs create/accept with wallet debits (escrow) and settle/cancel
// with wallet credits, in an order that guarantees stakes are escrowed before a
// payout can occur. Status transitions are atomic (WHERE status=…) so a bet
// settles or cancels exactly once.
type SidebetStore struct{ db *sql.DB }

func NewSidebetStore(db *sql.DB) *SidebetStore { return &SidebetStore{db: db} }

// Sidebet is one side bet.
type Sidebet struct {
	ID           string     `json:"id"`
	MatchID      string     `json:"match_id"`
	HandNo       int        `json:"hand_no"`
	Proposer     string     `json:"proposer"`
	ProposerName string     `json:"proposer_name"`
	Acceptor     string     `json:"acceptor"`
	AcceptorName string     `json:"acceptor_name"`
	Proposition  string     `json:"proposition"`
	StakeMinor   int64      `json:"stake_minor"`
	Status       string     `json:"status"`
	Winner       string     `json:"winner"`
	CreatedAt    time.Time  `json:"created_at"`
	SettledAt    *time.Time `json:"settled_at,omitempty"`
}

// Create inserts an offered side bet (proposer stake already escrowed).
func (s *SidebetStore) Create(ctx context.Context, b *Sidebet) (string, error) {
	if b.ID == "" {
		b.ID = NewID("sb")
	}
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO poker_sidebet (id, match_id, hand_no, proposer, proposer_name, proposition, stake_minor, status)
		VALUES ($1,$2,$3,$4,$5,$6,$7,'offered')`,
		b.ID, b.MatchID, b.HandNo, b.Proposer, b.ProposerName, b.Proposition, b.StakeMinor)
	return b.ID, err
}

// Get returns a side bet by id (nil if missing).
func (s *SidebetStore) Get(ctx context.Context, id string) (*Sidebet, error) {
	var b Sidebet
	var settled sql.NullTime
	err := s.db.QueryRowContext(ctx, `
		SELECT id, match_id, hand_no, proposer, proposer_name, acceptor, acceptor_name, proposition,
		       stake_minor, status, winner, created_at, settled_at FROM poker_sidebet WHERE id=$1`, id).
		Scan(&b.ID, &b.MatchID, &b.HandNo, &b.Proposer, &b.ProposerName, &b.Acceptor, &b.AcceptorName,
			&b.Proposition, &b.StakeMinor, &b.Status, &b.Winner, &b.CreatedAt, &settled)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	if settled.Valid {
		b.SettledAt = &settled.Time
	}
	return &b, nil
}

// Accept atomically moves an offered bet to accepted with the acceptor recorded.
// Returns false if it was not still offered (already taken/cancelled).
func (s *SidebetStore) Accept(ctx context.Context, id, acceptor, acceptorName string) (bool, error) {
	res, err := s.db.ExecContext(ctx, `
		UPDATE poker_sidebet SET acceptor=$2, acceptor_name=$3, status='accepted'
		WHERE id=$1 AND status='offered'`, id, acceptor, acceptorName)
	if err != nil {
		return false, err
	}
	n, _ := res.RowsAffected()
	return n == 1, nil
}

// Settle atomically finalizes an accepted bet, recording the winner. Returns
// false if it was not still accepted (already settled/cancelled).
func (s *SidebetStore) Settle(ctx context.Context, id, winner string) (bool, error) {
	res, err := s.db.ExecContext(ctx, `
		UPDATE poker_sidebet SET status='settled', winner=$2, settled_at=NOW()
		WHERE id=$1 AND status='accepted'`, id, winner)
	if err != nil {
		return false, err
	}
	n, _ := res.RowsAffected()
	return n == 1, nil
}

// Cancel atomically cancels an unaccepted offer (proposer refund). Returns false
// if it was not still offered.
func (s *SidebetStore) Cancel(ctx context.Context, id string) (bool, error) {
	res, err := s.db.ExecContext(ctx, `
		UPDATE poker_sidebet SET status='cancelled', settled_at=NOW()
		WHERE id=$1 AND status='offered'`, id)
	if err != nil {
		return false, err
	}
	n, _ := res.RowsAffected()
	return n == 1, nil
}

// ListForMatch returns open + recently-settled side bets at a match (newest first).
func (s *SidebetStore) ListForMatch(ctx context.Context, matchID string, limit int) ([]Sidebet, error) {
	if limit <= 0 || limit > 200 {
		limit = 50
	}
	rows, err := s.db.QueryContext(ctx, `
		SELECT id, match_id, hand_no, proposer, proposer_name, acceptor, acceptor_name, proposition,
		       stake_minor, status, winner, created_at, settled_at
		FROM poker_sidebet WHERE match_id=$1 ORDER BY created_at DESC LIMIT $2`, matchID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Sidebet{}
	for rows.Next() {
		var b Sidebet
		var settled sql.NullTime
		if err := rows.Scan(&b.ID, &b.MatchID, &b.HandNo, &b.Proposer, &b.ProposerName, &b.Acceptor,
			&b.AcceptorName, &b.Proposition, &b.StakeMinor, &b.Status, &b.Winner, &b.CreatedAt, &settled); err != nil {
			return nil, err
		}
		if settled.Valid {
			b.SettledAt = &settled.Time
		}
		out = append(out, b)
	}
	return out, rows.Err()
}
