package store

import (
	"testing"
	"time"
)

// The daily window now gates two different things — tournament registration and
// cash-table sit-down — so a regression here closes tables, not just a form.

func at(h, m int) time.Time {
	return time.Date(2026, 7, 27, h, m, 0, 0, time.UTC)
}

func TestNoDailyWindow_EqualMeansAlwaysOpen(t *testing.T) {
	// THE MIGRATION RULE, same shape as the permissions grid: every table and
	// tournament that existed before the window did sends 0/0. If equal ever meant
	// "closed", the first deploy would refuse every sit-down on the platform.
	if !NoDailyWindow(0, 0) {
		t.Fatal("0/0 was not treated as always-open — this closes every existing table")
	}
	for h := 0; h < 24; h++ {
		if !WithinDailyWindow(0, 0, at(h, 0)) {
			t.Errorf("a table with no window refused a seat at %02d:00", h)
		}
	}
	// A window with width but identical endpoints is the same case.
	if !WithinDailyWindow(18*60, 18*60, at(3, 0)) {
		t.Error("18:00-18:00 was treated as a real window")
	}
}

func TestWithinDailyWindow_SameDay(t *testing.T) {
	start, end := 9*60, 17*60 // 09:00–17:00
	for _, tc := range []struct {
		h, m int
		want bool
	}{
		{8, 59, false},
		{9, 0, true},  // start is inclusive
		{12, 30, true},
		{16, 59, true},
		{17, 0, false}, // end is exclusive — 17:00 is closing time, not open
		{23, 0, false},
	} {
		if got := WithinDailyWindow(start, end, at(tc.h, tc.m)); got != tc.want {
			t.Errorf("09:00-17:00 at %02d:%02d = %v, want %v", tc.h, tc.m, got, tc.want)
		}
	}
}

func TestWithinDailyWindow_WrapsMidnight(t *testing.T) {
	// The case a naive `start <= now && now < end` gets wrong. A club night from
	// 18:00 to 02:00 is eight hours of evening play; read the other way it becomes
	// a sixteen-hour daytime window with the actual session excluded — the table
	// would be shut exactly when people want to play.
	start, end := 18*60, 2*60
	for _, tc := range []struct {
		h, m int
		want bool
	}{
		{17, 59, false},
		{18, 0, true},
		{23, 30, true},
		{0, 15, true}, // past midnight, still the same session
		{1, 59, true},
		{2, 0, false},
		{9, 0, false},
	} {
		if got := WithinDailyWindow(start, end, at(tc.h, tc.m)); got != tc.want {
			t.Errorf("18:00-02:00 at %02d:%02d = %v, want %v", tc.h, tc.m, got, tc.want)
		}
	}
}

func TestWithinDailyWindow_UsesUTCNotLocal(t *testing.T) {
	// Every player at a table shares one server clock. If this read the caller's
	// zone, two players at the same table could disagree about whether it is open.
	loc := time.FixedZone("UTC-7", -7*3600)
	// 20:00 in UTC-7 is 03:00 UTC the next day — inside a 02:00–06:00 UTC window.
	local := time.Date(2026, 7, 27, 20, 0, 0, 0, loc)
	if !WithinDailyWindow(2*60, 6*60, local) {
		t.Error("a non-UTC timestamp was not normalised to UTC before comparison")
	}
	if WithinDailyWindow(19*60, 21*60, local) {
		t.Error("the window was matched against the local clock instead of UTC")
	}
}

func TestValidDailyMinute(t *testing.T) {
	for _, v := range []int{0, 1, 720, 1439} {
		if !ValidDailyMinute(v) {
			t.Errorf("%d rejected but is a legal minute", v)
		}
	}
	for _, v := range []int{-1, 1440, 99999} {
		if ValidDailyMinute(v) {
			t.Errorf("%d accepted but is not a legal minute", v)
		}
	}
}

func TestClockLabel(t *testing.T) {
	// twoDigit builds strings rune-by-rune, so an off-by-one corrupts the operator
	// -facing "this table is open …" message rather than failing loudly.
	for _, tc := range []struct {
		min  int
		want string
	}{
		{0, "00:00"}, {5, "00:05"}, {9 * 60, "09:00"},
		{18*60 + 30, "18:30"}, {23*60 + 59, "23:59"},
	} {
		if got := ClockLabel(tc.min); got != tc.want {
			t.Errorf("ClockLabel(%d) = %q, want %q", tc.min, got, tc.want)
		}
	}
	// Out of range renders a placeholder rather than garbage runes.
	for _, bad := range []int{-1, 1440} {
		if got := ClockLabel(bad); got != "--:--" {
			t.Errorf("ClockLabel(%d) = %q, want a placeholder", bad, got)
		}
	}
}

func TestDailyWindowLabel(t *testing.T) {
	if got := DailyWindowLabel(18*60, 2*60); got != "18:00–02:00 UTC" {
		t.Errorf("DailyWindowLabel = %q", got)
	}
}
