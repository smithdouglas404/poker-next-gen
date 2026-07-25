package poker

import "testing"

// Tier-0 correctness regressions. These cover the network-free engine logic
// (blind assignment + the no-limit raise rules); StartHand's shuffle draw is a
// sidecar call, so the blind SEAT SELECTION is tested via blindSeats() and the
// raise rules via ApplyAction() on a hand-built table — no engine-math needed.

// Fix 1: heads-up (2 players) — the BUTTON is the small blind, the other seat
// is the big blind. Regression guard against the reversed assignment.
func TestHeadsUpButtonIsSmallBlind(t *testing.T) {
	tbl := NewTable()
	tbl.Seats[0] = &Seat{Index: 0, UserID: "u0", Status: SeatSeated, Stack: 10000}
	tbl.Seats[1] = &Seat{Index: 1, UserID: "u1", Status: SeatSeated, Stack: 10000}
	tbl.ButtonSeat = 0

	sb, bb := tbl.blindSeats(2)
	if sb != 0 {
		t.Fatalf("heads-up SB seat = %d, want 0 (the button posts the small blind)", sb)
	}
	if bb != 1 {
		t.Fatalf("heads-up BB seat = %d, want 1 (the non-button seat)", bb)
	}
}

// Fix 1 (continued): 3-handed blinds are unchanged — SB left of the button, BB
// left of the SB.
func TestThreeHandedBlindsUnchanged(t *testing.T) {
	tbl := NewTable()
	for i := 0; i < 3; i++ {
		tbl.Seats[i] = &Seat{Index: i, UserID: "u", Status: SeatSeated, Stack: 10000}
	}
	tbl.ButtonSeat = 0

	sb, bb := tbl.blindSeats(3)
	if sb != 1 || bb != 2 {
		t.Fatalf("3-handed blinds sb=%d bb=%d, want sb=1 bb=2", sb, bb)
	}
}

// preflopTable builds a deterministic 3-handed preflop state without a shuffle:
// button=0, SB(seat1)=50, BB(seat2)=100, action on seat0 (UTG). CurrentBet=100,
// MinRaise=100 — a fresh preflop with a $50/$100 blind.
func preflopTable(utgStack int64) *Table {
	tbl := NewTable()
	tbl.Seats[0] = &Seat{Index: 0, UserID: "u0", Status: SeatSeated, Stack: utgStack, Bet: 0}
	tbl.Seats[1] = &Seat{Index: 1, UserID: "u1", Status: SeatSeated, Stack: 9950, Bet: 50, TotalContributed: 50, LastAction: "SB"}
	tbl.Seats[2] = &Seat{Index: 2, UserID: "u2", Status: SeatSeated, Stack: 9900, Bet: 100, TotalContributed: 100, LastAction: "BB"}
	tbl.ButtonSeat = 0
	tbl.ActionSeat = 0
	tbl.CurrentBet = 100
	tbl.MinRaise = 100
	tbl.Pot = 150
	tbl.Street = StreetPreflop
	tbl.ActedThisRound = map[int]bool{}
	tbl.LastAggressorSeat = -1
	return tbl
}

// Fix 3: a raise ABOVE a call but BELOW the legal minimum (CurrentBet+MinRaise)
// is rejected — unless it is an all-in for less.
func TestRaiseBelowMinimumRejected(t *testing.T) {
	tbl := preflopTable(10000)
	// Legal min raise-to = 100 + 100 = 200. A raise to 150 is above the call
	// (100) but below the minimum and the actor is deep-stacked, so illegal.
	if err := tbl.ApplyAction(0, "raise", 150); err == nil {
		t.Fatalf("raise to 150 (min 200) must be rejected, got nil error")
	}
	// The rejected action must not have moved any chips.
	if tbl.CurrentBet != 100 || tbl.Seats[0].Bet != 0 || tbl.Pot != 150 {
		t.Fatalf("rejected raise mutated state: currentBet=%d seat0Bet=%d pot=%d",
			tbl.CurrentBet, tbl.Seats[0].Bet, tbl.Pot)
	}
	// A raise to exactly the minimum is accepted.
	if err := tbl.ApplyAction(0, "raise", 200); err != nil {
		t.Fatalf("raise to the minimum (200) must be accepted, got %v", err)
	}
	if tbl.CurrentBet != 200 || tbl.MinRaise != 100 {
		t.Fatalf("after min raise currentBet=%d minRaise=%d, want 200/100", tbl.CurrentBet, tbl.MinRaise)
	}
}

// Fix 3 (edge): an all-in for LESS than the minimum raise is still allowed (a
// player may always put their last chips in).
func TestAllInBelowMinimumAllowed(t *testing.T) {
	// UTG has only 170 behind — an all-in totals 170, below the 200 minimum.
	tbl := preflopTable(170)
	if err := tbl.ApplyAction(0, "all_in", 0); err != nil {
		t.Fatalf("all-in below the minimum must be allowed, got %v", err)
	}
	if tbl.Seats[0].Status != SeatAllIn || tbl.Seats[0].Bet != 170 {
		t.Fatalf("all-in did not commit the stack: status=%s bet=%d", tbl.Seats[0].Status, tbl.Seats[0].Bet)
	}
}

// Fix 2: a short all-in that does NOT complete a full raise must not re-open the
// betting for players who already acted, and must not change the min-raise size.
func TestShortAllInDoesNotReopenAction(t *testing.T) {
	tbl := preflopTable(10000)
	// Seat 0 makes a full raise to 300 (increment 200). This re-opens and records
	// the new min-raise size.
	if err := tbl.ApplyAction(0, "raise", 300); err != nil {
		t.Fatalf("full raise to 300 rejected: %v", err)
	}
	if tbl.MinRaise != 200 {
		t.Fatalf("after full raise minRaise=%d, want 200", tbl.MinRaise)
	}
	if !tbl.ActedThisRound[0] {
		t.Fatalf("raiser should be marked as acted")
	}

	// Seat 1 (SB, 50 in) has a short stack and shoves all-in for a total of 400.
	// Increment = 400-300 = 100 < the 200 min-raise, so it's a short all-in that
	// does NOT re-open action.
	tbl.ActionSeat = 1
	tbl.Seats[1].Stack = 350 // 50 already in → all-in total 400
	if err := tbl.ApplyAction(1, "all_in", 0); err != nil {
		t.Fatalf("short all-in rejected: %v", err)
	}
	if tbl.MinRaise != 200 {
		t.Fatalf("short all-in must NOT change min-raise; got %d, want 200", tbl.MinRaise)
	}
	// Seat 0 already acted and must remain marked as acted (action NOT re-opened).
	if !tbl.ActedThisRound[0] {
		t.Fatalf("short all-in wrongly re-opened action for seat 0")
	}
	if tbl.CurrentBet != 400 {
		t.Fatalf("current bet after all-in = %d, want 400", tbl.CurrentBet)
	}
}

// Fix 2 (contrast): a FULL raise DOES re-open the betting — prior actors are
// cleared and must act again.
func TestFullRaiseReopensAction(t *testing.T) {
	tbl := preflopTable(10000)
	// Seat 0 raises to 300 (full). Now seat 1 re-raises to 500 (increment 200 =
	// the min-raise → a full raise). Seat 0 must be un-marked and act again.
	if err := tbl.ApplyAction(0, "raise", 300); err != nil {
		t.Fatalf("first raise rejected: %v", err)
	}
	tbl.ActionSeat = 1
	tbl.Seats[1].Stack = 9950 // deep enough for a full re-raise
	if err := tbl.ApplyAction(1, "raise", 500); err != nil {
		t.Fatalf("full re-raise to 500 rejected: %v", err)
	}
	if tbl.ActedThisRound[0] {
		t.Fatalf("a full re-raise must re-open action for seat 0 (expected un-marked)")
	}
	if !tbl.ActedThisRound[1] {
		t.Fatalf("the re-raiser (seat 1) should be marked as acted")
	}
	if tbl.MinRaise != 200 || tbl.CurrentBet != 500 {
		t.Fatalf("after full re-raise minRaise=%d currentBet=%d, want 200/500", tbl.MinRaise, tbl.CurrentBet)
	}
}

// FirstToShowSeat: the last aggressor shows first; a checked-down hand falls back
// to the first active seat left of the button.
func TestFirstToShowSeat(t *testing.T) {
	tbl := preflopTable(10000)
	tbl.LastAggressorSeat = 2
	if got := tbl.FirstToShowSeat(); got != 2 {
		t.Fatalf("with an aggressor, FirstToShowSeat=%d, want 2", got)
	}
	// Checked down: no aggressor → first active seat left of the button (seat 1).
	tbl.LastAggressorSeat = -1
	if got := tbl.FirstToShowSeat(); got != 1 {
		t.Fatalf("checked-down FirstToShowSeat=%d, want 1 (first left of button)", got)
	}
}
