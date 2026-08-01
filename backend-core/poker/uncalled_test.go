package poker

import "testing"

// An uncalled bet whose contributors all folded belongs to nobody at showdown:
// BuildSidePots has no eligible seat for that rung and drops it. Those chips
// must be returned to the players who put them in, not destroyed with the pot.
func TestUncalledChipsAreRefundedNotDestroyed(t *testing.T) {
	tbl := NewTable()
	// Seat 0 bet 500 and folded to a re-raise; seats 1 and 2 are all-in for 200
	// each, so 300 of seat 0's chips were never called by anyone still live.
	tbl.Seats[0] = &Seat{Index: 0, UserID: "a", Status: SeatFolded, Stack: 0, TotalContributed: 500}
	tbl.Seats[1] = &Seat{Index: 1, UserID: "b", Status: SeatAllIn, Stack: 0, TotalContributed: 200}
	tbl.Seats[2] = &Seat{Index: 2, UserID: "c", Status: SeatAllIn, Stack: 0, TotalContributed: 200}
	tbl.Pot = 900

	var layered int64
	for _, p := range BuildSidePots(tbl) {
		layered += p.Amount
	}
	if layered != 600 {
		t.Fatalf("side pots cover %d, want the 600 chips a live player can win", layered)
	}

	ApplyResolutions(tbl, []PotResolution{{Amount: 600, Winners: []int{1}}})

	if got := tbl.Seats[0].Stack; got != 300 {
		t.Fatalf("seat 0 should get its 300 uncalled chips back, has %d", got)
	}
	if got := chipsInPlay(tbl); got != 900 {
		t.Fatalf("chips in play = %d, want the full 900-chip pot settled", got)
	}
}

// A hand that ends with everyone folding is uncontested: the last player
// standing takes the whole pot, including their own uncalled bet, so nothing is
// refunded separately.
func TestUncontestedHandRefundsNothing(t *testing.T) {
	tbl := NewTable()
	tbl.Seats[0] = &Seat{Index: 0, UserID: "a", Status: SeatSeated, Stack: 0, TotalContributed: 500}
	tbl.Seats[1] = &Seat{Index: 1, UserID: "b", Status: SeatFolded, Stack: 0, TotalContributed: 200}
	tbl.Pot = 700

	if refunds := UncalledRefunds(tbl); refunds != nil {
		t.Fatalf("uncontested hand must not refund, got %v", refunds)
	}
}
