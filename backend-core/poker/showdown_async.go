package poker

import (
	"context"
	"fmt"

	"github.com/smithdouglas404/poker-next-gen/backend-core/poker/enginemath"
)

// PotResolution is the payout plan for one side-pot layer after rs_poker evaluation.
type PotResolution struct {
	PotIndex int
	// BoardIndex identifies which run-it-twice board this resolution settles
	// against. It is 0 for the normal single-board path (unchanged behavior).
	BoardIndex int
	Amount     int64
	Winners    []int
	HandCats   map[int]string
}

// ShowdownPlan snapshots table state before async rs_poker calls.
type ShowdownPlan struct {
	HandNo            int
	MatchID           string
	Board             []Card
	DeckOrder         []string
	DeckCommitment    string
	DeckSeed          string
	HoleCards         map[string][]Card
	Variant           string
	Seats             [MaxSeats]*Seat
	Pots              []SidePot
	TotalPot          int64
	UncontestedWinner int // -1 when multiple players remain
	// Run-it-twice: when set, the remaining board is dealt RunCount times and each
	// pot layer is split across the boards. Only honored for a contested, all-in,
	// board-incomplete showdown; the normal path leaves RunItTwice false.
	RunItTwice bool
	RunCount   int
}

// ShowdownResult is delivered on the async resolution channel.
type ShowdownResult struct {
	Resolutions  []PotResolution
	WinnerGroups [][]int
	// Boards carries the N full boards used for a run-it-twice showdown (nil for a
	// single-board showdown) so the handler can persist/broadcast them.
	Boards [][]Card
	Err    error
}

// BuildShowdownPlan captures everything needed to resolve pots off the hot path.
func BuildShowdownPlan(t *Table, matchID string) ShowdownPlan {
	plan := ShowdownPlan{
		HandNo:         t.HandNo,
		MatchID:        matchID,
		Board:          append([]Card(nil), t.Board...),
		DeckOrder:      append([]string(nil), t.DeckOrder...),
		DeckCommitment: t.DeckCommitment,
		DeckSeed:       t.DeckSeed,
		HoleCards:      copyHoleCards(t.HoleCards),
		Variant:        t.Variant,
		TotalPot:  t.Pot,
		RunItTwice: t.RunItTwice,
		RunCount:   t.RunItTwiceBoards,
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

func copyHoleCards(src map[string][]Card) map[string][]Card {
	out := make(map[string][]Card, len(src))
	for k, v := range src {
		out[k] = append([]Card(nil), v...)
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

	if plan.RunItTwice && len(plan.Board) < 5 {
		return computeRunItTwice(plan)
	}

	resolutions := make([]PotResolution, 0, len(plan.Pots))
	winnerGroups := make([][]int, 0, len(plan.Pots))
	for i, pot := range plan.Pots {
		winners, err := winnersAmong(pot.Eligible, plan.HoleCards, plan.Board, plan.Seats, plan.Variant == VariantPLO)
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

// computeRunItTwice deals the remaining board N times (via engine-math) and
// splits every side-pot layer evenly across the boards, resolving winners per
// board. Each returned PotResolution pays one board's fraction of one pot layer,
// so the existing ApplyResolutions loop settles them without any special-casing.
// The pot fraction arithmetic is exact: base = amount/N with the amount%N
// remainder handed to the earliest boards, so the sum of fractions == the pot.
func computeRunItTwice(plan ShowdownPlan) ShowdownResult {
	n := plan.RunCount
	if n < 2 {
		n = 2
	}
	if n > 4 {
		n = 4
	}

	// Dead cards = every player's hole cards. The engine unions the board itself.
	dead := make([]string, 0, len(plan.HoleCards))
	for _, hole := range plan.HoleCards {
		if len(hole) > 0 {
			dead = append(dead, handCardString(hole, nil))
		}
	}
	fullBoards, err := enginemath.RunItTwice(boardString(plan.Board), dead, n)
	if err != nil {
		return ShowdownResult{Err: fmt.Errorf("run-it-twice deal: %w", err)}
	}
	boards := make([][]Card, 0, len(fullBoards))
	for _, b := range fullBoards {
		cards, err := ParseBoardString(b)
		if err != nil {
			return ShowdownResult{Err: fmt.Errorf("run-it-twice parse board %q: %w", b, err)}
		}
		boards = append(boards, cards)
	}
	nBoards := int64(len(boards))
	if nBoards == 0 {
		return ShowdownResult{Err: fmt.Errorf("run-it-twice: no boards dealt")}
	}

	resolutions := make([]PotResolution, 0, len(plan.Pots)*len(boards))
	winnerGroups := make([][]int, 0, len(plan.Pots)*len(boards))
	for i, pot := range plan.Pots {
		base := pot.Amount / nBoards
		rem := pot.Amount % nBoards
		for bi, board := range boards {
			frac := base
			if int64(bi) < rem {
				frac++
			}
			if frac <= 0 {
				continue
			}
			winners, err := winnersAmong(pot.Eligible, plan.HoleCards, board, plan.Seats, plan.Variant == VariantPLO)
			if err != nil {
				return ShowdownResult{Err: err}
			}
			handCats := map[int]string{}
			for _, seat := range winners {
				if cat, err := handCategoryForBoard(seat, plan, board); err == nil {
					handCats[seat] = cat
				}
			}
			resolutions = append(resolutions, PotResolution{
				PotIndex:   i,
				BoardIndex: bi,
				Amount:     frac,
				Winners:    winners,
				HandCats:   handCats,
			})
			winnerGroups = append(winnerGroups, winners)
		}
	}
	return ShowdownResult{Resolutions: resolutions, WinnerGroups: winnerGroups, Boards: boards}
}

func handCategoryForBoard(seat int, plan ShowdownPlan, board []Card) (string, error) {
	t := &Table{
		Board:     board,
		HoleCards: plan.HoleCards,
		Seats:     plan.Seats,
		Variant:   plan.Variant,
	}
	return HandCategory(seat, t)
}

func handCategoryFromPlan(seat int, plan ShowdownPlan) (string, error) {
	t := &Table{
		Board:     plan.Board,
		HoleCards: plan.HoleCards,
		Seats:     plan.Seats,
		Variant:   plan.Variant,
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
