package store

import (
	"context"
	"database/sql"
	"time"
)

// DailyBonusStore tracks the once-per-24h chip bonus.
type DailyBonusStore struct{ db *sql.DB }

func NewDailyBonusStore(db *sql.DB) *DailyBonusStore { return &DailyBonusStore{db: db} }

// Status returns the last claim time (nil if never) and the current streak.
func (s *DailyBonusStore) Status(ctx context.Context, userID string) (*time.Time, int, error) {
	var last sql.NullTime
	var streak int
	err := s.db.QueryRowContext(ctx,
		`SELECT last_claim_at, streak FROM poker_daily_bonus WHERE user_id=$1`, userID).
		Scan(&last, &streak)
	if err == sql.ErrNoRows {
		return nil, 0, nil
	}
	if err != nil {
		return nil, 0, err
	}
	if last.Valid {
		t := last.Time
		return &t, streak, nil
	}
	return nil, streak, nil
}

// Claim credits `chips` to the wallet if at least 20h have passed since the last
// claim, in ONE transaction. Returns (credited, newBalance). If not yet
// eligible, returns (false, 0) with no error.
func (s *DailyBonusStore) Claim(ctx context.Context, userID string, chips int64) (bool, int64, error) {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return false, 0, err
	}
	defer tx.Rollback()

	var last sql.NullTime
	var streak int
	err = tx.QueryRowContext(ctx,
		`SELECT last_claim_at, streak FROM poker_daily_bonus WHERE user_id=$1 FOR UPDATE`, userID).
		Scan(&last, &streak)
	if err != nil && err != sql.ErrNoRows {
		return false, 0, err
	}

	// Eligible if never claimed or >= 20h since last claim (a little under 24h so
	// a consistent daily player never drifts out of reach).
	now := time.Now()
	if last.Valid && now.Sub(last.Time) < 20*time.Hour {
		return false, 0, nil
	}
	// Streak: consecutive if within 48h, else reset to 1.
	newStreak := 1
	if last.Valid && now.Sub(last.Time) < 48*time.Hour {
		newStreak = streak + 1
	}

	if _, err := tx.ExecContext(ctx, `
		INSERT INTO poker_daily_bonus (user_id, last_claim_at, streak)
		VALUES ($1, NOW(), $2)
		ON CONFLICT (user_id) DO UPDATE SET last_claim_at=NOW(), streak=$2`,
		userID, newStreak); err != nil {
		return false, 0, err
	}
	if _, err := tx.ExecContext(ctx, `
		INSERT INTO poker_global_wallet (user_id, balance, currency, updated_at)
		VALUES ($1, 100000, 'USD', NOW()) ON CONFLICT (user_id) DO NOTHING`, userID); err != nil {
		return false, 0, err
	}
	var after int64
	if err := tx.QueryRowContext(ctx, `
		UPDATE poker_global_wallet SET balance=balance+$2, updated_at=NOW()
		WHERE user_id=$1 RETURNING balance`, userID, chips).Scan(&after); err != nil {
		return false, 0, err
	}
	if _, err := tx.ExecContext(ctx, `
		INSERT INTO poker_wallet_ledger (id, user_id, delta, balance_after, reason)
		VALUES ($1,$2,$3,$4,'daily_bonus')`, NewID("wl"), userID, chips, after); err != nil {
		return false, 0, err
	}
	if err := tx.Commit(); err != nil {
		return false, 0, err
	}
	return true, after, nil
}
