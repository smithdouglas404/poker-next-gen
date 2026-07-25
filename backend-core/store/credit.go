package store

import (
	"context"
	"database/sql"
	"time"
)

// CreditRequestStore holds over-limit buy-in credit requests a player raises to a
// club owner. Approval is paired (in the RPC layer) with an owner-gated balance
// allocation; the atomic Review guard ensures each request resolves once.
type CreditRequestStore struct{ db *sql.DB }

func NewCreditRequestStore(db *sql.DB) *CreditRequestStore { return &CreditRequestStore{db: db} }

// CreditRequest is a player's request for extra buy-in credit at a club.
type CreditRequest struct {
	ID          string     `json:"id"`
	ClubID      string     `json:"club_id"`
	UserID      string     `json:"user_id"`
	Username    string     `json:"username"`
	AmountMinor int64      `json:"amount_minor"`
	Reason      string     `json:"reason"`
	Status      string     `json:"status"`
	ReviewedBy  string     `json:"reviewed_by"`
	CreatedAt   time.Time  `json:"created_at"`
	ReviewedAt  *time.Time `json:"reviewed_at,omitempty"`
}

// Create inserts a pending request and returns it.
func (s *CreditRequestStore) Create(ctx context.Context, r *CreditRequest) (string, error) {
	if r.ID == "" {
		r.ID = NewID("cr")
	}
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO poker_credit_request (id, club_id, user_id, username, amount_minor, reason, status)
		VALUES ($1,$2,$3,$4,$5,$6,'pending')`,
		r.ID, r.ClubID, r.UserID, r.Username, r.AmountMinor, r.Reason)
	return r.ID, err
}

// Get returns a request by id (nil if missing).
func (s *CreditRequestStore) Get(ctx context.Context, id string) (*CreditRequest, error) {
	var r CreditRequest
	var reviewed sql.NullTime
	err := s.db.QueryRowContext(ctx, `
		SELECT id, club_id, user_id, username, amount_minor, reason, status, reviewed_by, created_at, reviewed_at
		FROM poker_credit_request WHERE id=$1`, id).
		Scan(&r.ID, &r.ClubID, &r.UserID, &r.Username, &r.AmountMinor, &r.Reason, &r.Status, &r.ReviewedBy, &r.CreatedAt, &reviewed)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	if reviewed.Valid {
		r.ReviewedAt = &reviewed.Time
	}
	return &r, nil
}

// ListPending returns a club's pending credit requests (oldest first).
func (s *CreditRequestStore) ListPending(ctx context.Context, clubID string) ([]CreditRequest, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT id, club_id, user_id, username, amount_minor, reason, status, reviewed_by, created_at, reviewed_at
		FROM poker_credit_request WHERE club_id=$1 AND status='pending' ORDER BY created_at ASC`, clubID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []CreditRequest{}
	for rows.Next() {
		var r CreditRequest
		var reviewed sql.NullTime
		if err := rows.Scan(&r.ID, &r.ClubID, &r.UserID, &r.Username, &r.AmountMinor, &r.Reason, &r.Status, &r.ReviewedBy, &r.CreatedAt, &reviewed); err != nil {
			return nil, err
		}
		if reviewed.Valid {
			r.ReviewedAt = &reviewed.Time
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

// Review atomically resolves a pending request (approved | denied). Returns false
// if it was not still pending, so approval + allocation happen at most once.
func (s *CreditRequestStore) Review(ctx context.Context, id, status, reviewedBy string) (bool, error) {
	if status != "approved" && status != "denied" {
		status = "denied"
	}
	res, err := s.db.ExecContext(ctx, `
		UPDATE poker_credit_request SET status=$2, reviewed_by=$3, reviewed_at=NOW()
		WHERE id=$1 AND status='pending'`, id, status, reviewedBy)
	if err != nil {
		return false, err
	}
	n, _ := res.RowsAffected()
	return n == 1, nil
}
