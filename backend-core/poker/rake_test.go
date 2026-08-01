package poker

import "testing"

func rakeTable(stacks map[int]int64) *Table {
	t := NewTable()
	for i, s := range stacks {
		t.Seats[i] = &Seat{Index: i, UserID: "u", Status: SeatSeated, Stack: s}
	}
	return t
}

func totalStacks(t *Table) int64 {
	var sum int64
	for _, s := range t.Seats {
		if s != nil {
			sum += s.Stack
		}
	}
	return sum
}

func TestRakeIsTakenProportionally(t *testing.T) {
	tbl := rakeTable(map[int]int64{0: 600, 1: 400})
	res := []PotResolution{
		{Amount: 600, Winners: []int{0}},
		{Amount: 400, Winners: []int{1}},
	}
	DeductRakeFromWinners(tbl, res, 100)

	if tbl.Seats[0].Stack != 540 || tbl.Seats[1].Stack != 360 {
		t.Fatalf("rake should split 60/40, got seat0=%d seat1=%d", tbl.Seats[0].Stack, tbl.Seats[1].Stack)
	}
}

// The rounding remainder is taken from the largest winner, and when that seat
// cannot cover it the rest comes from the next-largest — the whole rake is
// always collected as long as the winners hold enough chips.
func TestRakeRemainderSpillsToNextWinner(t *testing.T) {
	// Seat 0 wins nearly the whole pot but is already at zero chips, so its
	// proportional share (98) is capped away and almost the entire rake falls
	// through to the remainder pass — more than any single remaining winner
	// can cover.
	tbl := rakeTable(map[int]int64{0: 0, 1: 60, 2: 60})
	res := []PotResolution{
		{Amount: 1000, Winners: []int{0}},
		{Amount: 10, Winners: []int{1}},
		{Amount: 10, Winners: []int{2}},
	}
	DeductRakeFromWinners(tbl, res, 100)

	if got := totalStacks(tbl); got != 20 {
		t.Fatalf("full 100-chip rake should be collected from the 120 chips on the table, %d left", got)
	}
}

func TestRakeNeverDrivesStackNegative(t *testing.T) {
	tbl := rakeTable(map[int]int64{0: 30, 1: 10})
	res := []PotResolution{
		{Amount: 100, Winners: []int{0}},
		{Amount: 100, Winners: []int{1}},
	}
	// Rake exceeds everything the winners hold: take it all, stop at zero.
	DeductRakeFromWinners(tbl, res, 500)

	for _, i := range []int{0, 1} {
		if tbl.Seats[i].Stack != 0 {
			t.Fatalf("seat %d should be emptied, got %d", i, tbl.Seats[i].Stack)
		}
	}
}

func TestRakeIsNoOpWhenNothingWasWon(t *testing.T) {
	tbl := rakeTable(map[int]int64{0: 100})
	DeductRakeFromWinners(tbl, []PotResolution{{Amount: 0, Winners: []int{0}}}, 50)

	if tbl.Seats[0].Stack != 100 {
		t.Fatalf("no winnings means no rake, got %d", tbl.Seats[0].Stack)
	}
}
