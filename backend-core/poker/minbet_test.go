package poker

import "testing"

// The minimum bet on every post-flop street is one big blind. It used to be
// derived from MinRaise (the last full-raise increment), which advanceStreet
// zeroes, so post-flop tables fell back to a hard-coded 200 regardless of the
// stakes they were actually playing.
func minBetTable(bb int64) *Table {
	t := NewTable()
	for i := 0; i < 3; i++ {
		t.Seats[i] = &Seat{Index: i, UserID: "u", Status: SeatSeated, Stack: 100_000}
	}
	t.Deck = []Card{{Rank: 2, Suit: 0}, {Rank: 3, Suit: 0}, {Rank: 4, Suit: 0}, {Rank: 5, Suit: 0}, {Rank: 6, Suit: 0}}
	t.BigBlind = bb
	t.CurrentBet = bb
	t.MinRaise = bb
	t.Street = StreetPreflop
	return t
}

func TestPostFlopMinimumBetIsOneBigBlind(t *testing.T) {
	const bb int64 = 1000
	tbl := minBetTable(bb)
	tbl.advanceStreet()

	if tbl.Street != StreetFlop {
		t.Fatalf("street = %s, want flop", tbl.Street)
	}
	_, _, minRaise, _ := tbl.ValidActions(tbl.ActionSeat)
	if minRaise != bb {
		t.Fatalf("post-flop minimum bet = %d, want one big blind (%d)", minRaise, bb)
	}

	if err := tbl.ApplyAction(tbl.ActionSeat, "raise", 200); err == nil {
		t.Fatalf("a 200-chip bet is below the %d big blind and must be rejected", bb)
	}
	if err := tbl.ApplyAction(tbl.ActionSeat, "raise", bb); err != nil {
		t.Fatalf("a one-big-blind bet is legal: %v", err)
	}
}

// A raise still has to beat the last full-raise increment, not just the blind.
func TestPostFlopMinimumRaiseTracksLastIncrement(t *testing.T) {
	const bb int64 = 1000
	tbl := minBetTable(bb)
	tbl.advanceStreet()

	first := tbl.ActionSeat
	if err := tbl.ApplyAction(first, "raise", 4000); err != nil {
		t.Fatalf("open bet: %v", err)
	}
	next := tbl.nextActiveSeat(first)
	tbl.ActionSeat = next
	if err := tbl.ApplyAction(next, "raise", 5000); err == nil {
		t.Fatalf("raise to 5000 is a 1000 increment against a 4000 bet and must be rejected")
	}
	if err := tbl.ApplyAction(next, "raise", 8000); err != nil {
		t.Fatalf("raise to 8000 is a full increment: %v", err)
	}
}
