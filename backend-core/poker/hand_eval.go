package poker

import (
	"sort"
)

type HandRank int

const (
	HighCard HandRank = iota
	OnePair
	TwoPair
	ThreeOfAKind
	Straight
	Flush
	FullHouse
	FourOfAKind
	StraightFlush
)

type evaluatedHand struct {
	Rank     HandRank
	Primary  []int
	Category string
}

func combinations(cards []Card, k int) [][]Card {
	if k == 0 {
		return [][]Card{{}}
	}
	if len(cards) < k {
		return nil
	}
	var out [][]Card
	for i := 0; i <= len(cards)-k; i++ {
		for _, rest := range combinations(cards[i+1:], k-1) {
			out = append(out, append([]Card{cards[i]}, rest...))
		}
	}
	return out
}

func evaluateFive(cards []Card) evaluatedHand {
	values := make([]int, len(cards))
	for i, c := range cards {
		values[i] = c.Rank
	}
	sort.Sort(sort.Reverse(sort.IntSlice(values)))

	counts := map[int]int{}
	for _, v := range values {
		counts[v]++
	}
	type pair struct {
		val   int
		count int
	}
	var groups []pair
	for v, n := range counts {
		groups = append(groups, pair{v, n})
	}
	sort.Slice(groups, func(i, j int) bool {
		if groups[i].count != groups[j].count {
			return groups[i].count > groups[j].count
		}
		return groups[i].val > groups[j].val
	})

	isFlush := true
	suit := cards[0].Suit
	for _, c := range cards[1:] {
		if c.Suit != suit {
			isFlush = false
			break
		}
	}

	sortedUnique := uniqueSorted(values)
	isStraight := false
	straightHigh := 0
	if len(sortedUnique) == 5 {
		if sortedUnique[0]-sortedUnique[4] == 4 {
			isStraight = true
			straightHigh = sortedUnique[0]
		}
		if !isStraight && sortedUnique[0] == 14 && sortedUnique[1] == 5 && sortedUnique[4] == 2 {
			isStraight = true
			straightHigh = 5
		}
	}

	if isStraight && isFlush {
		return evaluatedHand{Rank: StraightFlush, Primary: []int{straightHigh}, Category: "straight_flush"}
	}
	if groups[0].count == 4 {
		return evaluatedHand{Rank: FourOfAKind, Primary: []int{groups[0].val, groups[1].val}, Category: "four_of_a_kind"}
	}
	if groups[0].count == 3 && groups[1].count == 2 {
		return evaluatedHand{Rank: FullHouse, Primary: []int{groups[0].val, groups[1].val}, Category: "full_house"}
	}
	if isFlush {
		return evaluatedHand{Rank: Flush, Primary: values, Category: "flush"}
	}
	if isStraight {
		return evaluatedHand{Rank: Straight, Primary: []int{straightHigh}, Category: "straight"}
	}
	if groups[0].count == 3 {
		kickers := []int{}
		for _, g := range groups[1:] {
			kickers = append(kickers, g.val)
		}
		sort.Sort(sort.Reverse(sort.IntSlice(kickers)))
		return evaluatedHand{Rank: ThreeOfAKind, Primary: append([]int{groups[0].val}, kickers...), Category: "three_of_a_kind"}
	}
	if groups[0].count == 2 && groups[1].count == 2 {
		highPair, lowPair := groups[0].val, groups[1].val
		if lowPair > highPair {
			highPair, lowPair = lowPair, highPair
		}
		return evaluatedHand{Rank: TwoPair, Primary: []int{highPair, lowPair, groups[2].val}, Category: "two_pair"}
	}
	if groups[0].count == 2 {
		kickers := []int{}
		for _, g := range groups[1:] {
			kickers = append(kickers, g.val)
		}
		sort.Sort(sort.Reverse(sort.IntSlice(kickers)))
		return evaluatedHand{Rank: OnePair, Primary: append([]int{groups[0].val}, kickers...), Category: "one_pair"}
	}
	return evaluatedHand{Rank: HighCard, Primary: values, Category: "high_card"}
}

func uniqueSorted(values []int) []int {
	m := map[int]bool{}
	for _, v := range values {
		m[v] = true
	}
	out := make([]int, 0, len(m))
	for v := range m {
		out = append(out, v)
	}
	sort.Sort(sort.Reverse(sort.IntSlice(out)))
	return out
}

func compareHands(a, b evaluatedHand) int {
	if a.Rank != b.Rank {
		return int(a.Rank) - int(b.Rank)
	}
	for i := 0; i < len(a.Primary) && i < len(b.Primary); i++ {
		if a.Primary[i] != b.Primary[i] {
			return a.Primary[i] - b.Primary[i]
		}
	}
	return 0
}

func BestHand(hole []Card, community []Card) evaluatedHand {
	all := append(append([]Card{}, hole...), community...)
	best := evaluatedHand{Rank: HighCard, Primary: []int{0}}
	for _, combo := range combinations(all, 5) {
		ev := evaluateFive(combo)
		if compareHands(ev, best) > 0 {
			best = ev
		}
	}
	return best
}

func ResolveShowdown(holeCards map[string][2]Card, community []Card, eligible []int, seats [MaxSeats]*Seat) []int {
	if len(eligible) == 0 {
		return nil
	}
	bestBySeat := map[int]evaluatedHand{}
	for _, seat := range eligible {
		if seats[seat] == nil {
			continue
		}
		userID := seats[seat].UserID
		hole, ok := holeCards[userID]
		if !ok {
			continue
		}
		bestBySeat[seat] = BestHand(hole[:], community)
	}
	if len(bestBySeat) == 0 {
		return eligible[:1]
	}
	winners := []int{}
	var top evaluatedHand
	first := true
	for seat, ev := range bestBySeat {
		if first {
			top = ev
			winners = []int{seat}
			first = false
			continue
		}
		cmp := compareHands(ev, top)
		if cmp > 0 {
			top = ev
			winners = []int{seat}
		} else if cmp == 0 {
			winners = append(winners, seat)
		}
	}
	sort.Ints(winners)
	return winners
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

func AwardPot(t *Table, winners []int) {
	if len(winners) == 0 || t.Pot == 0 {
		return
	}
	share := t.Pot / int64(len(winners))
	remainder := t.Pot % int64(len(winners))
	for i, seat := range winners {
		if t.Seats[seat] == nil {
			continue
		}
		amount := share
		if int64(i) < remainder {
			amount++
		}
		t.Seats[seat].Stack += amount
	}
	t.Pot = 0
}
