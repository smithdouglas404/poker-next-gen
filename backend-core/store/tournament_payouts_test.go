package store

import (
	"testing"

	"github.com/smithdouglas404/poker-next-gen/backend-core/models"
)

func tier(from, to, bps int32) models.PrizeDistributionPool {
	return models.PrizeDistributionPool{RankFrom: from, RankTo: to, PayoutBps: bps}
}

func finishers(n int) []Finisher {
	out := make([]Finisher, 0, n)
	for i := 1; i <= n; i++ {
		out = append(out, Finisher{UserID: string(rune('a' + i - 1)), FinishPlace: i})
	}
	return out
}

func paidTotal(payouts []TournamentPayout) int64 {
	var total int64
	for _, p := range payouts {
		total += p.AmountMinor
	}
	return total
}

func TestPayoutsFollowTheLadder(t *testing.T) {
	got := TournamentPayouts([]models.PrizeDistributionPool{
		tier(1, 1, 5000), tier(2, 2, 3000), tier(3, 4, 2000),
	}, finishers(4), 100_000)

	want := map[int]int64{1: 50_000, 2: 30_000, 3: 10_000, 4: 10_000}
	if len(got) != len(want) {
		t.Fatalf("paid %d places, want %d", len(got), len(want))
	}
	for _, p := range got {
		if p.AmountMinor != want[p.Place] {
			t.Fatalf("place %d paid %d, want %d", p.Place, p.AmountMinor, want[p.Place])
		}
	}
}

// An operator ladder that promises more than the pool must not pay out more
// than the tournament collected — it is scaled down proportionally.
func TestOverPromisedLadderNeverExceedsThePool(t *testing.T) {
	got := TournamentPayouts([]models.PrizeDistributionPool{
		tier(1, 1, 8000), tier(2, 2, 8000), tier(3, 3, 4000),
	}, finishers(3), 100_000)

	if total := paidTotal(got); total > 100_000 {
		t.Fatalf("paid %d out of a 100000 pool", total)
	}
	if len(got) != 3 {
		t.Fatalf("all three tiers should still be paid, got %d", len(got))
	}
}

// A tournament with no configured ladder used to collect every buy-in and pay
// nobody. The pool goes to the champion instead.
func TestNoLadderPaysTheChampion(t *testing.T) {
	got := TournamentPayouts(nil, finishers(3), 90_000)
	if len(got) != 1 || got[0].Place != 1 || got[0].AmountMinor != 90_000 {
		t.Fatalf("want the whole pool to place 1, got %+v", got)
	}
}

// Unusable tiers are ignored rather than paying a negative or misordered share.
func TestBrokenTiersAreIgnored(t *testing.T) {
	got := TournamentPayouts([]models.PrizeDistributionPool{
		tier(0, 0, 5000), tier(3, 2, 5000), tier(1, 1, -100), tier(1, 2, 10000),
	}, finishers(2), 100_000)

	if total := paidTotal(got); total != 100_000 {
		t.Fatalf("the one usable tier should pay the whole pool, paid %d", total)
	}
}

// A tier's share splits evenly across its places, and the odd chip goes to the
// better finish rather than being dropped.
func TestTierRemainderGoesToTheHigherFinish(t *testing.T) {
	got := TournamentPayouts([]models.PrizeDistributionPool{tier(1, 2, 10000)}, finishers(2), 101)
	if total := paidTotal(got); total != 101 {
		t.Fatalf("split paid %d of 101", total)
	}
	for _, p := range got {
		if p.Place == 1 && p.AmountMinor != 51 {
			t.Fatalf("place 1 paid %d, want the odd chip (51)", p.AmountMinor)
		}
	}
}

func TestPrizeLadderValidation(t *testing.T) {
	existing := []models.PrizeDistributionPool{tier(1, 1, 6000), tier(2, 3, 3000)}

	overlap := tier(3, 4, 1000)
	if err := ValidatePrizeLadder(existing, &overlap); err == nil {
		t.Fatalf("a tier overlapping places 2-3 must be rejected")
	}
	tooMuch := tier(4, 4, 2000)
	if err := ValidatePrizeLadder(existing, &tooMuch); err == nil {
		t.Fatalf("a ladder totalling 110%% must be rejected")
	}
	zero := tier(4, 4, 0)
	if err := ValidatePrizeLadder(existing, &zero); err == nil {
		t.Fatalf("a zero-share tier must be rejected")
	}
	ok := tier(4, 5, 1000)
	if err := ValidatePrizeLadder(existing, &ok); err != nil {
		t.Fatalf("a valid tier was rejected: %v", err)
	}
}
