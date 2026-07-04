package poker

import (
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

func compareSeatHands(seatA, seatB int, holeCards map[string][2]Card, community []Card, seats [MaxSeats]*Seat) int {
	if seats[seatA] == nil || seats[seatB] == nil {
		return 0
	}
	holeA := holeCards[seats[seatA].UserID]
	holeB := holeCards[seats[seatB].UserID]
	aStr := handCardString(holeA[:], community)
	bStr := handCardString(holeB[:], community)
	if enginemath.Available() {
		cmp, err := enginemath.CompareHands(aStr, bStr)
		if err == nil {
			return cmp
		}
	}
	a := BestHand(holeA[:], community)
	b := BestHand(holeB[:], community)
	return compareHands(a, b)
}

func winnersAmong(eligible []int, holeCards map[string][2]Card, community []Card, seats [MaxSeats]*Seat) []int {
	if len(eligible) == 0 {
		return nil
	}
	if enginemath.Available() && len(eligible) > 1 {
		holes := make([]string, len(eligible))
		board := ""
		for _, c := range community {
			board += c.Code()
		}
		for i, seat := range eligible {
			if seats[seat] == nil {
				continue
			}
			hole := holeCards[seats[seat].UserID]
			holes[i] = handCardString(hole[:], nil)
		}
		if winIdx, _, err := enginemath.ResolveShowdown(holes, board); err == nil && len(winIdx) > 0 {
			out := make([]int, 0, len(winIdx))
			for _, idx := range winIdx {
				if idx >= 0 && idx < len(eligible) {
					out = append(out, eligible[idx])
				}
			}
			if len(out) > 0 {
				sort.Ints(out)
				return out
			}
		}
	}
	winners := []int{eligible[0]}
	for _, seat := range eligible[1:] {
		cmp := compareSeatHands(seat, winners[0], holeCards, community, seats)
		if cmp > 0 {
			winners = []int{seat}
		} else if cmp == 0 {
			winners = append(winners, seat)
		}
	}
	sort.Ints(winners)
	return winners
}

// AwardSidePots resolves and pays each side pot using rs_poker when available.
func AwardSidePots(t *Table) ([][]int, int64) {
	if winner, ok := t.UncontestedWinner(); ok {
		amount := t.Pot
		pokerAward(t, []int{winner}, amount)
		return [][]int{{winner}}, amount
	}

	pots := BuildSidePots(t)
	allWinners := make([][]int, 0, len(pots))
	var total int64
	for _, pot := range pots {
		winners := winnersAmong(pot.Eligible, t.HoleCards, t.Board, t.Seats)
		pokerAward(t, winners, pot.Amount)
		allWinners = append(allWinners, winners)
		total += pot.Amount
	}
	t.Pot = 0
	return allWinners, total
}

func pokerAward(t *Table, winners []int, amount int64) {
	if len(winners) == 0 || amount <= 0 {
		return
	}
	share := amount / int64(len(winners))
	remainder := amount % int64(len(winners))
	for i, seat := range winners {
		if t.Seats[seat] == nil {
			continue
		}
		pay := share
		if int64(i) < remainder {
			pay++
		}
		t.Seats[seat].Stack += pay
	}
}

// HandCategory returns rs_poker category string for a seat at showdown.
func HandCategory(seat int, t *Table) string {
	if t.Seats[seat] == nil {
		return ""
	}
	hole := t.HoleCards[t.Seats[seat].UserID]
	s := handCardString(hole[:], t.Board)
	if enginemath.Available() {
		cat, err := enginemath.RankHand(s)
		if err == nil {
			return cat
		}
	}
	return BestHand(hole[:], t.Board).Category
}
