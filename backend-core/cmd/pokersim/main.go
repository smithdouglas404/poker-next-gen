// Command pokersim drives the REAL poker engine (backend-core/poker) with the
// REAL bot brain (backend-core/bot) against the REAL rs_poker evaluator
// (engine-math sidecar) — the exact shuffle → deal → bet → showdown → payout
// pipeline the Nakama match handler runs in production. It seats 8 players with
// $300 each and plays Texas Hold'em for a simulated 30 minutes, then prints a
// results report.
//
// Nothing here is mocked: the deck is shuffled by rs_poker, hand strength is
// evaluated by rs_poker, and every betting decision flows through the same
// ValidActions → bot.Decide → ApplyAction → AdvanceAction loop as driveBots().
package main

import (
	"fmt"
	"math/rand"
	"os"
	"sort"
	"strings"

	"github.com/smithdouglas404/poker-next-gen/backend-core/bot"
	"github.com/smithdouglas404/poker-next-gen/backend-core/poker"
)

// ── configuration ────────────────────────────────────────────────────────────
const (
	numPlayers   = 8
	buyInCents   = 30_000 // $300.00 wallet, fully on the table
	smallBlind   = 100    // $1
	bigBlind     = 200    // $2
	simSeconds   = 30 * 60 // 30 minutes of modeled play
	rakeBps      = 500    // 5.0% club rake
	rakeCapCents = 300    // $3.00 cap
)

// modeled seconds of wall-clock per game event (online pace, bots act briskly)
const (
	secPerAction   = 3.0 // a player tanking + clicking
	secPerStreet   = 2.0 // dealing the next street
	secPerShowdown = 4.0 // reveal + ship pot
	secBetweenHands = 3.0 // shuffle + post blinds
)

type playerStat struct {
	seat        int
	name        string
	start       int64
	handsDealt  int
	handsWon    int
	vpip        int // hands they voluntarily put money in preflop
	showdowns   int
	allIns      int
	bustedHand  int // hand number they felted, 0 if survived
}

func money(c int64) string {
	neg := c < 0
	if neg {
		c = -c
	}
	s := fmt.Sprintf("$%d.%02d", c/100, c%100)
	if neg {
		return "-" + s
	}
	return s
}

func boardCodes(board []poker.Card) string {
	var b strings.Builder
	for _, c := range board {
		b.WriteString(c.Code())
	}
	return b.String()
}

func main() {
	if os.Getenv("ENGINE_MATH_URL") == "" {
		fmt.Fprintln(os.Stderr, "ENGINE_MATH_URL not set — need the rs_poker sidecar")
		os.Exit(1)
	}
	rng := rand.New(rand.NewSource(42)) // deterministic run

	t := poker.NewTable()
	t.SetSeatCap(numPlayers)
	stats := make([]*playerStat, numPlayers)
	names := []string{"Ivy", "Nova", "Rex", "Zara", "Kai", "Luna", "Dex", "Mira"}
	for i := 0; i < numPlayers; i++ {
		if err := t.SitDownBot(i, fmt.Sprintf("bot-%d", i), names[i], buyInCents); err != nil {
			fmt.Fprintln(os.Stderr, "seat error:", err)
			os.Exit(1)
		}
		stats[i] = &playerStat{seat: i, name: names[i], start: buyInCents}
	}

	// verify the sidecar is actually reachable by dealing one probe hand's deck
	if _, _, _, _, err := poker.NewDeck(); err != nil {
		fmt.Fprintln(os.Stderr, "engine-math not reachable:", err)
		os.Exit(1)
	}

	var (
		elapsed     float64
		handsPlayed int
		totalRake   int64
		biggestPot  int64
		showdowns   int
		foldWins    int
	)

	for elapsed < simSeconds {
		// need at least two players with chips
		live := 0
		for i := 0; i < numPlayers; i++ {
			if t.Seats[i] != nil && t.Seats[i].Stack > 0 {
				live++
			}
		}
		if live < 2 {
			break
		}

		if err := t.StartHand(smallBlind, bigBlind); err != nil {
			fmt.Fprintln(os.Stderr, "StartHand:", err)
			break
		}
		if t.Street == poker.StreetWaiting {
			break
		}
		handsPlayed++
		elapsed += secBetweenHands

		// stacks before the hand, to compute deltas / winnings after payout
		before := map[int]int64{}
		vpipThisHand := map[int]bool{}
		for i := 0; i < numPlayers; i++ {
			if s := t.Seats[i]; s != nil {
				before[i] = s.Stack
				stats[i].handsDealt++
			}
		}

		// ── betting loop — mirrors driveBots() exactly ──────────────────────
		guard := 0
		for guard < poker.MaxSeats*40 {
			guard++
			seatIdx := t.ActionSeat
			if seatIdx < 0 {
				if t.AdvanceAction() {
					break
				}
				continue
			}
			seat := t.Seats[seatIdx]
			if seat == nil || seat.Status != poker.SeatSeated {
				if t.AdvanceAction() {
					break
				}
				continue
			}

			_, toCall, minRaise, maxRaise := t.ValidActions(seatIdx)
			hole := t.HoleCards[seat.UserID]
			action, amount := "check", int64(0)
			if toCall > 0 {
				action = "fold"
			}
			if len(hole) >= 2 {
				holeStr := hole[0].Code() + hole[1].Code()
				if d, err := bot.Decide(holeStr, boardCodes(t.Board), toCall, t.Pot, minRaise, maxRaise, seat.Stack, rng); err == nil {
					action, amount = d.Action, d.Amount
				}
			}

			if err := t.ApplyAction(seatIdx, action, amount); err != nil {
				fallback := "fold"
				if toCall == 0 {
					fallback = "check"
				}
				if err2 := t.ApplyAction(seatIdx, fallback, 0); err2 != nil {
					break
				}
				action = fallback
			}
			elapsed += secPerAction

			// voluntary preflop money in = VPIP
			if t.Street == poker.StreetPreflop && (action == "call" || action == "raise" || action == "all_in") {
				vpipThisHand[seatIdx] = true
			}
			if action == "all_in" || (seat.Status == poker.SeatAllIn) {
				stats[seatIdx].allIns++
			}

			if _, uncontested := t.UncontestedWinner(); uncontested {
				break
			}
			if t.AdvanceAction() {
				break
			}
			if len(t.Board) > 0 {
				elapsed += secPerStreet
			}
		}

		for seat := range vpipThisHand {
			stats[seat].vpip++
		}

		// ── resolve + pay (real rs_poker showdown when contested) ───────────
		potBeforeAward := t.Pot
		_, uncontested := t.UncontestedWinner()
		flopSeen := len(t.Board) >= 3

		winnerGroups, _, err := poker.AwardSidePots(t)
		if err != nil {
			fmt.Fprintln(os.Stderr, "showdown error:", err)
			break
		}
		if uncontested {
			foldWins++
		} else {
			showdowns++
			elapsed += secPerShowdown
		}
		if potBeforeAward > biggestPot {
			biggestPot = potBeforeAward
		}

		// winnings = positive stack delta after award
		type won struct {
			seat int
			amt  int64
		}
		var winners []won
		var grossWon int64
		for i := 0; i < numPlayers; i++ {
			if s := t.Seats[i]; s != nil {
				d := s.Stack - before[i]
				if d > 0 {
					winners = append(winners, won{i, d})
					grossWon += d
				}
			}
		}

		// rake: 5% of pot, capped $3, no-flop-no-drop — taken off winners pro-rata
		var rake int64
		if flopSeen && potBeforeAward > 0 {
			rake = potBeforeAward * rakeBps / 10000
			if rake > rakeCapCents {
				rake = rakeCapCents
			}
			if rake > grossWon {
				rake = grossWon
			}
		}
		if rake > 0 && grossWon > 0 {
			removed := int64(0)
			for i, w := range winners {
				var share int64
				if i == len(winners)-1 {
					share = rake - removed
				} else {
					share = rake * w.amt / grossWon
				}
				t.Seats[w.seat].Stack -= share
				removed += share
			}
			totalRake += rake
		}

		for _, g := range winnerGroups {
			for _, seat := range g {
				stats[seat].handsWon++
				if !uncontested {
					stats[seat].showdowns++
				}
			}
		}

		t.ResetBetweenHands()

		// felt anyone who busted — they leave the table
		for i := 0; i < numPlayers; i++ {
			if s := t.Seats[i]; s != nil && s.Stack <= 0 {
				if stats[i].bustedHand == 0 {
					stats[i].bustedHand = handsPlayed
				}
				t.StandUp(i)
			}
		}
	}

	printReport(t, stats, handsPlayed, int(elapsed), totalRake, biggestPot, showdowns, foldWins)
}

func printReport(t *poker.Table, stats []*playerStat, hands, elapsed int, rake, biggestPot int64, showdowns, foldWins int) {
	fmt.Println()
	fmt.Println("================ 30-MINUTE TEXAS HOLD'EM SIMULATION ================")
	fmt.Printf("Engine: backend-core/poker + bot  ·  Eval: rs_poker (engine-math)\n")
	fmt.Printf("Table:  8-handed cash · $1/$2 blinds · $300 buy-ins · 5%% rake ($3 cap)\n")
	fmt.Printf("Played: %d hands over %d:%02d of modeled play\n", hands, elapsed/60, elapsed%60)
	fmt.Printf("Showdowns: %d   ·   Won before showdown (folds): %d   ·   Biggest pot: %s\n", showdowns, foldWins, money(biggestPot))
	fmt.Printf("House rake collected: %s\n", money(rake))
	fmt.Println()

	// final stacks (0 for busted/stood-up players tracked via stats)
	final := map[int]int64{}
	var sumFinal int64
	for i := 0; i < numPlayers; i++ {
		if s := t.Seats[i]; s != nil {
			final[i] = s.Stack
		} else {
			final[i] = 0
		}
		sumFinal += final[i]
	}

	sort.Slice(stats, func(a, b int) bool {
		return final[stats[a].seat] > final[stats[b].seat]
	})

	fmt.Printf("%-6s %-10s %-10s %-11s %-6s %-6s %-6s %-6s\n",
		"RANK", "PLAYER", "FINAL", "NET", "HANDS", "WON", "VPIP%", "STATUS")
	fmt.Println(strings.Repeat("-", 68))
	for rank, st := range stats {
		f := final[st.seat]
		net := f - st.start
		vpipPct := 0
		if st.handsDealt > 0 {
			vpipPct = st.vpip * 100 / st.handsDealt
		}
		status := "alive"
		if st.bustedHand > 0 {
			status = fmt.Sprintf("bust#%d", st.bustedHand)
		}
		fmt.Printf("%-6d %-10s %-10s %-11s %-6d %-6d %-6d %-6s\n",
			rank+1, st.name, money(f), money(net), st.handsDealt, st.handsWon, vpipPct, status)
	}
	fmt.Println(strings.Repeat("-", 68))

	// chip conservation check: everyone started with 8 × $300 = $2,400
	startTotal := int64(numPlayers) * buyInCents
	fmt.Printf("Chip conservation: start %s  =  final on table %s + rake %s  →  %s\n",
		money(startTotal), money(sumFinal), money(rake),
		map[bool]string{true: "BALANCED ✓", false: "MISMATCH ✗"}[sumFinal+rake == startTotal])
	fmt.Println("===================================================================")
}
