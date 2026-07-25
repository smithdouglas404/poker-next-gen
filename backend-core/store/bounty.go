package store

import (
	"context"
	"database/sql"
)

// BountyStore tracks per-player head bounties in a knockout (PKO) tournament.
// Registering a player sets their bounty active; eliminating them claims it
// (deactivates + records who won it), which the RPC layer pairs with a wallet
// credit so a bounty pays out exactly once.
type BountyStore struct{ db *sql.DB }

func NewBountyStore(db *sql.DB) *BountyStore { return &BountyStore{db: db} }

// SetBounty arms (or resets) a player's active head bounty for a tournament.
func (s *BountyStore) SetBounty(ctx context.Context, tournamentID, userID string, amountMinor int64) error {
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO poker_tournament_bounty (tournament_id, user_id, bounty_minor, active, updated_at)
		VALUES ($1,$2,$3,TRUE,NOW())
		ON CONFLICT (tournament_id, user_id) DO UPDATE SET
			bounty_minor=EXCLUDED.bounty_minor, active=TRUE, claimed_by='', updated_at=NOW()`,
		tournamentID, userID, amountMinor)
	return err
}

// Claim atomically deactivates an eliminated player's active bounty and records
// the claimer, returning the amount won (0 if there was no active bounty — e.g.
// already claimed, so a re-processed elimination pays nothing).
func (s *BountyStore) Claim(ctx context.Context, tournamentID, eliminatedUserID, claimedBy string) (int64, error) {
	var amount int64
	err := s.db.QueryRowContext(ctx, `
		UPDATE poker_tournament_bounty
		SET active=FALSE, claimed_by=$3, updated_at=NOW()
		WHERE tournament_id=$1 AND user_id=$2 AND active=TRUE
		RETURNING bounty_minor`, tournamentID, eliminatedUserID, claimedBy).Scan(&amount)
	if err == sql.ErrNoRows {
		return 0, nil
	}
	if err != nil {
		return 0, err
	}
	return amount, nil
}

// Get returns a player's current bounty amount and whether it is still active.
func (s *BountyStore) Get(ctx context.Context, tournamentID, userID string) (amount int64, active bool, err error) {
	err = s.db.QueryRowContext(ctx,
		`SELECT bounty_minor, active FROM poker_tournament_bounty WHERE tournament_id=$1 AND user_id=$2`,
		tournamentID, userID).Scan(&amount, &active)
	if err == sql.ErrNoRows {
		return 0, false, nil
	}
	return amount, active, err
}
