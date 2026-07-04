package store

import (
	"context"
	"database/sql"
	"time"
)

type RakeStore struct{ db *sql.DB }

func NewRakeStore(db *sql.DB) *RakeStore { return &RakeStore{db: db} }

func (s *RakeStore) Credit(ctx context.Context, clubID string, amount int64, matchID string, handNo int) error {
	id := NewID("rake")
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO poker_rake_ledger (id, club_id, amount, match_id, hand_no, created_at)
		VALUES ($1, $2, $3, $4, $5, NOW())`,
		id, clubID, amount, matchID, handNo)
	if err != nil {
		return err
	}
	_, err = s.db.ExecContext(ctx, `
		INSERT INTO poker_club_house_balance (club_id, balance, updated_at)
		VALUES ($1, $2, NOW())
		ON CONFLICT (club_id) DO UPDATE SET balance = poker_club_house_balance.balance + $2, updated_at = NOW()`,
		clubID, amount)
	return err
}

func (s *RakeStore) HouseBalance(ctx context.Context, clubID string) (int64, error) {
	var bal int64
	err := s.db.QueryRowContext(ctx, `SELECT balance FROM poker_club_house_balance WHERE club_id=$1`, clubID).Scan(&bal)
	if err == sql.ErrNoRows {
		return 0, nil
	}
	return bal, err
}

func (s *RakeStore) Ledger(ctx context.Context, clubID string, limit int) ([]map[string]interface{}, error) {
	if limit <= 0 {
		limit = 50
	}
	rows, err := s.db.QueryContext(ctx, `
		SELECT id, club_id, amount, match_id, hand_no, created_at
		FROM poker_rake_ledger WHERE club_id=$1 ORDER BY created_at DESC LIMIT $2`, clubID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []map[string]interface{}
	for rows.Next() {
		var id, cid, matchID string
		var amount int64
		var handNo int
		var created time.Time
		if err := rows.Scan(&id, &cid, &amount, &matchID, &handNo, &created); err != nil {
			return nil, err
		}
		out = append(out, map[string]interface{}{
			"id": id, "club_id": cid, "amount": amount, "match_id": matchID, "hand_no": handNo, "created_at": created,
		})
	}
	return out, rows.Err()
}
