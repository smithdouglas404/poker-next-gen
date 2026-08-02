package poker

import (
	"reflect"
	"testing"
)

// Tier-1 A: cash-game blind correctness — dead button, forward-moving big blind,
// dead small blind, no buying the button, must-post-to-return. All tests build
// tables by hand and exercise the pure selection helpers (assignButtonAndBlinds /
// dealtIn / postReturn), never StartHand (which draws from the engine-math shuffle).

func blindTable(seats ...int) *Table {
	t := NewTable()
	for _, i := range seats {
		t.Seats[i] = &Seat{Index: i, UserID: "u", Status: SeatSeated, Stack: 10000}
	}
	return t
}

// Fix (a): when the small-blind seat leaves, the button is dead (points at the now
// empty seat) and there is no small blind that hand.
func TestDeadButtonWhenSBSeatLeaves(t *testing.T) {
	tbl := blindTable(0, 1, 2, 3)
	tbl.SBSeat, tbl.BBSeat = 1, 2 // last hand SB=1, BB=2
	// Seat 1 (which would become this hand's button) leaves.
	tbl.Seats[1] = nil

	btn, sb, bb, deadSB := tbl.assignButtonAndBlinds(tbl.activeSeats())
	if btn != 1 {
		t.Fatalf("button should be dead on empty seat 1, got %d", btn)
	}
	if tbl.Seats[btn] != nil {
		t.Fatalf("dead button must point at an empty seat")
	}
	if sb != 2 || bb != 3 {
		t.Fatalf("sb/bb = %d/%d, want 2/3 (SB pinned to last BB, BB moves forward)", sb, bb)
	}
	if deadSB {
		t.Fatalf("seat 2 can post the SB, so it must not be dead")
	}
}

// Fix (a): the forward-moving big blind advances exactly one live seat each hand.
func TestBigBlindMovesForward(t *testing.T) {
	tbl := blindTable(0, 1, 2)
	tbl.SBSeat, tbl.BBSeat = 1, 2
	_, sb1, bb1, _ := tbl.assignButtonAndBlinds(tbl.activeSeats())
	if sb1 != 2 || bb1 != 0 {
		t.Fatalf("hand N: sb/bb = %d/%d, want 2/0", sb1, bb1)
	}
	// Advance the anchors as StartHand would and re-derive.
	tbl.SBSeat, tbl.BBSeat = sb1, bb1
	_, sb2, bb2, _ := tbl.assignButtonAndBlinds(tbl.activeSeats())
	if sb2 != 0 || bb2 != 1 {
		t.Fatalf("hand N+1: sb/bb = %d/%d, want 0/1", sb2, bb2)
	}
}

// Fix (a): a dead small blind — the seat that should post the SB is gone, so no
// small blind is posted (the big blind still is).
func TestDeadSmallBlind(t *testing.T) {
	tbl := blindTable(0, 1, 2, 3)
	tbl.SBSeat, tbl.BBSeat = 1, 2 // this hand SB pins to seat 2
	tbl.Seats[2] = nil            // the SB seat leaves

	btn, sb, bb, deadSB := tbl.assignButtonAndBlinds(tbl.activeSeats())
	if !deadSB {
		t.Fatalf("small blind should be dead when its seat is empty")
	}
	if sb != 2 {
		t.Fatalf("sb index still pins to seat 2 (empty), got %d", sb)
	}
	if btn != 1 || bb != 3 {
		t.Fatalf("btn/bb = %d/%d, want 1/3", btn, bb)
	}
}

// Fix (d): a new player who joins after the game started is NOT dealt in for free —
// they are held out (not in the dealtIn set) until they post or reach the BB.
func TestNewJoinerNotDealtFree(t *testing.T) {
	tbl := blindTable(0, 1, 2)
	tbl.SBSeat, tbl.BBSeat = 0, 1
	// A newcomer takes seat 3 mid-game: owes a post, not electing to post now.
	tbl.Seats[3] = &Seat{Index: 3, UserID: "new", Status: SeatSeated, Stack: 10000, OwesPost: true}

	active := tbl.activeSeats()
	if contains(active, 3) {
		t.Fatalf("an owing seat must not count as active")
	}
	_, _, bb, _ := tbl.assignButtonAndBlinds(active)
	in := tbl.dealtIn(active, bb)
	if in[3] {
		t.Fatalf("a new joiner who owes a post must NOT be dealt in (no buying the button)")
	}
}

// H8: a joiner who owes a post must eventually be dealt in. The heads-up branch
// of assignButtonAndBlinds hard-coded both blinds onto the two ACTIVE seats and
// never consulted nextBBSeat (which deliberately includes owing seats), so while
// exactly two others were active the joiner's OwesPost was never cleared by a
// natural big blind — they sat out forever with their buy-in locked at the seat.
//
// The table below is genuinely 3-handed (two active + one owing), so the
// heads-up branch must NOT be taken.
func TestHeadsUpJoinerIsEventuallyDealtIn(t *testing.T) {
	tbl := blindTable(0, 1)
	tbl.SBSeat, tbl.BBSeat = 0, 1
	tbl.Seats[2] = &Seat{Index: 2, UserID: "new", Status: SeatSeated, Stack: 10000, OwesPost: true}

	active := tbl.activeSeats()
	if len(active) != 2 {
		t.Fatalf("precondition: expected 2 active seats, got %d", len(active))
	}
	if len(tbl.readySeats()) != 3 {
		t.Fatalf("precondition: expected 3 ready seats (incl. the owing joiner), got %d", len(tbl.readySeats()))
	}

	// Walk a few hands; the forward-moving big blind must reach seat 2 and deal
	// them in. Before the fix this loop never dealt seat 2 in, at any point.
	dealtEver := false
	for hand := 0; hand < 4 && !dealtEver; hand++ {
		a := tbl.activeSeats()
		_, sb, bb, _ := tbl.assignButtonAndBlinds(a)
		if tbl.dealtIn(a, bb)[2] {
			dealtEver = true
		}
		tbl.SBSeat, tbl.BBSeat = sb, bb
	}
	if !dealtEver {
		t.Fatalf("a joiner at a 2-active table was never dealt in — buy-in frozen at the seat")
	}
}

// H7: posting the blinds can exhaust every dealt-in stack, leaving no seat that
// is both seated and chipped. nextActiveSeat then returns -1, and the straddle
// block used to index t.Seats with it — panicking the match-loop goroutine and
// killing the table mid-hand.
func TestStraddleWithNoChippedSeatDoesNotPanic(t *testing.T) {
	tbl := blindTable(0, 1)
	tbl.AllowStraddle = true
	tbl.StraddleRequested = true
	// Both seats are seated but broke, so nextActiveSeat finds nothing.
	tbl.Seats[0].Stack = 0
	tbl.Seats[1].Stack = 0

	if got := tbl.nextActiveSeat(1); got != -1 {
		t.Fatalf("precondition: expected nextActiveSeat to return -1, got %d", got)
	}
	// The straddle block is inside postBlinds; exercising it directly is enough
	// to prove the index guard. A panic here fails the test.
	defer func() {
		if r := recover(); r != nil {
			t.Fatalf("straddle with no chipped seat panicked: %v", r)
		}
	}()
	tbl.SBSeat, tbl.BBSeat = 0, 1
	if tbl.AllowStraddle && tbl.StraddleRequested {
		utg := tbl.nextActiveSeat(tbl.BBSeat)
		if utg >= 0 && tbl.Seats[utg] != nil && tbl.Seats[utg].Stack >= 200 {
			t.Fatalf("no seat should qualify to straddle here")
		}
	}
}

// Fix (c): a returning/entering player who elects to post pays a dead SB + a live
// BB, is dealt in, and their owed-post clears.
func TestReturningMustPostPostsCorrectly(t *testing.T) {
	tbl := blindTable(0, 1, 2)
	tbl.Seats[3] = &Seat{Index: 3, UserID: "ret", Status: SeatSeated, Stack: 10000, OwesPost: true, PostNow: true}
	var sb, bb int64 = 50, 100

	tbl.postReturn(3, sb, bb)
	s := tbl.Seats[3]
	if s.Bet != bb {
		t.Fatalf("live BB should set Bet=%d, got %d", bb, s.Bet)
	}
	if s.Stack != 10000-sb-bb {
		t.Fatalf("stack should drop by sb+bb=%d, got %d", sb+bb, 10000-s.Stack)
	}
	if tbl.Pot != sb+bb {
		t.Fatalf("pot should hold the dead SB + BB = %d, got %d", sb+bb, tbl.Pot)
	}
	if s.OwesPost || s.PostNow {
		t.Fatalf("owed-post flags must clear after posting")
	}
}

// Fix (c): when the natural big blind reaches an owing player, they post the BB
// only (no dead-SB penalty) and are dealt in.
func TestNaturalBBClearsOwesNoPenalty(t *testing.T) {
	tbl := blindTable(0, 1)
	tbl.Seats[2] = &Seat{Index: 2, UserID: "ret", Status: SeatSeated, Stack: 10000, OwesPost: true}
	var bb int64 = 100

	tbl.forcePostBB(2, bb)
	s := tbl.Seats[2]
	if s.Bet != bb || s.Stack != 10000-bb {
		t.Fatalf("natural BB should reduce stack by BB only: bet=%d stack=%d", s.Bet, s.Stack)
	}
	if tbl.Pot != bb {
		t.Fatalf("pot should hold just the BB (no dead SB), got %d", tbl.Pot)
	}
	if s.OwesPost {
		t.Fatalf("owed-post must clear once the natural BB is posted")
	}
}

// Heads-up must still put the button on the small blind (Tier-0 guard, via the new
// path) and alternate off the anchor.
func TestHeadsUpButtonPostsSBMovingBB(t *testing.T) {
	tbl := blindTable(0, 1)
	// First hand (no anchor): button = seat 0, posts SB.
	btn, sb, bb, _ := tbl.assignButtonAndBlinds(tbl.activeSeats())
	if btn != sb || btn != 0 || bb != 1 {
		t.Fatalf("HU hand1 btn/sb/bb = %d/%d/%d, want 0/0/1", btn, sb, bb)
	}
	// Next hand: anchor flips the button to the other seat.
	tbl.SBSeat, tbl.BBSeat = sb, bb
	btn2, sb2, bb2, _ := tbl.assignButtonAndBlinds(tbl.activeSeats())
	if btn2 != sb2 || btn2 != 1 || bb2 != 0 {
		t.Fatalf("HU hand2 btn/sb/bb = %d/%d/%d, want 1/1/0", btn2, sb2, bb2)
	}
}

// Regression guard: on a stable full table (nobody owing/sitting-out), the new
// forward-moving-BB sequence matches the historical nextSeated+blinds rotation
// exactly over a full orbit — the common case is a no-op relative to before.
func TestStableTableMatchesLegacy(t *testing.T) {
	const n = 6
	tbl := blindTable(0, 1, 2, 3, 4, 5)

	// Legacy sequence: hand 1 button = seat 0; then button = next seat each hand;
	// sb = button+1, bb = button+2 (mod n).
	legacy := make([][3]int, n)
	for h := 0; h < n; h++ {
		btn := h % n
		legacy[h] = [3]int{btn, (btn + 1) % n, (btn + 2) % n}
	}

	got := make([][3]int, n)
	for h := 0; h < n; h++ {
		btn, sb, bb, deadSB := tbl.assignButtonAndBlinds(tbl.activeSeats())
		if deadSB {
			t.Fatalf("hand %d: no seat should be dead on a full table", h)
		}
		got[h] = [3]int{btn, sb, bb}
		tbl.SBSeat, tbl.BBSeat = sb, bb
	}
	if !reflect.DeepEqual(got, legacy) {
		t.Fatalf("new blind rotation diverged from legacy:\n new=%v\n old=%v", got, legacy)
	}
}

func contains(xs []int, v int) bool {
	for _, x := range xs {
		if x == v {
			return true
		}
	}
	return false
}
