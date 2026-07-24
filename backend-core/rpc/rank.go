package rpc

import (
	"context"
	"database/sql"
	"encoding/json"

	"github.com/heroiclabs/nakama-common/runtime"

	"github.com/smithdouglas404/poker-next-gen/backend-core/store"
)

// rankRung is one step on the High Rollers Club service ladder — a US-military
// pay grade the player earns from real activity. Insignia describes how the
// frontend should draw the badge (chevrons for enlisted/NCO, bars/leaf/eagle for
// field officers, stars for generals) — crisp text/marks stay in the DOM.
type rankRung struct {
	Grade    string // pay grade, e.g. "E-1", "O-3", "GA"
	Name     string // full rank, e.g. "Sergeant First Class"
	Abbr     string // short form, e.g. "SFC"
	Tier     string // enlisted | nco | officer | general
	Insignia string // chevron-1..chevron-6 | bar-1 | bar-2 | leaf | eagle | star-1..star-5
	Min      int64  // minimum service score to hold this grade
}

// rankLadder is the fixed HRC rank progression, lowest → highest. The score
// thresholds escalate so promotions stay meaningful; a brand-new player is a
// Recruit/Private and the summit is the 5-star General of the Army.
var rankLadder = []rankRung{
	{"E-1", "Private", "PVT", "enlisted", "chevron-0", 0},
	{"E-2", "Private Second Class", "PV2", "enlisted", "chevron-1", 50},
	{"E-3", "Private First Class", "PFC", "enlisted", "chevron-2", 150},
	{"E-4", "Specialist", "SPC", "nco", "chevron-3", 350},
	{"E-5", "Sergeant", "SGT", "nco", "chevron-3", 750},
	{"E-6", "Staff Sergeant", "SSG", "nco", "chevron-4", 1500},
	{"E-7", "Sergeant First Class", "SFC", "nco", "chevron-5", 3000},
	{"E-8", "Master Sergeant", "MSG", "nco", "chevron-6", 5500},
	{"E-9", "Sergeant Major", "SGM", "nco", "chevron-6", 9000},
	{"O-1", "Second Lieutenant", "2LT", "officer", "bar-1", 14000},
	{"O-2", "First Lieutenant", "1LT", "officer", "bar-2", 21000},
	{"O-3", "Captain", "CPT", "officer", "bar-2", 30000},
	{"O-4", "Major", "MAJ", "officer", "leaf", 45000},
	{"O-5", "Lieutenant Colonel", "LTC", "officer", "leaf", 65000},
	{"O-6", "Colonel", "COL", "officer", "eagle", 95000},
	{"O-7", "Brigadier General", "BG", "general", "star-1", 140000},
	{"O-8", "Major General", "MG", "general", "star-2", 200000},
	{"O-9", "Lieutenant General", "LTG", "general", "star-3", 300000},
	{"O-10", "General", "GEN", "general", "star-4", 450000},
	{"GA", "General of the Army", "GA", "general", "star-5", 700000},
}

// serviceScore is the authoritative composite that drives a player's rank. It is
// a pure function of already-tracked activity — no new persistence:
//
//	hands played (volume) + wins×4 (skill) + tournament entries×25 (events) + HRP (loyalty points)
//
// so a grinder, a winner, an event regular, and a loyal member all climb, and
// nobody can be promoted by anything other than real play.
func serviceScore(hands, wins, tourneyEntries, hrp int64) int64 {
	return hands + wins*4 + tourneyEntries*25 + hrp
}

// rankForScore returns the current rung and the next rung (nil at the summit).
func rankForScore(score int64) (rankRung, *rankRung) {
	idx := 0
	for i, r := range rankLadder {
		if score >= r.Min {
			idx = i
		}
	}
	cur := rankLadder[idx]
	if idx+1 < len(rankLadder) {
		next := rankLadder[idx+1]
		return cur, &next
	}
	return cur, nil
}

// PlayerRank derives a player's US-military-style HRC rank from real activity
// (hands, wins, tournament entries, HRP). Returns the rank, the composite score
// and its components, and progress toward the next promotion. Caller by default,
// or {user_id} for a public/opponent badge. Pure projection — no new state.
func PlayerRank(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	caller, err := callerID(ctx)
	if err != nil {
		return "", err
	}
	var req struct {
		UserID string `json:"user_id"`
	}
	if payload != "" {
		_ = json.Unmarshal([]byte(payload), &req)
	}
	target := req.UserID
	if target == "" {
		target = caller
	}

	// Loyalty carries the authoritative lifetime hands/wins + HRP.
	loy, err := store.NewLoyaltyStore(db).Get(ctx, target)
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	hands := loy.HandsPlayed
	wins := loy.HandsWon

	// Tournament entries = "events" played (any registration the player made).
	var tourneyEntries int64
	_ = db.QueryRowContext(ctx,
		`SELECT COUNT(*) FROM poker_tournament_registration WHERE user_id=$1`, target).Scan(&tourneyEntries)

	score := serviceScore(hands, wins, tourneyEntries, loy.HRPTotal)
	cur, next := rankForScore(score)

	out := map[string]interface{}{
		"user_id":  target,
		"score":    score,
		"grade":    cur.Grade,
		"name":     cur.Name,
		"abbr":     cur.Abbr,
		"tier":     cur.Tier,
		"insignia": cur.Insignia,
		"components": map[string]interface{}{
			"hands":            hands,
			"wins":             wins,
			"tournament_entries": tourneyEntries,
			"hrp":              loy.HRPTotal,
		},
	}
	if next != nil {
		span := next.Min - cur.Min
		into := score - cur.Min
		pct := 0
		if span > 0 {
			pct = int((into * 100) / span)
		}
		if pct > 100 {
			pct = 100
		}
		out["next_grade"] = next.Grade
		out["next_name"] = next.Name
		out["next_min_score"] = next.Min
		out["progress_pct"] = pct
		out["score_to_next"] = next.Min - score
	} else {
		out["next_grade"] = ""
		out["progress_pct"] = 100
		out["score_to_next"] = 0
	}
	b, _ := json.Marshal(out)
	return string(b), nil
}
