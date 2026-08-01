package store

import (
	"context"
	"database/sql"
	"time"
)

// LoyaltyStore tracks High Roller Points (HRP) and permanent achievements.
type LoyaltyStore struct{ db *sql.DB }

func NewLoyaltyStore(db *sql.DB) *LoyaltyStore { return &LoyaltyStore{db: db} }

// Loyalty is a player's lifetime HRP and hand counts. HRPTotal is the lifetime
// earned total (drives service rank, never decreases); HRPSpendable is the
// redeemable balance used in the rewards marketplace. TotalWinningsCents /
// NoShowdownWins / CurrentWinStreak / BestWinStreak back the real-tracked
// achievement codes in loyalty.Catalog (high_roller / bluff_master /
// streak_fire) — CurrentWinStreak resets to 0 on any hand a player didn't win.
type Loyalty struct {
	UserID             string `json:"user_id"`
	HRPTotal           int64  `json:"hrp_total"`
	HRPSpendable       int64  `json:"hrp_spendable"`
	HandsPlayed        int64  `json:"hands_played"`
	HandsWon           int64  `json:"hands_won"`
	TotalWinningsCents int64  `json:"total_winnings_cents"`
	NoShowdownWins     int64  `json:"no_showdown_wins"`
	CurrentWinStreak   int64  `json:"current_win_streak"`
	BestWinStreak      int64  `json:"best_win_streak"`
}

// Get returns the player's loyalty row (zero-valued if none yet).
func (s *LoyaltyStore) Get(ctx context.Context, userID string) (Loyalty, error) {
	l := Loyalty{UserID: userID}
	err := s.db.QueryRowContext(ctx,
		`SELECT hrp_total, hrp_spendable, hands_played, hands_won,
		        total_winnings_cents, no_showdown_wins, current_win_streak, best_win_streak
		 FROM poker_loyalty WHERE user_id=$1`, userID).
		Scan(&l.HRPTotal, &l.HRPSpendable, &l.HandsPlayed, &l.HandsWon,
			&l.TotalWinningsCents, &l.NoShowdownWins, &l.CurrentWinStreak, &l.BestWinStreak)
	if err == sql.ErrNoRows {
		return l, nil
	}
	return l, err
}

// Award increments lifetime HRP, the spendable balance, and every per-hand
// counter in one upsert — call this ONLY for an actual hand result (winning
// or losing), never for a standalone bonus credit (use AwardBonus for that;
// see its doc comment for why). Earned points raise BOTH the lifetime total
// (rank) and the spendable balance (rewards) by the same amount. wonDelta > 0
// both bumps hands_won and extends the win streak; wonDelta == 0 resets the
// streak to 0 (any non-winning hand breaks it).
func (s *LoyaltyStore) Award(ctx context.Context, userID string, hrp, playedDelta, wonDelta, winningsCentsDelta, noShowdownWinDelta int64) (Loyalty, error) {
	l := Loyalty{UserID: userID}
	won := wonDelta > 0
	err := s.db.QueryRowContext(ctx, `
		INSERT INTO poker_loyalty (
			user_id, hrp_total, hrp_spendable, hands_played, hands_won,
			total_winnings_cents, no_showdown_wins, current_win_streak, best_win_streak, updated_at)
		VALUES ($1,$2,$2,$3,$4,$5,$6, CASE WHEN $7 THEN 1 ELSE 0 END, CASE WHEN $7 THEN 1 ELSE 0 END, NOW())
		ON CONFLICT (user_id) DO UPDATE SET
			hrp_total             = poker_loyalty.hrp_total + $2,
			hrp_spendable         = poker_loyalty.hrp_spendable + $2,
			hands_played          = poker_loyalty.hands_played + $3,
			hands_won             = poker_loyalty.hands_won + $4,
			total_winnings_cents  = poker_loyalty.total_winnings_cents + $5,
			no_showdown_wins      = poker_loyalty.no_showdown_wins + $6,
			current_win_streak    = CASE WHEN $7 THEN poker_loyalty.current_win_streak + 1 ELSE 0 END,
			best_win_streak       = GREATEST(poker_loyalty.best_win_streak,
			                             CASE WHEN $7 THEN poker_loyalty.current_win_streak + 1 ELSE 0 END),
			updated_at            = NOW()
		RETURNING hrp_total, hrp_spendable, hands_played, hands_won,
		          total_winnings_cents, no_showdown_wins, current_win_streak, best_win_streak`,
		userID, hrp, playedDelta, wonDelta, winningsCentsDelta, noShowdownWinDelta, won).
		Scan(&l.HRPTotal, &l.HRPSpendable, &l.HandsPlayed, &l.HandsWon,
			&l.TotalWinningsCents, &l.NoShowdownWins, &l.CurrentWinStreak, &l.BestWinStreak)
	return l, err
}

// AwardBonus tops up lifetime + spendable HRP only — for credits that are NOT
// a hand result (achievement unlocks, tournament-championship bonuses). Using
// Award for these (with wonDelta=0) would corrupt CurrentWinStreak: Award's
// "wonDelta==0 resets the streak" rule is meant for an actual losing hand, not
// a bonus top-up that happens to follow a winning one — confirmed as a real
// bug via a live-table test (a player who won every hand still showed a
// broken, reset streak because each achievement's bonus Award call zeroed it).
func (s *LoyaltyStore) AwardBonus(ctx context.Context, userID string, hrp int64) (Loyalty, error) {
	l := Loyalty{UserID: userID}
	err := s.db.QueryRowContext(ctx, `
		INSERT INTO poker_loyalty (user_id, hrp_total, hrp_spendable, updated_at)
		VALUES ($1,$2,$2,NOW())
		ON CONFLICT (user_id) DO UPDATE SET
			hrp_total     = poker_loyalty.hrp_total + $2,
			hrp_spendable = poker_loyalty.hrp_spendable + $2,
			updated_at    = NOW()
		RETURNING hrp_total, hrp_spendable, hands_played, hands_won,
		          total_winnings_cents, no_showdown_wins, current_win_streak, best_win_streak`,
		userID, hrp).
		Scan(&l.HRPTotal, &l.HRPSpendable, &l.HandsPlayed, &l.HandsWon,
			&l.TotalWinningsCents, &l.NoShowdownWins, &l.CurrentWinStreak, &l.BestWinStreak)
	return l, err
}

// AddSpendable tops up ONLY the spendable balance (e.g. buying points with
// chips) — never the lifetime total, so purchased points can't inflate rank.
func (s *LoyaltyStore) AddSpendable(ctx context.Context, userID string, points int64) error {
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO poker_loyalty (user_id, hrp_spendable, updated_at)
		VALUES ($1,$2,NOW())
		ON CONFLICT (user_id) DO UPDATE SET
			hrp_spendable = poker_loyalty.hrp_spendable + $2,
			updated_at    = NOW()`, userID, points)
	return err
}

// UnlockAchievement records an achievement once. Returns true if it was newly
// unlocked (false if the player already had it).
func (s *LoyaltyStore) UnlockAchievement(ctx context.Context, userID, code string) (bool, error) {
	res, err := s.db.ExecContext(ctx,
		`INSERT INTO poker_achievement (user_id, code) VALUES ($1,$2)
		 ON CONFLICT (user_id, code) DO NOTHING`, userID, code)
	if err != nil {
		return false, err
	}
	n, _ := res.RowsAffected()
	return n > 0, nil
}

// AchievementRow is one unlocked achievement.
type AchievementRow struct {
	Code       string    `json:"code"`
	UnlockedAt time.Time `json:"unlocked_at"`
}

// ListAchievements returns the player's unlocked achievements, newest first.
func (s *LoyaltyStore) ListAchievements(ctx context.Context, userID string) ([]AchievementRow, error) {
	rows, err := s.db.QueryContext(ctx,
		`SELECT code, unlocked_at FROM poker_achievement WHERE user_id=$1 ORDER BY unlocked_at DESC`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []AchievementRow{}
	for rows.Next() {
		var a AchievementRow
		if err := rows.Scan(&a.Code, &a.UnlockedAt); err != nil {
			return nil, err
		}
		out = append(out, a)
	}
	return out, rows.Err()
}
