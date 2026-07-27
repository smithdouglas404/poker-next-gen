package store

import (
	"context"
	"database/sql"
	"time"
)

type RakeStore struct{ db *sql.DB }

func NewRakeStore(db *sql.DB) *RakeStore { return &RakeStore{db: db} }

func (s *RakeStore) Credit(ctx context.Context, clubID string, amount int64, matchID string, handNo int) error {
	if amount <= 0 {
		return nil
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	id := NewID("rake")
	if _, err := tx.ExecContext(ctx, `
		INSERT INTO poker_rake_ledger (id, club_id, amount, match_id, hand_no, created_at)
		VALUES ($1, $2, $3, $4, $5, NOW())`,
		id, clubID, amount, matchID, handNo); err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, `
		INSERT INTO poker_club_house_balance (club_id, balance, updated_at)
		VALUES ($1, $2, NOW())
		ON CONFLICT (club_id) DO UPDATE SET balance = poker_club_house_balance.balance + $2, updated_at = NOW()`,
		clubID, amount); err != nil {
		return err
	}
	// Double-entry: rake comes OUT of the table, which is the only way the table
	// account can close at zero once every seat has cashed out. Posting it from a
	// house bucket instead would leave the table permanently long by the rake and
	// make "did this table settle?" unanswerable.
	//
	// Also makes the whole thing one transaction: the rake row, the club's house
	// balance and the ledger now commit or roll back together, where before a
	// failure between the two statements left rake recorded but uncredited.
	if matchID != "" {
		if err := postLedgerKind(ctx, tx, "rake",
			TableAcct(matchID), AcctHouseRake, amount, "rake:"+clubID); err != nil {
			return err
		}
	}
	return tx.Commit()
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
