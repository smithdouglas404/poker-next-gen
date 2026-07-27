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
