// Package loyalty defines the High Roller Points (HRP) progression: levels
// earned by playing, tier multipliers, and the achievement catalog. HRP is
// earned by PLAYING (win or lose), so losing players still progress.
package loyalty

import "strings"

// Level is one loyalty tier, reached by accumulating lifetime HRP.
type Level struct {
	Level       int    `json:"level"`
	Name        string `json:"name"`
	Badge       string `json:"badge"`
	HRPRequired int64  `json:"hrp_required"`
}

// Levels are ordered ascending by HRP required (Rookie → Immortal).
var Levels = []Level{
	{1, "Rookie", "🥉", 0},
	{2, "Regular", "🥈", 500},
	{3, "Grinder", "🥇", 2_000},
	{4, "Shark", "🦈", 5_000},
	{5, "High Roller", "💎", 15_000},
	{6, "VIP", "♦️", 35_000},
	{7, "Elite", "🔷", 75_000},
	{8, "Legend", "🟢", 150_000},
	{9, "Icon", "⚫", 300_000},
	{10, "Immortal", "🌈", 500_000},
}

// LevelFor returns the current level for a lifetime HRP total, the next level
// (nil at max), and progress toward the next level in [0,1].
func LevelFor(hrp int64) (current Level, next *Level, progress float64) {
	current = Levels[0]
	for i := range Levels {
		if hrp >= Levels[i].HRPRequired {
			current = Levels[i]
			if i+1 < len(Levels) {
				n := Levels[i+1]
				next = &n
			} else {
				next = nil
			}
		}
	}
	if next == nil {
		return current, nil, 1
	}
	span := next.HRPRequired - current.HRPRequired
	if span <= 0 {
		return current, next, 0
	}
	progress = float64(hrp-current.HRPRequired) / float64(span)
	if progress < 0 {
		progress = 0
	}
	if progress > 1 {
		progress = 1
	}
	return current, next, progress
}

// Multiplier is the HRP earn multiplier for a subscription tier — subscribers
// progress faster, which makes the subscription feel more valuable.
func Multiplier(tier string) float64 {
	switch strings.ToLower(tier) {
	case "bronze":
		return 1.2
	case "silver":
		return 1.5
	case "gold":
		return 2.0
	case "platinum":
		return 3.0
	default:
		return 1.0
	}
}

// Achievement is a permanent, earned-not-bought unlock.
type Achievement struct {
	Code        string `json:"code"`
	Name        string `json:"name"`
	Description string `json:"description"`
	HRP         int64  `json:"hrp"`
}

// Catalog is the full achievement set (subset auto-detected from hand results).
var Catalog = map[string]Achievement{
	"first_blood":  {"first_blood", "First Blood", "Win your first hand", 100},
	"century":      {"century", "Century", "Play 100 hands", 200},
	"millennium":   {"millennium", "Millennium", "Play 1,000 hands", 500},
	"iron_player":  {"iron_player", "Iron Player", "Play 10,000 hands", 2_000},
	"quad_squad":   {"quad_squad", "Quad Squad", "Win with four of a kind", 300},
	"straight_flush": {"straight_flush", "Straight Flush", "Win with a straight flush", 500},
}

// normalizeCat lowercases and strips separators so rs_poker category strings
// like "StraightFlush" / "Four Of A Kind" compare robustly.
func normalizeCat(cat string) string {
	r := strings.NewReplacer(" ", "", "_", "", "-", "")
	return strings.ToLower(r.Replace(cat))
}

// AchievementsForResult returns the achievement codes a player has now earned,
// given their post-hand totals, whether they won, and (if they won) the winning
// hand category. Already-unlocked ones are filtered by the caller.
func AchievementsForResult(handsPlayed, handsWon int64, won bool, handCat string) []string {
	var out []string
	if won && handsWon >= 1 {
		out = append(out, "first_blood")
	}
	if handsPlayed >= 100 {
		out = append(out, "century")
	}
	if handsPlayed >= 1_000 {
		out = append(out, "millennium")
	}
	if handsPlayed >= 10_000 {
		out = append(out, "iron_player")
	}
	if won {
		switch normalizeCat(handCat) {
		case "fourofakind":
			out = append(out, "quad_squad")
		case "straightflush", "royalflush":
			out = append(out, "straight_flush")
		}
	}
	return out
}
