package store

import (
	"context"
	"database/sql"
)

type RakebackStore struct{ db *sql.DB }

func NewRakebackStore(db *sql.DB) *RakebackStore { return &RakebackStore{db: db} }

// Accrue adds `amount` cents to a user's claimable rakeback balance (and to
// their lifetime total). No-op for non-positive amounts.
func (s *RakebackStore) Accrue(ctx context.Context, userID string, amount int64) error {
	if amount <= 0 || userID == "" {
		return nil
	}
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO poker_rakeback (user_id, balance, lifetime, updated_at)
		VALUES ($1,$2,$2,NOW())
		ON CONFLICT (user_id) DO UPDATE SET
			balance=poker_rakeback.balance+$2,
			lifetime=poker_rakeback.lifetime+$2,
			updated_at=NOW()`, userID, amount)
	return err
}

// Get returns the claimable balance and lifetime rakeback.
func (s *RakebackStore) Get(ctx context.Context, userID string) (balance, lifetime int64, err error) {
	err = s.db.QueryRowContext(ctx,
		`SELECT balance, lifetime FROM poker_rakeback WHERE user_id=$1`, userID).
		Scan(&balance, &lifetime)
	if err == sql.ErrNoRows {
		return 0, 0, nil
	}
	return balance, lifetime, err
}

// Claim moves the entire rakeback balance to the wallet in ONE transaction and
// returns the amount credited (0 if nothing to claim).
func (s *RakebackStore) Claim(ctx context.Context, userID string) (int64, error) {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return 0, err
	}
	defer tx.Rollback()

	var amount int64
	err = tx.QueryRowContext(ctx,
		`SELECT balance FROM poker_rakeback WHERE user_id=$1 FOR UPDATE`, userID).Scan(&amount)
	if err == sql.ErrNoRows {
		return 0, tx.Commit()
	}
	if err != nil {
		return 0, err
	}
	if amount <= 0 {
		return 0, tx.Commit()
	}
	if _, err := tx.ExecContext(ctx, `UPDATE poker_rakeback SET balance=0, updated_at=NOW() WHERE user_id=$1`, userID); err != nil {
		return 0, err
	}
	if _, err := tx.ExecContext(ctx, `
		INSERT INTO poker_global_wallet (user_id, balance, currency, updated_at)
		VALUES ($1, 100000, 'USD', NOW()) ON CONFLICT (user_id) DO NOTHING`, userID); err != nil {
		return 0, err
	}
	var after int64
	if err := tx.QueryRowContext(ctx, `
		UPDATE poker_global_wallet SET balance=balance+$2, updated_at=NOW()
		WHERE user_id=$1 RETURNING balance`, userID, amount).Scan(&after); err != nil {
		return 0, err
	}
	if _, err := tx.ExecContext(ctx, `
		INSERT INTO poker_wallet_ledger (id, user_id, delta, balance_after, reason)
		VALUES ($1,$2,$3,$4,'rakeback_claim')`, NewID("wl"), userID, amount, after); err != nil {
		return 0, err
	}
	if err := tx.Commit(); err != nil {
		return 0, err
	}
	return amount, nil
}
