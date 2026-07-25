package store

import (
	"context"
	"database/sql"
	"time"
)

// StakingStore backs the player-backing (staking) marketplace. It owns only the
// deal rows; the RPC layer pairs each status transition with the matching wallet
// movement, ordered so the stake is escrowed from the backer BEFORE it is ever
// advanced to a player, and a settlement only moves the repay amount both parties
// agreed on. Every transition is atomic (WHERE status=…) so a deal advances
// exactly once — no double-accept, double-settle, or settle-after-cancel.
//
// Lifecycle:
//   offered        — backer posted an open offer; stake escrowed from the backer.
//   active         — a player accepted; stake advanced to the player as bankroll.
//   settle_proposed— one party proposed a repay amount; awaiting the other's OK.
//   settled        — both agreed; player repaid the backer (terminal).
//   cancelled      — backer withdrew an unaccepted offer; stake refunded (terminal).
//   declined       — a player declined an unaccepted offer; stake refunded (terminal).
type StakingStore struct{ db *sql.DB }

func NewStakingStore(db *sql.DB) *StakingStore { return &StakingStore{db: db} }

// StakingDeal is one backing arrangement.
type StakingDeal struct {
	ID               string     `json:"id"`
	Backer           string     `json:"backer"`
	BackerName       string     `json:"backer_name"`
	Player           string     `json:"player"`
	PlayerName       string     `json:"player_name"`
	StakeMinor       int64      `json:"stake_minor"`
	MarkupBps        int        `json:"markup_bps"` // backer's intended profit share (terms/display only)
	Note             string     `json:"note"`
	Status           string     `json:"status"`
	SettleProposedBy string     `json:"settle_proposed_by"` // user id of whoever proposed the current repay
	RepayMinor       int64      `json:"repay_minor"`        // proposed / agreed repay to the backer
	CreatedAt        time.Time  `json:"created_at"`
	SettledAt        *time.Time `json:"settled_at,omitempty"`
}

// Create inserts an offered deal (backer stake already escrowed by the caller).
func (s *StakingStore) Create(ctx context.Context, d *StakingDeal) (string, error) {
	if d.ID == "" {
		d.ID = NewID("stake")
	}
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO poker_staking_deal (id, backer, backer_name, stake_minor, markup_bps, note, status)
		VALUES ($1,$2,$3,$4,$5,$6,'offered')`,
		d.ID, d.Backer, d.BackerName, d.StakeMinor, d.MarkupBps, d.Note)
	return d.ID, err
}

// Get returns a deal by id (nil if missing).
func (s *StakingStore) Get(ctx context.Context, id string) (*StakingDeal, error) {
	var d StakingDeal
	var settled sql.NullTime
	err := s.db.QueryRowContext(ctx, `
		SELECT id, backer, backer_name, player, player_name, stake_minor, markup_bps, note,
		       status, settle_proposed_by, repay_minor, created_at, settled_at
		FROM poker_staking_deal WHERE id=$1`, id).
		Scan(&d.ID, &d.Backer, &d.BackerName, &d.Player, &d.PlayerName, &d.StakeMinor, &d.MarkupBps, &d.Note,
			&d.Status, &d.SettleProposedBy, &d.RepayMinor, &d.CreatedAt, &settled)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	if settled.Valid {
		d.SettledAt = &settled.Time
	}
	return &d, nil
}

// Accept atomically moves an offered deal to active with the player recorded.
// Returns false if it was not still offered (already taken/cancelled/declined).
func (s *StakingStore) Accept(ctx context.Context, id, player, playerName string) (bool, error) {
	res, err := s.db.ExecContext(ctx, `
		UPDATE poker_staking_deal SET player=$2, player_name=$3, status='active'
		WHERE id=$1 AND status='offered'`, id, player, playerName)
	if err != nil {
		return false, err
	}
	n, _ := res.RowsAffected()
	return n == 1, nil
}

// Cancel atomically cancels an unaccepted offer (backer refund). Returns false if
// it was not still offered.
func (s *StakingStore) Cancel(ctx context.Context, id string) (bool, error) {
	return s.terminate(ctx, id, "cancelled")
}

// Decline atomically declines an unaccepted offer (backer refund). Returns false
// if it was not still offered.
func (s *StakingStore) Decline(ctx context.Context, id string) (bool, error) {
	return s.terminate(ctx, id, "declined")
}

func (s *StakingStore) terminate(ctx context.Context, id, status string) (bool, error) {
	res, err := s.db.ExecContext(ctx, `
		UPDATE poker_staking_deal SET status=$2, settled_at=NOW()
		WHERE id=$1 AND status='offered'`, id, status)
	if err != nil {
		return false, err
	}
	n, _ := res.RowsAffected()
	return n == 1, nil
}

// ProposeSettle records a repay proposal from either party. Allowed from 'active'
// (first proposal) or 'settle_proposed' (a counter-proposal replaces the prior
// one). Returns false if the deal is not in a proposable state.
func (s *StakingStore) ProposeSettle(ctx context.Context, id, by string, repayMinor int64) (bool, error) {
	res, err := s.db.ExecContext(ctx, `
		UPDATE poker_staking_deal SET status='settle_proposed', settle_proposed_by=$2, repay_minor=$3
		WHERE id=$1 AND status IN ('active','settle_proposed')`, id, by, repayMinor)
	if err != nil {
		return false, err
	}
	n, _ := res.RowsAffected()
	return n == 1, nil
}

// ConfirmSettle atomically finalizes a proposed settlement. Returns false if the
// deal was not still awaiting confirmation.
func (s *StakingStore) ConfirmSettle(ctx context.Context, id string) (bool, error) {
	res, err := s.db.ExecContext(ctx, `
		UPDATE poker_staking_deal SET status='settled', settled_at=NOW()
		WHERE id=$1 AND status='settle_proposed'`, id)
	if err != nil {
		return false, err
	}
	n, _ := res.RowsAffected()
	return n == 1, nil
}

// RejectSettle sends a proposed settlement back to 'active' to renegotiate.
// Returns false if the deal was not awaiting confirmation.
func (s *StakingStore) RejectSettle(ctx context.Context, id string) (bool, error) {
	res, err := s.db.ExecContext(ctx, `
		UPDATE poker_staking_deal SET status='active', settle_proposed_by='', repay_minor=0
		WHERE id=$1 AND status='settle_proposed'`, id)
	if err != nil {
		return false, err
	}
	n, _ := res.RowsAffected()
	return n == 1, nil
}

func scanDeals(rows *sql.Rows) ([]StakingDeal, error) {
	defer rows.Close()
	out := []StakingDeal{}
	for rows.Next() {
		var d StakingDeal
		var settled sql.NullTime
		if err := rows.Scan(&d.ID, &d.Backer, &d.BackerName, &d.Player, &d.PlayerName, &d.StakeMinor,
			&d.MarkupBps, &d.Note, &d.Status, &d.SettleProposedBy, &d.RepayMinor, &d.CreatedAt, &settled); err != nil {
			return nil, err
		}
		if settled.Valid {
			d.SettledAt = &settled.Time
		}
		out = append(out, d)
	}
	return out, rows.Err()
}

// ListOpen returns offers still awaiting a player (newest first).
func (s *StakingStore) ListOpen(ctx context.Context, limit int) ([]StakingDeal, error) {
	if limit <= 0 || limit > 200 {
		limit = 50
	}
	rows, err := s.db.QueryContext(ctx, `
		SELECT id, backer, backer_name, player, player_name, stake_minor, markup_bps, note,
		       status, settle_proposed_by, repay_minor, created_at, settled_at
		FROM poker_staking_deal WHERE status='offered' ORDER BY created_at DESC LIMIT $1`, limit)
	if err != nil {
		return nil, err
	}
	return scanDeals(rows)
}

// ListForUser returns every deal where the caller is the backer OR the player
// (newest first) — their backing book and their backed book.
func (s *StakingStore) ListForUser(ctx context.Context, userID string, limit int) ([]StakingDeal, error) {
	if limit <= 0 || limit > 200 {
		limit = 100
	}
	rows, err := s.db.QueryContext(ctx, `
		SELECT id, backer, backer_name, player, player_name, stake_minor, markup_bps, note,
		       status, settle_proposed_by, repay_minor, created_at, settled_at
		FROM poker_staking_deal WHERE backer=$1 OR player=$1 ORDER BY created_at DESC LIMIT $2`, userID, limit)
	if err != nil {
		return nil, err
	}
	return scanDeals(rows)
}
