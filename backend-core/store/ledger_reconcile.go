package store

import (
	"context"
	"database/sql"
	"fmt"
)

// Opening the books on an existing business.
//
// The double-entry ledger was added to a platform that had already been moving
// money, and two things left it unable to describe that history:
//
//  1. Seven of the nine paths that move chips did not post at all until the
//     change that introduced PostTx.
//  2. Wallet creation grants an opening balance (the free-tier stipend) with a
//     bare INSERT and no posting, so EVERY wallet's opening balance is absent.
//
// The failure mode is not the one you would expect. A trial balance over that
// history reads EXACTLY ZERO and reports "balanced", because every posting that
// did happen was a balanced pair — nothing was ever written unbalanced. What is
// wrong is that the per-account balances are not reality: user:alice in the
// ledger has no relationship to what Alice's wallet actually holds. A green
// light that means nothing, which is the same defect the ledger exists to catch.
//
// The fix is what any bookkeeper does when opening a set of books mid-life: post
// the opening balances. For every account whose true value is known from the
// authoritative table, book the difference against house:opening_balance. After
// that the ledger describes reality, the total stays zero, and every subsequent
// movement keeps both true.
//
// It is idempotent by construction: it posts DIFFERENCES, so a second run finds
// every difference is zero and writes nothing.

// AcctHouseOpening absorbs the pre-ledger history. Its balance is a real
// quantity — how much of the current economy predates the books.
const AcctHouseOpening = "house:opening_balance"

// ReconcileLine is one account's drift between the ledger and the truth.
type ReconcileLine struct {
	Account     string `json:"account"`
	LedgerMinor int64  `json:"ledger_minor"`
	ActualMinor int64  `json:"actual_minor"`
	DriftMinor  int64  `json:"drift_minor"`
}

// ReconcileReport is the outcome of a reconciliation pass.
type ReconcileReport struct {
	DryRun       bool            `json:"dry_run"`
	Lines        []ReconcileLine `json:"lines"`
	TotalDrift   int64           `json:"total_drift_minor"`
	AccountsRead int             `json:"accounts_read"`
	Posted       bool            `json:"posted"`
	TxnID        string          `json:"txn_id,omitempty"`
}

// ReconcileOpeningBalances compares every account the ledger should describe
// against its authoritative table and, unless dryRun, books the difference.
//
// dryRun exists because this writes to the books. An operator should be able to
// see the drift — and satisfy themselves it is history rather than a live bug —
// before anything is posted.
func (s *LedgerStore) ReconcileOpeningBalances(ctx context.Context, dryRun bool) (*ReconcileReport, error) {
	rep := &ReconcileReport{DryRun: dryRun, Lines: []ReconcileLine{}}

	// Ledger balances for every account that has any posting, in one pass. The
	// per-account alternative is a query per user, which on a real player base is
	// the difference between a page load and a timeout.
	ledgerBal := map[string]int64{}
	rows, err := s.db.QueryContext(ctx,
		`SELECT account, COALESCE(SUM(amount_minor),0) FROM poker_ledger_entry GROUP BY account`)
	if err != nil {
		return nil, err
	}
	for rows.Next() {
		var acct string
		var bal int64
		if err := rows.Scan(&acct, &bal); err != nil {
			rows.Close()
			return nil, err
		}
		ledgerBal[acct] = bal
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return nil, err
	}

	// Authoritative balances. Global wallets first.
	if err := s.collectDrift(ctx, rep, ledgerBal,
		`SELECT user_id, balance FROM poker_global_wallet`,
		func(id string) string { return UserAcct(id) }); err != nil {
		return nil, err
	}

	// Club-allocated chips. balance + locked_amount is the member's whole
	// holding: chips sitting in a live pot are still theirs, and counting only
	// `balance` would book a phantom shortfall for everyone currently seated.
	if err := s.collectDrift(ctx, rep, ledgerBal,
		`SELECT club_id || ':' || user_id, balance + locked_amount FROM poker_player_balance`,
		func(id string) string { return "clubchips:" + id }); err != nil {
		return nil, err
	}

	if len(rep.Lines) == 0 || dryRun {
		return rep, nil
	}

	// One transaction with a leg per drifted account plus the balancing
	// opening-balance leg. Posting them separately would leave a window in which
	// the books were unbalanced, which is the one state the ledger promises never
	// to be in.
	postings := make([]Posting, 0, len(rep.Lines)+1)
	for _, l := range rep.Lines {
		postings = append(postings, Posting{
			Account:     l.Account,
			AmountMinor: l.DriftMinor,
			Reason:      "opening balance",
		})
	}
	postings = append(postings, Posting{
		Account:     AcctHouseOpening,
		AmountMinor: -rep.TotalDrift,
		Reason:      "opening balance",
	})

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()
	txnID, err := PostTx(ctx, tx, "opening_balance", "reconcile", "pre-ledger opening balances", postings)
	if err != nil {
		return nil, fmt.Errorf("opening balance posting rejected: %w", err)
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	rep.Posted, rep.TxnID = true, txnID
	return rep, nil
}

// collectDrift adds a line for every row whose actual balance differs from the
// ledger's. `q` must select (id, balance_minor); `acct` maps the id to a ledger
// account name.
func (s *LedgerStore) collectDrift(
	ctx context.Context,
	rep *ReconcileReport,
	ledgerBal map[string]int64,
	q string,
	acct func(string) string,
) error {
	rows, err := s.db.QueryContext(ctx, q)
	if err != nil {
		// A table that does not exist yet is not a reconciliation failure — the
		// club-chip tables are empty on a fresh install.
		if isMissingRelation(err) {
			return nil
		}
		return err
	}
	defer rows.Close()
	for rows.Next() {
		var id string
		var actual int64
		if err := rows.Scan(&id, &actual); err != nil {
			return err
		}
		rep.AccountsRead++
		account := acct(id)
		drift := actual - ledgerBal[account]
		if drift == 0 {
			continue
		}
		rep.Lines = append(rep.Lines, ReconcileLine{
			Account:     account,
			LedgerMinor: ledgerBal[account],
			ActualMinor: actual,
			DriftMinor:  drift,
		})
		rep.TotalDrift += drift
	}
	return rows.Err()
}

func isMissingRelation(err error) bool {
	if err == nil || err == sql.ErrNoRows {
		return false
	}
	msg := err.Error()
	return containsAny(msg, "does not exist", "no such table", "undefined_table")
}

func containsAny(s string, subs ...string) bool {
	for _, sub := range subs {
		if len(sub) > 0 && len(s) >= len(sub) {
			for i := 0; i+len(sub) <= len(s); i++ {
				if s[i:i+len(sub)] == sub {
					return true
				}
			}
		}
	}
	return false
}
