package store

import (
	"testing"
	"time"

	"github.com/smithdouglas404/poker-next-gen/backend-core/models"
)

// The pool/rake split is the one number three separate code paths used to
// compute independently (director payout, analytics snapshot, finalize), and
// getting it wrong pays out or withholds real money. These lock the arithmetic.

func TestTournamentMoney_FeeComesOutOfTheBuyIn(t *testing.T) {
	// $220 buy-in with a $20 entry fee, 42 entrants. The player pays $220; the
	// club keeps $20 of it; $200 per entrant funds the pool.
	b := &models.TournamentBracket{BuyInMinor: 22000, FeeMinor: 2000}
	e := TournamentMoney(b, 42)

	if want := int64(42 * 22000); e.GrossMinor != want {
		t.Errorf("gross = %d, want %d", e.GrossMinor, want)
	}
	if want := int64(42 * 2000); e.RakeMinor != want {
		t.Errorf("rake = %d, want %d", e.RakeMinor, want)
	}
	if want := int64(42 * 20000); e.PoolMinor != want {
		t.Errorf("pool = %d, want %d", e.PoolMinor, want)
	}
	// The whole point: gross must reconcile exactly.
	if e.PoolMinor+e.RakeMinor != e.GrossMinor {
		t.Errorf("pool+rake (%d) != gross (%d) — money is being created or lost",
			e.PoolMinor+e.RakeMinor, e.GrossMinor)
	}
}

func TestTournamentMoney_AdminFeeIsPercentOfBuyIn(t *testing.T) {
	// $100 buy-in, no flat fee, 10% admin fee, 10 entrants => $10/entry to club.
	b := &models.TournamentBracket{BuyInMinor: 10000, AdminFeeBps: 1000}
	e := TournamentMoney(b, 10)

	if want := int64(10 * 1000); e.RakeMinor != want {
		t.Errorf("rake = %d, want %d", e.RakeMinor, want)
	}
	if want := int64(10 * 9000); e.PoolMinor != want {
		t.Errorf("pool = %d, want %d", e.PoolMinor, want)
	}
}

func TestTournamentMoney_RakeIsClampedToTheBuyIn(t *testing.T) {
	// A misconfigured fee larger than the buy-in must not produce a negative
	// pool — that would mean paying out less than nothing.
	b := &models.TournamentBracket{BuyInMinor: 5000, FeeMinor: 9000, AdminFeeBps: 5000}
	e := TournamentMoney(b, 4)

	if e.PoolMinor < 0 {
		t.Errorf("pool = %d, must never be negative", e.PoolMinor)
	}
	if e.RakeMinor != e.GrossMinor {
		t.Errorf("rake = %d, want it clamped to gross %d", e.RakeMinor, e.GrossMinor)
	}
}

func TestTournamentMoney_GuaranteeCreatesAnOverlay(t *testing.T) {
	// $10,000 guaranteed, but only 10 × $100 buy-ins with no fee = $1,000.
	// The club covers $9,000 and that cost is reported, not hidden in the pool.
	b := &models.TournamentBracket{BuyInMinor: 10000, GuaranteeMinor: 1000000}
	e := TournamentMoney(b, 10)

	if want := int64(1000000); e.PoolMinor != want {
		t.Errorf("pool = %d, want the guarantee %d", e.PoolMinor, want)
	}
	if want := int64(1000000 - 100000); e.OverlayMinor != want {
		t.Errorf("overlay = %d, want %d", e.OverlayMinor, want)
	}
}

func TestTournamentMoney_GuaranteeNeverShrinksAHealthyPool(t *testing.T) {
	// 500 × $100 = $50,000 against a $10,000 guarantee: the guarantee is met and
	// must not cap the pool.
	b := &models.TournamentBracket{BuyInMinor: 10000, GuaranteeMinor: 1000000}
	e := TournamentMoney(b, 500)

	if want := int64(500 * 10000); e.PoolMinor != want {
		t.Errorf("pool = %d, want %d", e.PoolMinor, want)
	}
	if e.OverlayMinor != 0 {
		t.Errorf("overlay = %d, want 0 when the field covers the guarantee", e.OverlayMinor)
	}
}

func TestTournamentMoney_ZeroEntrantsIsZero(t *testing.T) {
	b := &models.TournamentBracket{BuyInMinor: 10000, FeeMinor: 1000}
	e := TournamentMoney(b, 0)
	if e.GrossMinor != 0 || e.RakeMinor != 0 || e.PoolMinor != 0 {
		t.Errorf("empty field should produce no money, got %+v", e)
	}
}

func TestRegistrationOpen_LateRegWindow(t *testing.T) {
	start := time.Date(2026, 7, 27, 18, 0, 0, 0, time.UTC)
	b := &models.TournamentBracket{Status: "running", ScheduledAt: start, LateRegSecs: 3600}

	if open, why := RegistrationOpen(b, start.Add(30*time.Minute)); !open {
		t.Errorf("30 min into a 60 min late-reg window should be open, got %q", why)
	}
	if open, _ := RegistrationOpen(b, start.Add(90*time.Minute)); open {
		t.Error("90 min into a 60 min late-reg window must be closed")
	}
}

func TestRegistrationOpen_ZeroWindowClosesAtStart(t *testing.T) {
	start := time.Date(2026, 7, 27, 18, 0, 0, 0, time.UTC)
	b := &models.TournamentBracket{Status: "running", ScheduledAt: start}

	if open, _ := RegistrationOpen(b, start.Add(time.Minute)); open {
		t.Error("with no late-reg window, registration must close at the start time")
	}
}

func TestRegistrationOpen_OperatingHoursWrapMidnight(t *testing.T) {
	// 18:00–04:00 UTC.
	base := &models.TournamentBracket{
		Status: "registering", OperatingStartMin: 18 * 60, OperatingEndMin: 4 * 60,
		ScheduledAt: time.Date(2026, 7, 28, 12, 0, 0, 0, time.UTC),
	}
	day := func(h, m int) time.Time { return time.Date(2026, 7, 27, h, m, 0, 0, time.UTC) }

	for _, tc := range []struct {
		at   time.Time
		open bool
	}{
		{day(20, 0), true},  // inside, before midnight
		{day(2, 0), true},   // inside, after midnight
		{day(17, 59), false},
		{day(4, 0), false}, // end is exclusive
	} {
		if open, _ := RegistrationOpen(base, tc.at); open != tc.open {
			t.Errorf("at %s: open=%v, want %v", tc.at.Format("15:04"), open, tc.open)
		}
	}
}

func TestRegistrationOpen_EqualHoursMeansAlwaysOpen(t *testing.T) {
	b := &models.TournamentBracket{
		Status: "registering", OperatingStartMin: 0, OperatingEndMin: 0,
		ScheduledAt: time.Date(2026, 7, 28, 12, 0, 0, 0, time.UTC),
	}
	if open, why := RegistrationOpen(b, time.Date(2026, 7, 27, 3, 0, 0, 0, time.UTC)); !open {
		t.Errorf("equal start/end means no window, got %q", why)
	}
}

func TestClockLabel(t *testing.T) {
	// twoDigit builds strings rune-by-rune; a regression here would corrupt the
	// operator-facing "outside its operating hours" message.
	for _, tc := range []struct{ min int; want string }{
		{0, "00:00"}, {9 * 60, "09:00"}, {18*60 + 30, "18:30"}, {23*60 + 59, "23:59"},
	} {
		if got := clockLabel(tc.min); got != tc.want {
			t.Errorf("clockLabel(%d) = %q, want %q", tc.min, got, tc.want)
		}
	}
}
