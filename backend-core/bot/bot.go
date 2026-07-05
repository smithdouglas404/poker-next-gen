// Package bot provides house/AI poker players. Hand strength is always sourced
// from rs_poker via engine-math (Golden Rule #4 — no local hand evaluation); the
// bot only owns the *policy* that turns strength + pot odds into an action.
package bot

import (
	"fmt"
	"math/rand"
	"strings"

	"github.com/smithdouglas404/poker-next-gen/backend-core/poker/enginemath"
)

// Decision is a bot's chosen action for its turn.
type Decision struct {
	Action string // "fold" | "check" | "call" | "raise"
	Amount int64  // total bet-to amount for "raise"
}

// categoryStrength maps an rs_poker hand category to a 0..8 strength score.
func categoryStrength(category string) int {
	switch strings.ToLower(strings.ReplaceAll(category, " ", "")) {
	case "highcard":
		return 0
	case "onepair", "pair":
		return 1
	case "twopair":
		return 2
	case "threeofakind", "trips", "set":
		return 3
	case "straight":
		return 4
	case "flush":
		return 5
	case "fullhouse":
		return 6
	case "fourofakind", "quads":
		return 7
	case "straightflush", "royalflush":
		return 8
	default:
		return 0
	}
}

// preflopStrength scores two hole-card codes (e.g. "As","Kd") on a rough 0..8
// scale. This is bot policy, not authoritative evaluation, so it stays local.
func preflopStrength(c1, c2 string) int {
	r1, s1 := rankVal(c1), suitOf(c1)
	r2, s2 := rankVal(c2), suitOf(c2)
	if r1 == 0 || r2 == 0 {
		return 0
	}
	hi, lo := r1, r2
	if lo > hi {
		hi, lo = lo, hi
	}
	score := 0
	switch {
	case r1 == r2 && r1 >= 10: // TT+
		score = 7
	case r1 == r2 && r1 >= 7: // 77-99
		score = 5
	case r1 == r2: // small pair
		score = 4
	case hi == 14 && lo >= 12: // AK, AQ
		score = 5
	case hi >= 13 && lo >= 11: // KQ, KJ, QJ
		score = 4
	case hi == 14: // any ace
		score = 3
	case hi >= 12: // two broadway-ish
		score = 2
	default:
		score = 1
	}
	if s1 == s2 {
		score++ // suited bonus
	}
	if hi-lo == 1 && lo >= 5 {
		score++ // connected bonus
	}
	if score > 8 {
		score = 8
	}
	return score
}

func rankVal(code string) int {
	if code == "" {
		return 0
	}
	switch code[0] {
	case 'A':
		return 14
	case 'K':
		return 13
	case 'Q':
		return 12
	case 'J':
		return 11
	case 'T':
		return 10
	default:
		if code[0] >= '2' && code[0] <= '9' {
			return int(code[0] - '0')
		}
	}
	return 0
}

func suitOf(code string) byte {
	if len(code) < 2 {
		return 0
	}
	return code[len(code)-1]
}

// policy turns a 0..8 strength score and the betting situation into an action.
// Pure and deterministic given r — unit-testable without the sidecar.
func policy(strength int, toCall, pot, minRaise, maxRaise, stack int64, r *rand.Rand) Decision {
	facing := toCall > 0
	// Pot odds: fraction of the pot we must pay to continue.
	potOdds := 0.0
	if facing && pot+toCall > 0 {
		potOdds = float64(toCall) / float64(pot+toCall)
	}

	// A little noise so bots aren't perfectly exploitable.
	aggression := r.Float64()

	switch {
	case strength >= 5: // strong: raise for value, occasionally just call
		if maxRaise > minRaise && aggression > 0.25 {
			return Decision{Action: "raise", Amount: raiseSize(minRaise, maxRaise, pot, 0.75, r)}
		}
		if facing {
			return Decision{Action: "call"}
		}
		return Decision{Action: "check"}
	case strength >= 3: // medium-strong: mostly call/bet, sometimes raise
		if !facing && aggression > 0.5 && maxRaise > minRaise {
			return Decision{Action: "raise", Amount: raiseSize(minRaise, maxRaise, pot, 0.5, r)}
		}
		return callOrFold(facing, potOdds, 0.45, aggression)
	case strength >= 1: // marginal: call cheap, fold to pressure
		if !facing {
			return Decision{Action: "check"}
		}
		return callOrFold(facing, potOdds, 0.25, aggression)
	default: // trash
		if !facing {
			// occasional bluff
			if aggression > 0.85 && maxRaise > minRaise {
				return Decision{Action: "raise", Amount: raiseSize(minRaise, maxRaise, pot, 0.5, r)}
			}
			return Decision{Action: "check"}
		}
		return Decision{Action: "fold"}
	}
}

func callOrFold(facing bool, potOdds, threshold, noise float64) Decision {
	if !facing {
		return Decision{Action: "check"}
	}
	// Call when the price is right (cheap relative to threshold), with noise.
	if potOdds <= threshold+0.1*(noise-0.5) {
		return Decision{Action: "call"}
	}
	return Decision{Action: "fold"}
}

func raiseSize(minRaise, maxRaise, pot int64, potFrac float64, r *rand.Rand) int64 {
	target := minRaise + int64(potFrac*float64(pot))
	if target < minRaise {
		target = minRaise
	}
	if target > maxRaise {
		target = maxRaise
	}
	return target
}

// Decide fetches the bot's made-hand strength from rs_poker (postflop) or scores
// its hole cards (preflop), then applies policy. holeCodes like "AsKd";
// boardCodes like "Qh7d2c" (empty preflop).
func Decide(holeCodes, boardCodes string, toCall, pot, minRaise, maxRaise, stack int64, r *rand.Rand) (Decision, error) {
	holeCodes = strings.TrimSpace(holeCodes)
	boardCodes = strings.TrimSpace(boardCodes)
	if len(holeCodes) < 4 {
		return Decision{}, fmt.Errorf("bot: need two hole cards, got %q", holeCodes)
	}
	var strength int
	if len(boardCodes) >= 6 { // 3+ board cards -> a made hand exists
		category, err := enginemath.RankHand(holeCodes + boardCodes)
		if err != nil {
			return Decision{}, fmt.Errorf("bot rank via rs_poker: %w", err)
		}
		strength = categoryStrength(category)
	} else {
		strength = preflopStrength(holeCodes[0:2], holeCodes[2:4])
	}
	return policy(strength, toCall, pot, minRaise, maxRaise, stack, r), nil
}
