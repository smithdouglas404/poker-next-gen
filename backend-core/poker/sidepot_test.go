package poker

import "testing"

// Tier-1 D1: odd chips from a split pot go to the first winning seat clockwise
// from the button (TDA Rule 25), not the lowest seat index.

func awardTable(button int, seatIdx ...int) *Table {
	t := NewTable()
	t.ButtonSeat = button
	for _, i := range seatIdx {
		t.Seats[i] = &Seat{Index: i, UserID: "u", Status: SeatSeated, Stack: 0}
	}
	return t
}

func TestOddChipGoesToFirstSeatLeftOfButton(t *testing.T) {
	// Button on seat 0, winners 0/2/4 split 10 → 3 each + 1 odd. The odd chip
	// must land on seat 2 (first winner left of the button), NOT seat 0.
	tbl := awardTable(0, 0, 2, 4)
	pokerAward(tbl, []int{0, 2, 4}, 10)
	if tbl.Seats[2].Stack != 4 {
		t.Fatalf("odd chip should go to seat 2 (first left of button), got seat2=%d", tbl.Seats[2].Stack)
	}
	if tbl.Seats[0].Stack != 3 || tbl.Seats[4].Stack != 3 {
		t.Fatalf("non-odd winners should get the base share 3, got seat0=%d seat4=%d",
			tbl.Seats[0].Stack, tbl.Seats[4].Stack)
	}
	if tbl.Seats[0].Stack+tbl.Seats[2].Stack+tbl.Seats[4].Stack != 10 {
		t.Fatalf("pot must be fully distributed")
	}
}

func TestOddChipWrapsPastHighestSeat(t *testing.T) {
	// Button on seat 5, winners 0/1/2. No winner is past the button, so the odd
	// chip wraps to seat 0 (first clockwise from seat 5).
	tbl := awardTable(5, 0, 1, 2)
	pokerAward(tbl, []int{0, 1, 2}, 10)
	if tbl.Seats[0].Stack != 4 {
		t.Fatalf("odd chip should wrap to seat 0, got seat0=%d", tbl.Seats[0].Stack)
	}
	if tbl.Seats[1].Stack != 3 || tbl.Seats[2].Stack != 3 {
		t.Fatalf("other winners should get 3, got seat1=%d seat2=%d", tbl.Seats[1].Stack, tbl.Seats[2].Stack)
	}
}

func TestOddChipMidTableButton(t *testing.T) {
	// Button on seat 2, winners 0/1/3 → odd chip to seat 3 (first past the button).
	tbl := awardTable(2, 0, 1, 3)
	pokerAward(tbl, []int{0, 1, 3}, 7) // share 2, remainder 1
	if tbl.Seats[3].Stack != 3 {
		t.Fatalf("odd chip should go to seat 3, got seat3=%d", tbl.Seats[3].Stack)
	}
	if tbl.Seats[0].Stack != 2 || tbl.Seats[1].Stack != 2 {
		t.Fatalf("other winners should get 2, got seat0=%d seat1=%d", tbl.Seats[0].Stack, tbl.Seats[1].Stack)
	}
}

func TestSingleWinnerUnchanged(t *testing.T) {
	// The common case (one winner takes the whole pot) is byte-for-byte unchanged.
	tbl := awardTable(0, 2)
	pokerAward(tbl, []int{2}, 137)
	if tbl.Seats[2].Stack != 137 {
		t.Fatalf("single winner should take the whole pot, got %d", tbl.Seats[2].Stack)
	}
}

func TestEvenSplitNoRemainder(t *testing.T) {
	// Exact split: no odd chip, order is irrelevant, both get the same.
	tbl := awardTable(3, 0, 1)
	pokerAward(tbl, []int{0, 1}, 10)
	if tbl.Seats[0].Stack != 5 || tbl.Seats[1].Stack != 5 {
		t.Fatalf("even split should give 5 each, got seat0=%d seat1=%d", tbl.Seats[0].Stack, tbl.Seats[1].Stack)
	}
}
