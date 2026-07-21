package store

import (
	"context"
	"database/sql"
	"time"
)

// LoyaltyStore tracks High Roller Points (HRP) and permanent achievements.
type LoyaltyStore struct{ db *sql.DB }

func NewLoyaltyStore(db *sql.DB) *LoyaltyStore { return &LoyaltyStore{db: db} }

// Loyalty is a player's lifetime HRP and hand counts.
type Loyalty struct {
	UserID      string `json:"user_id"`
	HRPTotal    int64  `json:"hrp_total"`
	HandsPlayed int64  `json:"hands_played"`
	HandsWon    int64  `json:"hands_won"`
}

// Get returns the player's loyalty row (zero-valued if none yet).
func (s *LoyaltyStore) Get(ctx context.Context, userID string) (Loyalty, error) {
	l := Loyalty{UserID: userID}
	err := s.db.QueryRowContext(ctx,
		`SELECT hrp_total, hands_played, hands_won FROM poker_loyalty WHERE user_id=$1`, userID).
		Scan(&l.HRPTotal, &l.HandsPlayed, &l.HandsWon)
	if err == sql.ErrNoRows {
		return l, nil
	}
	return l, err
}

// Award increments HRP and hand counters in one upsert, returning the new totals.
func (s *LoyaltyStore) Award(ctx context.Context, userID string, hrp, playedDelta, wonDelta int64) (Loyalty, error) {
	l := Loyalty{UserID: userID}
	err := s.db.QueryRowContext(ctx, `
		INSERT INTO poker_loyalty (user_id, hrp_total, hands_played, hands_won, updated_at)
		VALUES ($1,$2,$3,$4,NOW())
		ON CONFLICT (user_id) DO UPDATE SET
			hrp_total    = poker_loyalty.hrp_total + $2,
			hands_played = poker_loyalty.hands_played + $3,
			hands_won    = poker_loyalty.hands_won + $4,
			updated_at   = NOW()
		RETURNING hrp_total, hands_played, hands_won`,
		userID, hrp, playedDelta, wonDelta).
		Scan(&l.HRPTotal, &l.HandsPlayed, &l.HandsWon)
	return l, err
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
