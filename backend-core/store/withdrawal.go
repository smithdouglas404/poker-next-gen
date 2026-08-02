package store

import (
	"context"
	"database/sql"
	"fmt"
)

// Withdrawal is one wallet-withdrawal request.
type Withdrawal struct {
	ID              string `json:"id"`
	UserID          string `json:"user_id"`
	AmountCents     int64  `json:"amount_cents"`
	Currency        string `json:"currency"`
	Destination     string `json:"destination"`
	Gateway         string `json:"gateway"`
	GatewayPayoutID string `json:"gateway_payout_id,omitempty"`
	Status          string `json:"status"`
	Reason          string `json:"reason,omitempty"`
}

type WithdrawalStore struct{ db *sql.DB }

func NewWithdrawalStore(db *sql.DB) *WithdrawalStore { return &WithdrawalStore{db: db} }

// CreateRequest holds funds (debits the wallet) and records a pending
// withdrawal in ONE transaction. If the balance is insufficient, nothing
// changes. Funds are released back only on rejection.
func (s *WithdrawalStore) CreateRequest(ctx context.Context, userID string, amountCents int64, currency, destination, gateway string) (string, error) {
	if amountCents <= 0 {
		return "", fmt.Errorf("amount must be positive")
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return "", err
	}
	defer tx.Rollback()

	// Ensure wallet row (SAME tier-aware opening balance WalletStore.Ensure
	// uses), then debit with a balance guard. A hardcoded 100000 ($1,000) here
	// used to hand a paid account's very first wallet touch the free-tier
	// guest stipend — StartingBalanceForTier says a paid account in
	// real-money mode starts at zero, since it's the only kind that can move
	// real money. Getting this wrong meant a brand-new paid+KYC'd account
	// whose first-ever wallet interaction was a withdrawal request could debit
	// up to $1,000 that was never deposited, and if approved without an
	// independent deposit-history check, real payout money would leave the
	// platform for funds that never existed. ON CONFLICT DO NOTHING means this
	// never rewrites an existing balance either way.
	opening := StartingBalanceForTier(SubscriptionTier(ctx, s.db, userID))
	if _, err := tx.ExecContext(ctx, `
		INSERT INTO poker_global_wallet (user_id, balance, currency, updated_at)
		VALUES ($1, $2, 'USD', NOW()) ON CONFLICT (user_id) DO NOTHING`, userID, opening); err != nil {
		return "", err
	}
	var after int64
	err = tx.QueryRowContext(ctx, `
		UPDATE poker_global_wallet SET balance=balance-$2, updated_at=NOW()
		WHERE user_id=$1 AND balance>=$2 RETURNING balance`, userID, amountCents).Scan(&after)
	if err == sql.ErrNoRows {
		return "", fmt.Errorf("insufficient balance")
	}
	if err != nil {
		return "", err
	}

	id := NewID("wd")
	if _, err := tx.ExecContext(ctx, `
		INSERT INTO poker_withdrawal (id, user_id, amount_cents, currency, destination, gateway, status)
		VALUES ($1,$2,$3,$4,$5,$6,'pending')`,
		id, userID, amountCents, currency, destination, gateway); err != nil {
		return "", err
	}
	if _, err := tx.ExecContext(ctx, `
		INSERT INTO poker_wallet_ledger (id, user_id, delta, balance_after, reason)
		VALUES ($1,$2,$3,$4,$5)`, NewID("wl"), userID, -amountCents, after, "withdrawal_hold:"+id); err != nil {
		return "", err
	}
	// Double-entry: the funds leave the player and sit in a pending-payout
	// account until the request is approved or rejected. Modelling the hold as a
	// real account is what lets an operator answer "how much do we owe on
	// unapproved withdrawals" from the books rather than by guessing.
	if err := postLedgerKind(ctx, tx, "withdrawal",
		UserAcct(userID), AcctHouseWithdrawalPending, amountCents, "withdrawal_hold:"+id); err != nil {
		return "", err
	}
	if err := tx.Commit(); err != nil {
		return "", err
	}
	return id, nil
}

// ClaimForPayout atomically takes exclusive ownership of a pending withdrawal
// before any external payout is attempted, moving it to 'paying'.
//
// This exists because the approve path used to read the row unlocked, fire an
// IRREVERSIBLE crypto payout, and only then flip the status. Two admins (or one
// double-click, or a retried request) could both observe 'pending' and both
// send real money, with the accounting recording a single payout. Claiming
// first means exactly one caller is ever authorised to spend.
//
// Returns the fields the payout needs, so this REPLACES the previous unlocked
// GetByID — there is no read left outside the claim.
func (s *WithdrawalStore) ClaimForPayout(ctx context.Context, id string) (*Withdrawal, error) {
	var w Withdrawal
	w.ID = id
	err := s.db.QueryRowContext(ctx, `
		UPDATE poker_withdrawal SET status='paying', updated_at=NOW()
		WHERE id=$1 AND status='pending'
		RETURNING user_id, amount_cents, currency, destination, gateway`, id).
		Scan(&w.UserID, &w.AmountCents, &w.Currency, &w.Destination, &w.Gateway)
	if err == sql.ErrNoRows {
		return nil, fmt.Errorf("withdrawal not pending")
	}
	if err != nil {
		return nil, err
	}
	return &w, nil
}

// ReleaseClaim moves a claimed withdrawal to 'payout_failed' when the external
// payout call errored.
//
// Deliberately NOT back to 'pending': a transport error is ambiguous about
// whether the money actually left, and returning it to the approvable pool is
// exactly how a second payout gets sent for the same request. A human has to
// reconcile against the gateway before it can be approved again.
func (s *WithdrawalStore) ReleaseClaim(ctx context.Context, id, reason string) error {
	_, err := s.db.ExecContext(ctx, `
		UPDATE poker_withdrawal SET status='payout_failed', reason=$2, updated_at=NOW()
		WHERE id=$1 AND status='paying'`, id, reason)
	return err
}

// Approve marks a claimed/pending withdrawal paid (funds were already held on
// request). Accepts 'paying' as well as 'pending' so the claim-then-pay path
// above can settle; the manual (non-gateway) path never enters 'paying' and is
// unaffected.
func (s *WithdrawalStore) Approve(ctx context.Context, id, payoutID string) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	// RETURNING the amount rather than re-reading it: the status predicate is
	// what makes this idempotent, and the row it claimed is the one to post.
	var amount int64
	err = tx.QueryRowContext(ctx, `
		UPDATE poker_withdrawal SET status='paid', gateway_payout_id=$2, updated_at=NOW()
		WHERE id=$1 AND status IN ('pending','paying')
		RETURNING amount_cents`, id, payoutID).Scan(&amount)
	if err == sql.ErrNoRows {
		return fmt.Errorf("withdrawal not pending")
	}
	if err != nil {
		return err
	}
	// Double-entry: approval is the moment the money actually leaves the
	// platform, so it moves from the pending-payout account out to the world.
	// The player's chips were already debited at request time (the hold), which
	// is why this leg is house-to-external and not user-to-external — posting it
	// against the user would debit them twice.
	if err := postLedgerKind(ctx, tx, "withdrawal_paid",
		AcctHouseWithdrawalPending, AcctExternalPayout, amount, "withdrawal_paid:"+id); err != nil {
		return err
	}
	return tx.Commit()
}

// Reject refunds the held funds and marks the withdrawal rejected, in ONE
// transaction. Idempotent-guarded on status='pending'.
func (s *WithdrawalStore) Reject(ctx context.Context, id, reason string) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	var userID string
	var amount int64
	err = tx.QueryRowContext(ctx, `
		UPDATE poker_withdrawal SET status='rejected', reason=$2, updated_at=NOW()
		WHERE id=$1 AND status='pending'
		RETURNING user_id, amount_cents`, id, reason).Scan(&userID, &amount)
	if err == sql.ErrNoRows {
		return fmt.Errorf("withdrawal not pending")
	}
	if err != nil {
		return err
	}
	var after int64
	if err := tx.QueryRowContext(ctx, `
		UPDATE poker_global_wallet SET balance=balance+$2, updated_at=NOW()
		WHERE user_id=$1 RETURNING balance`, userID, amount).Scan(&after); err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, `
		INSERT INTO poker_wallet_ledger (id, user_id, delta, balance_after, reason)
		VALUES ($1,$2,$3,$4,$5)`, NewID("wl"), userID, amount, after, "withdrawal_refund:"+id); err != nil {
		return err
	}
	// The mirror of the hold: rejected funds come back out of pending-payout.
	if err := postLedgerKind(ctx, tx, "withdrawal_refund",
		AcctHouseWithdrawalPending, UserAcct(userID), amount, "withdrawal_refund:"+id); err != nil {
		return err
	}
	return tx.Commit()
}

// GetByID returns a withdrawal, or (nil, nil) if missing.
func (s *WithdrawalStore) GetByID(ctx context.Context, id string) (*Withdrawal, error) {
	var w Withdrawal
	err := s.db.QueryRowContext(ctx, `
		SELECT id, user_id, amount_cents, currency, destination, gateway, gateway_payout_id, status, reason
		FROM poker_withdrawal WHERE id=$1`, id).
		Scan(&w.ID, &w.UserID, &w.AmountCents, &w.Currency, &w.Destination, &w.Gateway, &w.GatewayPayoutID, &w.Status, &w.Reason)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &w, nil
}

// SumRecentCents totals the user's non-rejected withdrawals in the trailing
// window (for the tier's weekly withdraw limit).
func (s *WithdrawalStore) SumRecentCents(ctx context.Context, userID string, hours int) (int64, error) {
	var sum sql.NullInt64
	err := s.db.QueryRowContext(ctx, `
		SELECT COALESCE(SUM(amount_cents),0) FROM poker_withdrawal
		WHERE user_id=$1 AND status<>'rejected'
		  AND created_at > NOW() - ($2 || ' hours')::interval`,
		userID, hours).Scan(&sum)
	if err != nil {
		return 0, err
	}
	return sum.Int64, nil
}

// List returns the user's recent withdrawals.
func (s *WithdrawalStore) List(ctx context.Context, userID string, limit int) ([]Withdrawal, error) {
	if limit <= 0 || limit > 100 {
		limit = 25
	}
	rows, err := s.db.QueryContext(ctx, `
		SELECT id, user_id, amount_cents, currency, destination, gateway, gateway_payout_id, status, reason
		FROM poker_withdrawal WHERE user_id=$1 ORDER BY created_at DESC LIMIT $2`, userID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Withdrawal
	for rows.Next() {
		var w Withdrawal
		if err := rows.Scan(&w.ID, &w.UserID, &w.AmountCents, &w.Currency, &w.Destination, &w.Gateway, &w.GatewayPayoutID, &w.Status, &w.Reason); err != nil {
			return nil, err
		}
		out = append(out, w)
	}
	return out, rows.Err()
}
