package rpc

import (
	"context"
	"database/sql"
	"encoding/json"
	"math"

	"github.com/heroiclabs/nakama-common/runtime"

	"github.com/smithdouglas404/poker-next-gen/backend-core/store"
)

// statsRatePct returns num/den as a rounded whole percent (0 when den<=0).
func statsRatePct(num, den int64) int {
	if den <= 0 {
		return 0
	}
	return int((num*100 + den/2) / den)
}

// statsAF is the postflop aggression factor ((bets+raises)/calls), rounded to
// two decimals. With no calls it reports the raw aggressive-action count so the
// value is meaningful rather than a divide-by-zero.
func statsAF(betsRaises, calls int64) float64 {
	if calls <= 0 {
		return float64(betsRaises)
	}
	return math.Round(float64(betsRaises)/float64(calls)*100) / 100
}

// statsView projects an aggregate into the wire shape shared by player_stats
// and the analytics/HUD surfaces.
func statsView(userID, clubID string, a *store.StatsAggregate) map[string]interface{} {
	v := map[string]interface{}{
		"user_id":      userID,
		"hands":        a.Hands,
		"vpip_pct":     statsRatePct(a.VPIPHands, a.Hands),
		"pfr_pct":      statsRatePct(a.PFRHands, a.Hands),
		"wtsd_pct":     statsRatePct(a.Showdowns, a.Hands),
		"wsd_pct":      statsRatePct(a.ShowdownWins, a.Showdowns),
		"win_rate_pct": statsRatePct(a.Wins, a.Hands),
		"af":           statsAF(a.BetsRaises, a.Calls),
		"net_cents":    a.NetCents,
		"net":          dollars(a.NetCents),
	}
	if clubID != "" {
		v["club_id"] = clubID
	}
	return v
}

// PlayerStats returns aggregated VPIP/PFR/AF/WTSD/net for a user (the caller by
// default, or {user_id} for the opponent HUD / public profile), optionally
// scoped to a club.
func PlayerStats(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	caller, err := callerID(ctx)
	if err != nil {
		return "", err
	}
	var req struct {
		UserID string `json:"user_id"`
		ClubID string `json:"club_id"`
	}
	if payload != "" {
		_ = json.Unmarshal([]byte(payload), &req)
	}
	target := req.UserID
	if target == "" {
		target = caller
	}
	agg, err := store.NewStatsStore(db).Aggregate(ctx, target, req.ClubID)
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	out, _ := json.Marshal(statsView(target, req.ClubID, agg))
	return string(out), nil
}

// statsLeak is one detected leak with a coaching suggestion.
type statsLeak struct {
	Code       string `json:"code"`
	Title      string `json:"title"`
	Severity   string `json:"severity"` // info | warn | high
	Detail     string `json:"detail"`
	Suggestion string `json:"suggestion"`
}

// LeakReport derives common preflop/postflop leaks and suggestions purely from
// the caller's aggregate. The sample size is surfaced so the client can flag low
// confidence; classification thresholds mirror standard 6-max HUD heuristics.
func LeakReport(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	caller, err := callerID(ctx)
	if err != nil {
		return "", err
	}
	var req struct {
		ClubID string `json:"club_id"`
	}
	if payload != "" {
		_ = json.Unmarshal([]byte(payload), &req)
	}
	a, err := store.NewStatsStore(db).Aggregate(ctx, caller, req.ClubID)
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}

	vpip := statsRatePct(a.VPIPHands, a.Hands)
	pfr := statsRatePct(a.PFRHands, a.Hands)
	wtsd := statsRatePct(a.Showdowns, a.Hands)
	af := statsAF(a.BetsRaises, a.Calls)
	gap := vpip - pfr

	leaks := []statsLeak{}
	if a.Hands < 100 {
		leaks = append(leaks, statsLeak{
			Code: "low_sample", Title: "Small sample", Severity: "info",
			Detail:     "Fewer than 100 tracked hands — these reads are low-confidence.",
			Suggestion: "Play more hands before trusting the trends below.",
		})
	}
	if a.Hands >= 30 {
		switch {
		case vpip > 35:
			leaks = append(leaks, statsLeak{
				Code: "loose_vpip", Title: "Playing too many hands", Severity: "high",
				Detail:     "Your VPIP is above 35% — you're entering pots too wide.",
				Suggestion: "Tighten your opening range, especially from early position.",
			})
		case vpip < 12:
			leaks = append(leaks, statsLeak{
				Code: "nit_vpip", Title: "Playing too few hands", Severity: "warn",
				Detail:     "Your VPIP is below 12% — you're folding too much preflop.",
				Suggestion: "Add more suited connectors and broadways to your opening range.",
			})
		}
		if gap > 12 {
			leaks = append(leaks, statsLeak{
				Code: "passive_preflop", Title: "Too much calling preflop", Severity: "warn",
				Detail:     "A large VPIP–PFR gap means you limp/call far more than you raise.",
				Suggestion: "Convert marginal calls into raises or folds — enter pots with initiative.",
			})
		}
		if pfr < 8 {
			leaks = append(leaks, statsLeak{
				Code: "low_pfr", Title: "Rarely raising", Severity: "warn",
				Detail:     "Your PFR is below 8% — you seldom take the betting lead preflop.",
				Suggestion: "Open-raise rather than limp; three-bet your strongest hands.",
			})
		}
		if af < 1.0 {
			leaks = append(leaks, statsLeak{
				Code: "passive_postflop", Title: "Passive after the flop", Severity: "warn",
				Detail:     "An aggression factor under 1.0 means you call far more than you bet or raise.",
				Suggestion: "Bet your value hands for value and pick up more pots with well-timed aggression.",
			})
		} else if af > 4.0 {
			leaks = append(leaks, statsLeak{
				Code: "over_aggressive", Title: "Over-aggressive postflop", Severity: "warn",
				Detail:     "An aggression factor above 4.0 suggests too much betting and raising.",
				Suggestion: "Check back marginal hands and pick better spots to apply pressure.",
			})
		}
		if wtsd > 32 {
			leaks = append(leaks, statsLeak{
				Code: "station_wtsd", Title: "Going to showdown too often", Severity: "warn",
				Detail:     "You reach showdown in over 32% of hands — you may be calling down too light.",
				Suggestion: "Fold more rivers when the story doesn't add up; respect big bets.",
			})
		}
	}
	if a.Hands >= 100 && a.NetCents < 0 {
		leaks = append(leaks, statsLeak{
			Code: "losing", Title: "Net losing", Severity: "high",
			Detail:     "You're down " + dollars(-a.NetCents) + " over tracked hands.",
			Suggestion: "Review the flagged leaks above and consider dropping down in stakes.",
		})
	}

	out, _ := json.Marshal(map[string]interface{}{
		"user_id": caller,
		"hands":   a.Hands,
		"stats":   statsView(caller, req.ClubID, a),
		"leaks":   leaks,
	})
	return string(out), nil
}

// HandHistory returns a paginated list of the caller's hands from the searchable
// hand index (optionally filtered by match / to anchored hands only).
func HandHistory(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	caller, err := callerID(ctx)
	if err != nil {
		return "", err
	}
	var req struct {
		MatchID     string `json:"match_id"`
		OnChainOnly bool   `json:"on_chain_only"`
		Limit       int    `json:"limit"`
		Offset      int    `json:"offset"`
	}
	if payload != "" {
		_ = json.Unmarshal([]byte(payload), &req)
	}
	hands, err := store.NewStatsStore(db).HandHistory(ctx, caller, req.MatchID, req.OnChainOnly, req.Limit, req.Offset)
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	out, _ := json.Marshal(map[string]interface{}{
		"hands":  hands,
		"limit":  req.Limit,
		"offset": req.Offset,
	})
	return string(out), nil
}

// StatsHeadToHead returns the caller's head-to-head record versus an opponent.
func StatsHeadToHead(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	caller, err := callerID(ctx)
	if err != nil {
		return "", err
	}
	var req struct {
		OpponentUserID string `json:"opponent_user_id"`
		ClubID         string `json:"club_id"`
	}
	if err := json.Unmarshal([]byte(payload), &req); err != nil || req.OpponentUserID == "" {
		return "", runtime.NewError("opponent_user_id required", 3)
	}
	if req.OpponentUserID == caller {
		return "", runtime.NewError("cannot compare with yourself", 3)
	}
	rec, err := store.NewStatsStore(db).HeadToHead(ctx, caller, req.OpponentUserID, req.ClubID)
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	out, _ := json.Marshal(map[string]interface{}{
		"user_id":       caller,
		"opponent":      req.OpponentUserID,
		"hands":         rec.Hands,
		"my_wins":       rec.MyWins,
		"opp_wins":      rec.OppWins,
		"showdowns":     rec.Showdowns,
		"my_net_cents":  rec.MyNetCents,
		"opp_net_cents": rec.OppNetCents,
		"my_net":        dollars(rec.MyNetCents),
		"opp_net":       dollars(rec.OppNetCents),
	})
	return string(out), nil
}

// LoyaltyHistory returns the caller's paginated HRP event feed (loyalty_history).
func LoyaltyHistory(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	caller, err := callerID(ctx)
	if err != nil {
		return "", err
	}
	var req struct {
		Limit  int `json:"limit"`
		Offset int `json:"offset"`
	}
	if payload != "" {
		_ = json.Unmarshal([]byte(payload), &req)
	}
	events, err := store.NewStatsStore(db).HRPEvents(ctx, caller, req.Limit, req.Offset)
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	out, _ := json.Marshal(map[string]interface{}{
		"events": events,
		"limit":  req.Limit,
		"offset": req.Offset,
	})
	return string(out), nil
}
