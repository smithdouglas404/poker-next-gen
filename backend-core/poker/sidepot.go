package poker

import (
	"fmt"
	"sort"
	"strings"

	"github.com/smithdouglas404/poker-next-gen/backend-core/poker/enginemath"
)

// SidePot is one layer of a multi-way pot (main + side pots).
type SidePot struct {
	Amount   int64
	Eligible []int
}

// BuildSidePots splits the current hand pot into side pots by contribution level.
func BuildSidePots(t *Table) []SidePot {
	type entry struct {
		seat   int
		total  int64
		folded bool
	}
	var entries []entry
	for i, s := range t.Seats {
		if s == nil || s.TotalContributed <= 0 {
			continue
		}
		entries = append(entries, entry{seat: i, total: s.TotalContributed, folded: s.Status == SeatFolded})
	}
	if len(entries) == 0 {
		if t.Pot > 0 {
			eligible := EligibleShowdownSeats(t)
			return []SidePot{{Amount: t.Pot, Eligible: eligible}}
		}
		return nil
	}

	sort.Slice(entries, func(i, j int) bool { return entries[i].total < entries[j].total })

	var pots []SidePot
	remaining := append([]entry{}, entries...)
	for len(remaining) > 0 {
		minAmt := remaining[0].total
		layer := minAmt * int64(len(remaining))
		var eligible []int
		for _, e := range remaining {
			if !e.folded {
				eligible = append(eligible, e.seat)
			}
		}
		if layer > 0 && len(eligible) > 0 {
			pots = append(pots, SidePot{Amount: layer, Eligible: eligible})
		}
		var next []entry
		for _, e := range remaining {
			e.total -= minAmt
			if e.total > 0 {
				next = append(next, e)
			}
		}
		remaining = next
	}
	return pots
}

func handCardString(hole []Card, community []Card) string {
	var b strings.Builder
	for _, c := range hole {
		b.WriteString(c.Code())
	}
	for _, c := range community {
		b.WriteString(c.Code())
	}
	return b.String()
}

func boardString(community []Card) string {
	var b strings.Builder
	for _, c := range community {
		b.WriteString(c.Code())
	}
	return b.String()
}


func winnersAmong(eligible []int, holeCards map[string][]Card, community []Card, seats [MaxSeats]*Seat, omaha bool) ([]int, error) {
	if len(eligible) == 0 {
		return nil, nil
	}
	if len(eligible) == 1 {
		return eligible, nil
	}

	holes := make([]string, len(eligible))
	for i, seat := range eligible {
		if seats[seat] == nil {
			return nil, fmt.Errorf("missing seat %d for showdown", seat)
		}
		hole := holeCards[seats[seat].UserID]
		holes[i] = handCardString(hole, nil)
	}
	var winIdx []int
	var err error
	if omaha {
		winIdx, _, err = enginemath.ResolveOmahaShowdown(holes, boardString(community))
	} else {
		winIdx, _, err = enginemath.ResolveShowdown(holes, boardString(community))
	}
	if err != nil {
		return nil, fmt.Errorf("rs_poker showdown: %w", err)
	}
	if len(winIdx) == 0 {
		return nil, fmt.Errorf("rs_poker showdown: no winners")
	}
	out := make([]int, 0, len(winIdx))
	for _, idx := range winIdx {
		if idx < 0 || idx >= len(eligible) {
			return nil, fmt.Errorf("rs_poker showdown: invalid winner index %d", idx)
		}
		out = append(out, eligible[idx])
	}
	sort.Ints(out)
	return out, nil
}

// AwardSidePots resolves and pays each side pot via rs_poker (engine-math only).
//
// This is the SYNCHRONOUS path (no async snapshot window), so a vanished winner
// seat is not expected here — but pokerAward reports one either way, and
// dropping that report would reintroduce the silent chip destruction it exists
// to surface. Orphaned shares are returned for the caller to handle.
func AwardSidePots(t *Table) ([][]int, int64, []OrphanedPayout, error) {
	if winner, ok := t.UncontestedWinner(); ok {
		amount := t.Pot
		orphaned := pokerAward(t, []int{winner}, amount)
		return [][]int{{winner}}, amount, orphaned, nil
	}

	pots := BuildSidePots(t)
	allWinners := make([][]int, 0, len(pots))
	var total int64
	var orphaned []OrphanedPayout
	for _, pot := range pots {
		winners, err := winnersAmong(pot.Eligible, t.HoleCards, t.Board, t.Seats, t.IsOmaha())
		if err != nil {
			return nil, 0, nil, err
		}
		orphaned = append(orphaned, pokerAward(t, winners, pot.Amount)...)
		allWinners = append(allWinners, winners)
		total += pot.Amount
	}
	t.Pot = 0
	return allWinners, total, orphaned, nil
}

// OrphanedPayout is a pot share that could not be paid because the winning seat
// no longer exists on the live table by the time the award is applied.
//
// This is possible because showdown resolution is asynchronous: ShowdownPlan
// freezes a snapshot for the engine-math round-trip (up to the 2s client
// timeout), and the live table can mutate in that window — a stand-up, a kick,
// or a tournament rebalance can empty a seat that the frozen plan named as a
// winner.
//
// It is deliberately reported rather than swallowed. The chips are real money;
// silently dropping them destroyed value with no record that anyone was owed
// anything. The poker package has no database access by design, so it cannot
// credit the departed player itself — it hands the debt up to the caller, which
// does. This mirrors releaseBuyIn's existing philosophy in the match handler:
// where there is no natural retry, logging loudly is what makes a loss findable
// and compensable instead of just gone.
type OrphanedPayout struct {
	Seat   int
	Amount int64
}

// pokerAward pays `amount` to `winners`, returning any shares that could not be
// paid because the seat had vanished (see OrphanedPayout).
func pokerAward(t *Table, winners []int, amount int64) []OrphanedPayout {
	if len(winners) == 0 || amount <= 0 {
		return nil
	}
	// Odd-chip rule (TDA Rule 25): an indivisible remainder goes to the first
	// winning seat clockwise from the button (first seat left of the button),
	// not the lowest seat index. winners is sorted ascending, so rotate it to
	// begin at the first winner past the button (wrapping) before distributing.
	order := oddChipOrder(winners, t.ButtonSeat)
	share := amount / int64(len(order))
	remainder := amount % int64(len(order))
	var orphaned []OrphanedPayout
	for i, seat := range order {
		pay := share
		if int64(i) < remainder {
			pay++
		}
		if seat < 0 || seat >= len(t.Seats) || t.Seats[seat] == nil {
			if pay > 0 {
				orphaned = append(orphaned, OrphanedPayout{Seat: seat, Amount: pay})
			}
			continue
		}
		t.Seats[seat].Stack += pay
	}
	return orphaned
}

// oddChipOrder returns winners rotated so the first entry is the first winner
// clockwise from the button (the seat left of the button gets the odd chip). The
// input is assumed ascending by seat index; the output preserves clockwise order
// starting just past the button. A single winner (the common case) is returned
// unchanged, so a non-split pot is byte-for-byte identical to before.
func oddChipOrder(winners []int, button int) []int {
	if len(winners) < 2 {
		return winners
	}
	start := 0
	for i, seat := range winners {
		if seat > button {
			start = i
			break
		}
	}
	// If no winner is past the button, all are at/before it → wrap to winners[0].
	out := make([]int, 0, len(winners))
	out = append(out, winners[start:]...)
	out = append(out, winners[:start]...)
	return out
}

// HandCategory returns rs_poker category string for a seat at showdown.
func HandCategory(seat int, t *Table) (string, error) {
	if t.Seats[seat] == nil {
		return "", fmt.Errorf("empty seat %d", seat)
	}
	hole := t.HoleCards[t.Seats[seat].UserID]
	var cat string
	var err error
	if t.IsOmaha() {
		cat, err = enginemath.RankOmaha(handCardString(hole, nil), boardString(t.Board))
	} else {
		cat, err = enginemath.RankHand(handCardString(hole, t.Board))
	}
	if err != nil {
		return "", fmt.Errorf("rs_poker rank: %w", err)
	}
	return cat, nil
}

func EligibleShowdownSeats(t *Table) []int {
	out := []int{}
	for i, s := range t.Seats {
		if s != nil && (s.Status == SeatSeated || s.Status == SeatAllIn) {
			out = append(out, i)
		}
	}
	return out
}
