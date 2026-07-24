package store

import (
	"context"
	"database/sql"
	"time"
)

// AvatarStatsStore tracks each player's per-avatar battle record — hands and
// wins attributed to the character equipped when a hand settled.
type AvatarStatsStore struct{ db *sql.DB }

func NewAvatarStatsStore(db *sql.DB) *AvatarStatsStore { return &AvatarStatsStore{db: db} }

// AvatarBattleStat is one avatar's battle record for a player.
type AvatarBattleStat struct {
	AvatarID  string    `json:"avatar_id"`
	Hands     int64     `json:"hands"`
	Wins      int64     `json:"wins"`
	WinRate   int       `json:"win_rate_pct"`
	UpdatedAt time.Time `json:"updated_at"`
}

// Increment records one settled hand for (user, avatar), bumping wins when won.
func (s *AvatarStatsStore) Increment(ctx context.Context, userID, avatarID string, won bool) error {
	w := int64(0)
	if won {
		w = 1
	}
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO poker_avatar_battle_stats (user_id, avatar_id, hands, wins, updated_at)
		VALUES ($1,$2,1,$3,NOW())
		ON CONFLICT (user_id, avatar_id) DO UPDATE SET
			hands = poker_avatar_battle_stats.hands + 1,
			wins  = poker_avatar_battle_stats.wins + $3,
			updated_at = NOW()`, userID, avatarID, w)
	return err
}

// List returns all of a player's per-avatar battle records (most-played first).
func (s *AvatarStatsStore) List(ctx context.Context, userID string) ([]AvatarBattleStat, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT avatar_id, hands, wins, updated_at
		FROM poker_avatar_battle_stats WHERE user_id=$1 ORDER BY hands DESC`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []AvatarBattleStat{}
	for rows.Next() {
		var a AvatarBattleStat
		if err := rows.Scan(&a.AvatarID, &a.Hands, &a.Wins, &a.UpdatedAt); err != nil {
			return nil, err
		}
		if a.Hands > 0 {
			a.WinRate = int((a.Wins*100 + a.Hands/2) / a.Hands)
		}
		out = append(out, a)
	}
	return out, rows.Err()
}
