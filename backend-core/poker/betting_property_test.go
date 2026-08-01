package poker

import (
	"math/rand"
	"testing"
)

// Chips are conserved: no betting action may create or destroy them, and no
// stack may go negative. Driven with pseudo-random legal actions over many
// hands so unusual all-in / short-raise sequences are exercised.
func TestBettingConservesChips(t *testing.T) {
	const (
		sb int64 = 25
		bb int64 = 50
	)
	for seed := int64(0); seed < 3000; seed++ {
		rng := rand.New(rand.NewSource(seed))
		tbl := propTable(rng, sb, bb)
		want := chipsInPlay(tbl)

		for steps := 0; steps < 400 && tbl.Street != StreetShowdown; steps++ {
			seat := tbl.ActionSeat
			if seat < 0 || tbl.Seats[seat] == nil {
				break
			}
			actions, toCall, minRaise, maxRaise := tbl.ValidActions(seat)
			if len(actions) == 0 {
				break
			}
			action := actions[rng.Intn(len(actions))]
			amount := int64(0)
			if action == "raise" {
				if maxRaise <= minRaise {
					amount = maxRaise
				} else {
					amount = minRaise + rng.Int63n(maxRaise-minRaise+1)
				}
			}
			if err := tbl.ApplyAction(seat, action, amount); err != nil {
				// A rejected action must not have moved any chips.
				if got := chipsInPlay(tbl); got != want {
					t.Fatalf("seed %d: rejected %s(%d) moved chips: %d != %d", seed, action, amount, got, want)
				}
				// Fall back to the always-legal fold so the hand progresses.
				if err := tbl.ApplyAction(seat, "fold", 0); err != nil {
					t.Fatalf("seed %d: fold rejected: %v", seed, err)
				}
			}
			if got := chipsInPlay(tbl); got != want {
				t.Fatalf("seed %d: %s(%d) by seat %d (to_call %d) changed chips in play: %d != %d",
					seed, action, amount, seat, toCall, got, want)
			}
			for i, s := range tbl.Seats {
				if s != nil && s.Stack < 0 {
					t.Fatalf("seed %d: seat %d stack went negative (%d) after %s(%d)", seed, i, s.Stack, action, amount)
				}
			}
			if _, ok := tbl.UncontestedWinner(); ok {
				break
			}
			tbl.AdvanceAction()
		}

		// Every chip that left a stack must be accounted for in the pot, and the
		// per-seat contributions must sum to it exactly (they drive the side pots).
		var contributed int64
		for _, s := range tbl.Seats {
			if s != nil {
				contributed += s.TotalContributed
			}
		}
		if contributed != tbl.Pot {
			t.Fatalf("seed %d: contributions %d != pot %d", seed, contributed, tbl.Pot)
		}

		// Settlement must cover the whole pot: every chip is either in a side pot
		// some live player can win, or an uncalled bet refunded to its owner.
		if _, uncontested := tbl.UncontestedWinner(); uncontested {
			continue
		}
		var settled int64
		for _, p := range BuildSidePots(tbl) {
			settled += p.Amount
		}
		for _, amount := range UncalledRefunds(tbl) {
			settled += amount
		}
		if settled != tbl.Pot {
			t.Fatalf("seed %d: side pots + refunds settle %d of a %d pot", seed, settled, tbl.Pot)
		}
	}
}

func propTable(rng *rand.Rand, sb, bb int64) *Table {
	tbl := NewTable()
	n := 2 + rng.Intn(5)
	for i := 0; i < n; i++ {
		// Mix deep stacks with stacks smaller than a blind so short all-ins,
		// dead blinds and un-callable bets all occur.
		tbl.Seats[i] = &Seat{Index: i, UserID: string(rune('a' + i)), Status: SeatSeated, Stack: 10 + rng.Int63n(4000)}
	}
	tbl.Deck = fullDeck()
	tbl.BigBlind = bb
	tbl.Street = StreetPreflop
	tbl.ButtonSeat = 0
	sbSeat := tbl.nextActiveSeat(tbl.ButtonSeat)
	bbSeat := tbl.nextActiveSeat(sbSeat)
	tbl.postBlind(sbSeat, sb, "SB")
	tbl.postBlind(bbSeat, bb, "BB")
	tbl.CurrentBet = bb
	tbl.MinRaise = bb
	tbl.ActionSeat = tbl.nextActiveSeat(bbSeat)
	return tbl
}

func fullDeck() []Card {
	deck := make([]Card, 0, 52)
	for suit := 0; suit < 4; suit++ {
		for rank := 2; rank <= 14; rank++ {
			deck = append(deck, Card{Rank: rank, Suit: suit})
		}
	}
	return deck
}

func chipsInPlay(t *Table) int64 {
	total := t.Pot
	for _, s := range t.Seats {
		if s != nil {
			total += s.Stack
		}
	}
	return total
}
