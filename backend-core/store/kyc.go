package store

import (
	"context"
	"database/sql"
)

// KYC is a user's identity-verification state.
type KYC struct {
	UserID          string `json:"user_id"`
	Level           string `json:"level"`
	Status          string `json:"status"` // none | pending | verified | rejected
	RejectionReason string `json:"rejection_reason,omitempty"`
	Provider        string `json:"provider,omitempty"`
}

type KYCStore struct{ db *sql.DB }

func NewKYCStore(db *sql.DB) *KYCStore { return &KYCStore{db: db} }

func (s *KYCStore) Get(ctx context.Context, userID string) (KYC, error) {
	k := KYC{UserID: userID, Level: "none", Status: "none"}
	err := s.db.QueryRowContext(ctx,
		`SELECT level, status, rejection_reason, provider FROM poker_kyc WHERE user_id=$1`, userID).
		Scan(&k.Level, &k.Status, &k.RejectionReason, &k.Provider)
	if err == sql.ErrNoRows {
		return k, nil
	}
	return k, err
}

// Submit records a manual KYC submission (moves the user to `pending`). The
// provided document data is stored as JSON for admin review.
func (s *KYCStore) Submit(ctx context.Context, userID, level, dataJSON string) error {
	if dataJSON == "" {
		dataJSON = "{}"
	}
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO poker_kyc (user_id, level, status, data, provider, updated_at)
		VALUES ($1,$2,'pending',$3::jsonb,'manual',NOW())
		ON CONFLICT (user_id) DO UPDATE SET
			level=EXCLUDED.level, status='pending', data=EXCLUDED.data,
			rejection_reason='', provider='manual', updated_at=NOW()`,
		userID, level, dataJSON)
	return err
}

// SetStatus is the server-authoritative decision path (admin or provider
// webhook): verify or reject a user's KYC.
func (s *KYCStore) SetStatus(ctx context.Context, userID, status, level, reason, provider string) error {
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO poker_kyc (user_id, level, status, rejection_reason, provider, updated_at)
		VALUES ($1,$2,$3,$4,$5,NOW())
		ON CONFLICT (user_id) DO UPDATE SET
			status=EXCLUDED.status,
			level=CASE WHEN EXCLUDED.level<>'' THEN EXCLUDED.level ELSE poker_kyc.level END,
			rejection_reason=EXCLUDED.rejection_reason,
			provider=CASE WHEN EXCLUDED.provider<>'' THEN EXCLUDED.provider ELSE poker_kyc.provider END,
			updated_at=NOW()`,
		userID, level, status, reason, provider)
	return err
}

// IsVerified reports whether the user has cleared KYC.
func (s *KYCStore) IsVerified(ctx context.Context, userID string) bool {
	k, err := s.Get(ctx, userID)
	return err == nil && k.Status == "verified"
}
