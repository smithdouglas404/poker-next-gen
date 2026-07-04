package poker

import (
	"context"
)

// PotResolution is the payout plan for one side-pot layer after rs_poker evaluation.
type PotResolution struct {
	PotIndex int
	Amount   int64
	Winners  []int
	HandCats map[int]string
}

// ShowdownPlan snapshots table state before async rs_poker calls.
type ShowdownPlan struct {
	HandNo            int
	MatchID           string
	Board             []Card
	DeckOrder         []string
	DeckCommitment    string
	HoleCards         map[string][2]Card
	Seats             [MaxSeats]*Seat
	Pots              []SidePot
	TotalPot          int64
	UncontestedWinner int // -1 when multiple players remain
}

// ShowdownResult is delivered on the async resolution channel.
type ShowdownResult struct {
	Resolutions  []PotResolution
	WinnerGroups [][]int
	Err          error
}

// BuildShowdownPlan captures everything needed to resolve pots off the hot path.
func BuildShowdownPlan(t *Table, matchID string) ShowdownPlan {
	plan := ShowdownPlan{
		HandNo:         t.HandNo,
		MatchID:        matchID,
		Board:          append([]Card(nil), t.Board...),
		DeckOrder:      append([]string(nil), t.DeckOrder...),
		DeckCommitment: t.DeckCommitment,
		HoleCards:      copyHoleCards(t.HoleCards),
		TotalPot:  t.Pot,
	}
	for i, s := range t.Seats {
		if s == nil {
			continue
		}
		seatCopy := *s
		plan.Seats[i] = &seatCopy
	}
	if winner, ok := t.UncontestedWinner(); ok {
		plan.UncontestedWinner = winner
		plan.Pots = []SidePot{{Amount: t.Pot, Eligible: []int{winner}}}
	} else {
		plan.Pots = BuildSidePots(t)
	}
	return plan
}

func copyHoleCards(src map[string][2]Card) map[string][2]Card {
	out := make(map[string][2]Card, len(src))
	for k, v := range src {
		out[k] = v
	}
	return out
}

// StartShowdownAsync resolves side pots in a goroutine (engine-math HTTP).
// The table must stay in PhaseResolvingSidePots until the result is applied.
func StartShowdownAsync(ctx context.Context, plan ShowdownPlan) <-chan ShowdownResult {
	ch := make(chan ShowdownResult, 1)
	go func() {
		ch <- computeShowdown(ctx, plan)
	}()
	return ch
}

func computeShowdown(_ context.Context, plan ShowdownPlan) ShowdownResult {
	if plan.UncontestedWinner >= 0 {
		return ShowdownResult{
			Resolutions: []PotResolution{{
				PotIndex: 0,
				Amount:   plan.TotalPot,
				Winners:  []int{plan.UncontestedWinner},
			}},
			WinnerGroups: [][]int{{plan.UncontestedWinner}},
		}
	}

	resolutions := make([]PotResolution, 0, len(plan.Pots))
	winnerGroups := make([][]int, 0, len(plan.Pots))
	for i, pot := range plan.Pots {
		winners, err := winnersAmong(pot.Eligible, plan.HoleCards, plan.Board, plan.Seats)
		if err != nil {
			return ShowdownResult{Err: err}
		}
		handCats := map[int]string{}
		for _, seat := range winners {
			if cat, err := handCategoryFromPlan(seat, plan); err == nil {
				handCats[seat] = cat
			}
		}
		resolutions = append(resolutions, PotResolution{
			PotIndex: i,
			Amount:   pot.Amount,
			Winners:  winners,
			HandCats: handCats,
		})
		winnerGroups = append(winnerGroups, winners)
	}
	return ShowdownResult{Resolutions: resolutions, WinnerGroups: winnerGroups}
}

func handCategoryFromPlan(seat int, plan ShowdownPlan) (string, error) {
	t := &Table{
		Board:     plan.Board,
		HoleCards: plan.HoleCards,
		Seats:     plan.Seats,
	}
	return HandCategory(seat, t)
}

// ApplyResolutions pays winners and clears the pot. Call from MatchLoop only.
func ApplyResolutions(t *Table, resolutions []PotResolution) ([][]int, int64) {
	groups := make([][]int, 0, len(resolutions))
	var total int64
	for _, r := range resolutions {
		pokerAward(t, r.Winners, r.Amount)
		groups = append(groups, r.Winners)
		total += r.Amount
	}
	t.Pot = 0
	return groups, total
}

// HandPhaseForTable maps match phase + street to client-facing phase string.
func HandPhaseForTable(t *Table, phase HandPhase) string {
	if phase == PhaseResolvingSidePots {
		return string(PhaseResolvingSidePots)
	}
	return string(t.Street)
}

// PlanSidePots exposes side-pot layering for audit events (sync, no network).
func PlanSidePots(t *Table) []SidePot {
	return BuildSidePots(t)
}
