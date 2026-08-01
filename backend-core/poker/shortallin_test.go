package poker

import "testing"

// A stack too short to complete the call still has a legal all-in: it puts its
// last chips in as a call for less. The engine used to reject that shove with
// "raise too small", so a short stack facing a bet could only fold or send a
// plain call — an all-in button that did nothing.
func TestAllInForLessThanTheCallIsACall(t *testing.T) {
	tbl := NewTable()
	tbl.Seats[0] = &Seat{Index: 0, UserID: "big", Status: SeatSeated, Stack: 10_000}
	tbl.Seats[1] = &Seat{Index: 1, UserID: "short", Status: SeatSeated, Stack: 300}
	tbl.BigBlind = 200
	tbl.MinRaise = 200
	tbl.Street = StreetFlop

	tbl.ActionSeat = 0
	if err := tbl.ApplyAction(0, "raise", 1000); err != nil {
		t.Fatalf("open bet: %v", err)
	}
	tbl.ActionSeat = 1
	if err := tbl.ApplyAction(1, "all_in", 0); err != nil {
		t.Fatalf("short all-in must be legal: %v", err)
	}

	short := tbl.Seats[1]
	if short.Stack != 0 || short.Bet != 300 || short.Status != SeatAllIn {
		t.Fatalf("short seat = stack %d bet %d status %s, want 0/300/all_in",
			short.Stack, short.Bet, short.Status)
	}
	if tbl.CurrentBet != 1000 {
		t.Fatalf("current bet = %d, want 1000 (a call for less does not raise)", tbl.CurrentBet)
	}
	if tbl.MinRaise != 1000 {
		t.Fatalf("min raise = %d, want the opening bet's increment (a call for less does not reopen betting)", tbl.MinRaise)
	}
	if tbl.Pot != 1300 {
		t.Fatalf("pot = %d, want 1300", tbl.Pot)
	}
}

// The advertised raise range must never be inverted: a seat that cannot cover
// the minimum raise can only shove, so its minimum equals its maximum.
func TestValidActionsMinimumRaiseNeverExceedsMaximum(t *testing.T) {
	tbl := NewTable()
	tbl.Seats[0] = &Seat{Index: 0, UserID: "big", Status: SeatSeated, Stack: 10_000}
	tbl.Seats[1] = &Seat{Index: 1, UserID: "short", Status: SeatSeated, Stack: 1_200}
	tbl.BigBlind = 200
	tbl.MinRaise = 200
	tbl.Street = StreetFlop

	tbl.ActionSeat = 0
	if err := tbl.ApplyAction(0, "raise", 1000); err != nil {
		t.Fatalf("open bet: %v", err)
	}
	_, _, minRaise, maxRaise := tbl.ValidActions(1)
	if minRaise > maxRaise {
		t.Fatalf("min raise %d exceeds max raise %d", minRaise, maxRaise)
	}
	if maxRaise != 1_200 {
		t.Fatalf("max raise = %d, want the short stack's shove (1200)", maxRaise)
	}
}
