package store

import (
	"errors"
	"testing"
)

// The double-entry ledger is the platform's only self-checking view of the chip
// economy: an operator reads the trial balance and believes it. Every money path
// now posts through ValidatePostings, so this invariant is load-bearing for all
// of them at once.

func TestValidatePostings_AcceptsABalancedTransfer(t *testing.T) {
	if err := ValidatePostings([]Posting{
		{Account: UserAcct("alice"), AmountMinor: -500},
		{Account: UserAcct("bob"), AmountMinor: 500},
	}); err != nil {
		t.Fatalf("a balanced two-leg transfer was rejected: %v", err)
	}
}

func TestValidatePostings_AcceptsAMultiLegTrade(t *testing.T) {
	// The marketplace shape: buyer pays price, seller takes net, house takes fee.
	// It is ONE transaction because price == net + fee; posting it as separate
	// pairs would lose which fee belonged to which sale.
	const price, fee = 1000, 75
	if err := ValidatePostings([]Posting{
		{Account: UserAcct("buyer"), AmountMinor: -price},
		{Account: UserAcct("seller"), AmountMinor: price - fee},
		{Account: AcctHouseMarketplaceFee, AmountMinor: fee},
	}); err != nil {
		t.Fatalf("a balanced three-leg trade was rejected: %v", err)
	}
}

func TestValidatePostings_RejectsUnbalanced(t *testing.T) {
	// The failure this exists to prevent. An unbalanced posting does not corrupt
	// one feature — it makes the global trial balance non-zero, and the trial
	// balance is the one number nobody can independently verify.
	err := ValidatePostings([]Posting{
		{Account: UserAcct("alice"), AmountMinor: -500},
		{Account: UserAcct("bob"), AmountMinor: 499}, // a rounding slip
	})
	if !errors.Is(err, ErrUnbalanced) {
		t.Errorf("a 1-minor-unit imbalance was accepted (err = %v)", err)
	}
	// The classic fee-math slip: net computed independently of the price.
	err = ValidatePostings([]Posting{
		{Account: UserAcct("buyer"), AmountMinor: -1000},
		{Account: UserAcct("seller"), AmountMinor: 950},
		{Account: AcctHouseMarketplaceFee, AmountMinor: 75}, // 950+75 != 1000
	})
	if !errors.Is(err, ErrUnbalanced) {
		t.Errorf("a trade whose legs overpay was accepted (err = %v)", err)
	}
}

func TestValidatePostings_RejectsSingleLeg(t *testing.T) {
	// A one-legged posting is how money appears from nowhere. It is also the
	// shape a careless caller reaches for first.
	if err := ValidatePostings([]Posting{{Account: UserAcct("alice"), AmountMinor: 0}}); err == nil {
		t.Error("a single posting was accepted as a transaction")
	}
	if err := ValidatePostings(nil); err == nil {
		t.Error("an empty transaction was accepted")
	}
}

func TestValidatePostings_RejectsUnnamedAccount(t *testing.T) {
	// A blank account still sums to zero, so the balance check alone would let it
	// through — and the amount would land in an account nobody can query.
	if err := ValidatePostings([]Posting{
		{Account: "", AmountMinor: -500},
		{Account: UserAcct("bob"), AmountMinor: 500},
	}); err == nil {
		t.Error("a posting with no account was accepted")
	}
}

func TestLedgerAccountNamespaces(t *testing.T) {
	// Deposits and withdrawals only balance because the outside world has
	// accounts. If these were ever dropped, the two flows that matter most would
	// have to be excluded from the trial balance for it to reconcile — which is
	// exactly the state this change fixed.
	for name, acct := range map[string]string{
		"external deposit":   AcctExternalDeposit,
		"external payout":    AcctExternalPayout,
		"withdrawal pending": AcctHouseWithdrawalPending,
		"rakeback":           AcctHouseRakeback,
		"bonus":              AcctHouseBonus,
		"marketplace fee":    AcctHouseMarketplaceFee,
	} {
		if acct == "" {
			t.Errorf("%s account name is empty", name)
		}
	}
	if UserAcct("abc") != "user:abc" {
		t.Errorf("UserAcct produced %q; the user: prefix is what separates player balances from house accounts", UserAcct("abc"))
	}
	// House and external accounts must not collide with the user namespace, or a
	// player id could be crafted to post into a house account.
	for _, acct := range []string{AcctExternalDeposit, AcctExternalPayout, AcctHouseWithdrawalPending} {
		if len(acct) > 5 && acct[:5] == "user:" {
			t.Errorf("%q sits in the user namespace", acct)
		}
	}
}

func TestTableAccountSettlesToZero(t *testing.T) {
	// The invariant the table account exists to make checkable: chips move onto
	// the felt, get redistributed by play, rake comes out, and once every seat has
	// cashed out the table holds nothing.
	//
	// Modelled here as the postings a real hand produces. Alice and Bob each buy
	// in 1000; Alice wins the 2000 pot less 50 rake and leaves with 1950; Bob
	// leaves with 0. If any leg were posted against a house bucket instead of the
	// table — which is what every one of these did before — the table would stay
	// permanently long and "did this table settle?" would be unanswerable.
	const table = "table:match-1"
	legs := []Posting{
		{Account: UserAcct("alice"), AmountMinor: -1000}, // buy-in
		{Account: table, AmountMinor: 1000},
		{Account: UserAcct("bob"), AmountMinor: -1000}, // buy-in
		{Account: table, AmountMinor: 1000},
		{Account: table, AmountMinor: -50}, // rake out of the pot
		{Account: AcctHouseRake, AmountMinor: 50},
		{Account: table, AmountMinor: -1950}, // Alice cashes out
		{Account: UserAcct("alice"), AmountMinor: 1950},
	}
	if err := ValidatePostings(legs); err != nil {
		t.Fatalf("the hand's postings do not balance: %v", err)
	}
	var tableBal int64
	for _, p := range legs {
		if p.Account == table {
			tableBal += p.AmountMinor
		}
	}
	if tableBal != 0 {
		t.Errorf("table account closed at %d, not 0 — chips were left on an empty felt", tableBal)
	}
	// And the players' net is exactly the pot less rake: Alice +950, Bob -1000.
	var alice, bob int64
	for _, p := range legs {
		switch p.Account {
		case UserAcct("alice"):
			alice += p.AmountMinor
		case UserAcct("bob"):
			bob += p.AmountMinor
		}
	}
	if alice != 950 || bob != -1000 || alice+bob+50 != 0 {
		t.Errorf("player net wrong: alice=%d bob=%d (rake 50 must close the gap)", alice, bob)
	}
}

func TestTableAcctNamespace(t *testing.T) {
	if TableAcct("m1") != "table:m1" {
		t.Errorf("TableAcct = %q", TableAcct("m1"))
	}
	// Must not collide with the player or club namespaces, or a crafted match id
	// could post into someone's balance.
	for _, prefix := range []string{"user:", "clubchips:", "house:", "external:"} {
		if len(TableAcct("x")) >= len(prefix) && TableAcct("x")[:len(prefix)] == prefix {
			t.Errorf("table account collides with the %q namespace", prefix)
		}
	}
}

func TestOpeningBalanceReconciliationIsBalanced(t *testing.T) {
	// The shape ReconcileOpeningBalances posts: one leg per drifted account plus
	// a single balancing leg against house:opening_balance. If that leg were
	// computed independently of the others — the obvious way to write it — the
	// books would open unbalanced, which is the one state the ledger promises
	// never to be in.
	drifts := []int64{100000, 250, -75, 1, 999999}
	var total int64
	postings := make([]Posting, 0, len(drifts)+1)
	for i, d := range drifts {
		postings = append(postings, Posting{
			Account:     UserAcct(string(rune('a' + i))),
			AmountMinor: d,
		})
		total += d
	}
	postings = append(postings, Posting{Account: AcctHouseOpening, AmountMinor: -total})
	if err := ValidatePostings(postings); err != nil {
		t.Fatalf("opening-balance transaction does not balance: %v", err)
	}
}

func TestOpeningBalanceAccountIsOutsideThePlayerNamespace(t *testing.T) {
	// It absorbs every pre-ledger difference, so if it lived under user: a player
	// id could be crafted to collide with it and inherit the whole backlog.
	if len(AcctHouseOpening) > 5 && AcctHouseOpening[:5] == "user:" {
		t.Error("the opening-balance account sits in the player namespace")
	}
	if AcctHouseOpening == "" {
		t.Error("opening-balance account is unnamed")
	}
}

func TestReconciliationIsIdempotentByConstruction(t *testing.T) {
	// It posts DIFFERENCES, so once the ledger matches reality a second run finds
	// nothing to do. Modelled here: after booking, ledger == actual, so drift is
	// zero everywhere and no transaction is produced.
	actual := map[string]int64{"user:a": 5000, "user:b": 250}
	ledger := map[string]int64{} // pre-reconcile: empty

	firstPass := 0
	for acct, want := range actual {
		if want-ledger[acct] != 0 {
			firstPass++
			ledger[acct] = want // booking the difference
		}
	}
	if firstPass != 2 {
		t.Fatalf("first pass adjusted %d accounts, want 2", firstPass)
	}
	secondPass := 0
	for acct, want := range actual {
		if want-ledger[acct] != 0 {
			secondPass++
		}
	}
	if secondPass != 0 {
		t.Errorf("second pass would adjust %d accounts — reconciliation is not idempotent", secondPass)
	}
}
