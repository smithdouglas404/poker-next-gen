package store

import (
	"context"
	"database/sql"
)

// Deposit is one wallet-funding attempt.
type Deposit struct {
	ID               string `json:"id"`
	UserID           string `json:"user_id"`
	AmountCents      int64  `json:"amount_cents"`
	Currency         string `json:"currency"`
	Gateway          string `json:"gateway"`
	GatewayPaymentID string `json:"gateway_payment_id,omitempty"`
	Status           string `json:"status"`
}

type DepositStore struct{ db *sql.DB }

func NewDepositStore(db *sql.DB) *DepositStore { return &DepositStore{db: db} }

// CreatePending records a new deposit intent and returns its order id.
func (s *DepositStore) CreatePending(ctx context.Context, userID string, amountCents int64, currency, gateway string) (string, error) {
	id := NewID("dep")
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO poker_deposit (id, user_id, amount_cents, currency, gateway, status)
		VALUES ($1,$2,$3,$4,$5,'pending')`,
		id, userID, amountCents, currency, gateway)
	return id, err
}

// AttachGatewayID stores the gateway's payment/invoice id for later lookup.
func (s *DepositStore) AttachGatewayID(ctx context.Context, id, gatewayPaymentID string) error {
	_, err := s.db.ExecContext(ctx,
		`UPDATE poker_deposit SET gateway_payment_id=$2, status='waiting', updated_at=NOW() WHERE id=$1`,
		id, gatewayPaymentID)
	return err
}

// GetByID returns a deposit, or (nil, nil) if missing.
func (s *DepositStore) GetByID(ctx context.Context, id string) (*Deposit, error) {
	var d Deposit
	err := s.db.QueryRowContext(ctx, `
		SELECT id, user_id, amount_cents, currency, gateway, gateway_payment_id, status
		FROM poker_deposit WHERE id=$1`, id).
		Scan(&d.ID, &d.UserID, &d.AmountCents, &d.Currency, &d.Gateway, &d.GatewayPaymentID, &d.Status)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &d, nil
}

// MarkCredited flips a deposit to 'credited' and credits the wallet in ONE
// transaction — but only if it is not already credited. Returns true if this
// call performed the credit (so a replayed webhook is a safe no-op).
func (s *DepositStore) MarkCredited(ctx context.Context, id string) (bool, error) {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return false, err
	}
	defer tx.Rollback()

	var userID string
	var amount int64
	// Row-lock + guard: only proceeds if the deposit is not yet credited.
	err = tx.QueryRowContext(ctx, `
		UPDATE poker_deposit SET status='credited', updated_at=NOW()
		WHERE id=$1 AND status<>'credited'
		RETURNING user_id, amount_cents`, id).Scan(&userID, &amount)
	if err == sql.ErrNoRows {
		return false, nil // already credited or missing — idempotent no-op
	}
	if err != nil {
		return false, err
	}
	if _, err := tx.ExecContext(ctx, `
		INSERT INTO poker_global_wallet (user_id, balance, currency, updated_at)
		VALUES ($1, 100000, 'USD', NOW()) ON CONFLICT (user_id) DO NOTHING`, userID); err != nil {
		return false, err
	}
	var after int64
	if err := tx.QueryRowContext(ctx, `
		UPDATE poker_global_wallet SET balance=balance+$2, updated_at=NOW()
		WHERE user_id=$1 RETURNING balance`, userID, amount).Scan(&after); err != nil {
		return false, err
	}
	if _, err := tx.ExecContext(ctx, `
		INSERT INTO poker_wallet_ledger (id, user_id, delta, balance_after, reason)
		VALUES ($1,$2,$3,$4,$5)`, NewID("wl"), userID, amount, after, "deposit:"+id); err != nil {
		return false, err
	}
	if err := tx.Commit(); err != nil {
		return false, err
	}
	return true, nil
}

// SumRecentCents returns the total of the user's deposits (pending/waiting/
// credited — anything not failed) in the trailing `hours` window. Used to
// enforce the tier's daily deposit limit as a rolling sum.
func (s *DepositStore) SumRecentCents(ctx context.Context, userID string, hours int) (int64, error) {
	var sum sql.NullInt64
	err := s.db.QueryRowContext(ctx, `
		SELECT COALESCE(SUM(amount_cents),0) FROM poker_deposit
		WHERE user_id=$1 AND status<>'failed'
		  AND created_at > NOW() - ($2 || ' hours')::interval`,
		userID, hours).Scan(&sum)
	if err != nil {
		return 0, err
	}
	return sum.Int64, nil
}

// MarkFailed flips a non-credited deposit to 'failed'.
func (s *DepositStore) MarkFailed(ctx context.Context, id string) error {
	_, err := s.db.ExecContext(ctx,
		`UPDATE poker_deposit SET status='failed', updated_at=NOW() WHERE id=$1 AND status<>'credited'`, id)
	return err
}
