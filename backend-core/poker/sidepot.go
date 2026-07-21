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
func AwardSidePots(t *Table) ([][]int, int64, error) {
	if winner, ok := t.UncontestedWinner(); ok {
		amount := t.Pot
		pokerAward(t, []int{winner}, amount)
		return [][]int{{winner}}, amount, nil
	}

	pots := BuildSidePots(t)
	allWinners := make([][]int, 0, len(pots))
	var total int64
	for _, pot := range pots {
		winners, err := winnersAmong(pot.Eligible, t.HoleCards, t.Board, t.Seats, t.IsOmaha())
		if err != nil {
			return nil, 0, err
		}
		pokerAward(t, winners, pot.Amount)
		allWinners = append(allWinners, winners)
		total += pot.Amount
	}
	t.Pot = 0
	return allWinners, total, nil
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
