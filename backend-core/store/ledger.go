package store

import (
	"context"
	"database/sql"
	"errors"
)

// LedgerStore is a double-entry ledger: every transaction is a set of postings
// (signed amounts per account) that MUST sum to zero. It is the auditable-chips
// foundation — account balances and a global trial balance are derived purely by
// summing entries, so the books cannot silently drift.
type LedgerStore struct{ db *sql.DB }

func NewLedgerStore(db *sql.DB) *LedgerStore { return &LedgerStore{db: db} }

// Posting is one leg of a transaction: a signed amount against an account
// (credit > 0, debit < 0).
type Posting struct {
	Account     string `json:"account"`
	AmountMinor int64  `json:"amount_minor"`
	Reason      string `json:"reason,omitempty"`
}

// ErrUnbalanced is returned when postings do not sum to zero.
var ErrUnbalanced = errors.New("ledger postings must sum to zero")

// Post writes a balanced transaction atomically. It rejects (and writes nothing)
// unless the postings sum to zero and there are at least two legs.
func (s *LedgerStore) Post(ctx context.Context, kind, ref, memo string, postings []Posting) (string, error) {
	if len(postings) < 2 {
		return "", errors.New("a transaction needs at least two postings")
	}
	var sum int64
	for _, p := range postings {
		if p.Account == "" {
			return "", errors.New("posting account is required")
		}
		sum += p.AmountMinor
	}
	if sum != 0 {
		return "", ErrUnbalanced
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return "", err
	}
	defer func() { _ = tx.Rollback() }()
	txnID := NewID("ltx")
	if _, err := tx.ExecContext(ctx,
		`INSERT INTO poker_ledger_txn (id, kind, ref, memo) VALUES ($1,$2,$3,$4)`,
		txnID, kind, ref, memo); err != nil {
		return "", err
	}
	for _, p := range postings {
		if _, err := tx.ExecContext(ctx,
			`INSERT INTO poker_ledger_entry (txn_id, account, amount_minor, reason) VALUES ($1,$2,$3,$4)`,
			txnID, p.Account, p.AmountMinor, p.Reason); err != nil {
			return "", err
		}
	}
	if err := tx.Commit(); err != nil {
		return "", err
	}
	return txnID, nil
}

// Transfer is the common 2-leg case: move amount (>0) from one account to another.
func (s *LedgerStore) Transfer(ctx context.Context, from, to string, amountMinor int64, kind, ref, reason string) (string, error) {
	if amountMinor <= 0 {
		return "", errors.New("transfer amount must be positive")
	}
	return s.Post(ctx, kind, ref, reason, []Posting{
		{Account: from, AmountMinor: -amountMinor, Reason: reason},
		{Account: to, AmountMinor: amountMinor, Reason: reason},
	})
}

// Balance returns an account's balance (sum of its entries).
func (s *LedgerStore) Balance(ctx context.Context, account string) (int64, error) {
	var bal sql.NullInt64
	err := s.db.QueryRowContext(ctx,
		`SELECT COALESCE(SUM(amount_minor),0) FROM poker_ledger_entry WHERE account=$1`, account).Scan(&bal)
	return bal.Int64, err
}

// AccountBalance pairs an account with its balance for the trial balance.
type AccountBalance struct {
	Account string `json:"account"`
	Balance int64  `json:"balance_minor"`
}

// TrialBalance returns every account's balance and the global sum, which is
// invariantly zero for a correct double-entry ledger.
func (s *LedgerStore) TrialBalance(ctx context.Context) (accounts []AccountBalance, total int64, err error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT account, SUM(amount_minor) FROM poker_ledger_entry
		GROUP BY account ORDER BY account`)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()
	accounts = []AccountBalance{}
	for rows.Next() {
		var a AccountBalance
		if err := rows.Scan(&a.Account, &a.Balance); err != nil {
			return nil, 0, err
		}
		total += a.Balance
		accounts = append(accounts, a)
	}
	return accounts, total, rows.Err()
}

// LedgerEntryRow is one posting for the audit trail.
type LedgerEntryRow struct {
	TxnID       string `json:"txn_id"`
	Account     string `json:"account"`
	AmountMinor int64  `json:"amount_minor"`
	Reason      string `json:"reason"`
	CreatedAt   string `json:"created_at"`
}

// Entries returns recent postings for an account (audit trail).
func (s *LedgerStore) Entries(ctx context.Context, account string, limit int) ([]LedgerEntryRow, error) {
	if limit <= 0 || limit > 500 {
		limit = 100
	}
	rows, err := s.db.QueryContext(ctx, `
		SELECT txn_id, account, amount_minor, reason, created_at::text
		FROM poker_ledger_entry WHERE account=$1 ORDER BY id DESC LIMIT $2`, account, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []LedgerEntryRow{}
	for rows.Next() {
		var e LedgerEntryRow
		if err := rows.Scan(&e.TxnID, &e.Account, &e.AmountMinor, &e.Reason, &e.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, e)
	}
	return out, rows.Err()
}
