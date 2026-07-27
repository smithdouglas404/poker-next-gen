package rpc

import (
	"context"
	"database/sql"
	"encoding/json"

	"github.com/heroiclabs/nakama-common/runtime"

	"github.com/smithdouglas404/poker-next-gen/backend-core/social"
	"github.com/smithdouglas404/poker-next-gen/backend-core/store"
)

// leaderboardBoardID maps a public metric to its native Nakama leaderboard id.
// "chips"/"winnings" both read the all-time net-winnings board created in
// social.EnsureLeaderboards; "hands" and "hrp" read boards the loyalty/match
// pipeline writes. An unknown metric returns "".
func leaderboardBoardID(metric string) string {
	return leaderboardBoardFor(metric, "")
}

// leaderboardBoardFor resolves a metric + period to a native board id. period
// "season" reads the monthly-resetting bankroll-season mirror; anything else
// reads the all-time board.
func leaderboardBoardFor(metric, period string) string {
	season := period == "season"
	switch metric {
	case "", "winnings", "chips":
		if season {
			return social.SeasonWinnings
		}
		return social.GlobalWinnings
	case "hands":
		if season {
			return social.SeasonHands
		}
		return social.GlobalHands
	case "hrp":
		if season {
			return social.SeasonHRP
		}
		return social.GlobalHRP
	default:
		return ""
	}
}

// leaderboardEntry is one ranked row projected from a Nakama leaderboard record.
type leaderboardEntry struct {
	Rank     int64  `json:"rank"`
	UserID   string `json:"user_id"`
	Username string `json:"username"`
	Score    int64  `json:"score"`
	Subscore int64  `json:"subscore"`
}

// LeaderboardTop returns the top ranked players for a metric by reading the
// native Nakama leaderboard (see social/social.go). If the requested board does
// not exist yet it returns an empty ladder rather than erroring, so the UI can
// render an empty state.
func LeaderboardTop(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	var req struct {
		Metric string `json:"metric"`
		Period string `json:"period"`
		Limit  int    `json:"limit"`
	}
	if payload != "" {
		_ = json.Unmarshal([]byte(payload), &req)
	}
	board := leaderboardBoardFor(req.Metric, req.Period)
	if board == "" {
		return "", runtime.NewError("unknown leaderboard metric", 3)
	}
	metric := req.Metric
	if metric == "" {
		metric = "winnings"
	}
	limit := req.Limit
	if limit <= 0 || limit > 100 {
		limit = 25
	}

	records, _, nextCursor, _, err := nk.LeaderboardRecordsList(ctx, board, nil, limit, "", 0)
	if err != nil {
		// Board not created yet (or transient) → present an empty ladder.
		out, _ := json.Marshal(map[string]interface{}{
			"metric":  metric,
			"entries": []leaderboardEntry{},
			"cursor":  "",
		})
		return string(out), nil
	}

	entries := make([]leaderboardEntry, 0, len(records))
	for _, r := range records {
		name := ""
		if r.Username != nil {
			name = r.Username.Value
		}
		entries = append(entries, leaderboardEntry{
			Rank:     r.Rank,
			UserID:   r.OwnerId,
			Username: name,
			Score:    r.Score,
			Subscore: r.Subscore,
		})
	}
	out, _ := json.Marshal(map[string]interface{}{
		"metric":  metric,
		"entries": hidePrivateEntries(ctx, db, entries),
		"cursor":  nextCursor,
	})
	return string(out), nil
}

// hidePrivateEntries drops players who asked not to be listed.
//
// The profile's "Privacy Mode" toggle promised this and nothing enforced it, so
// a player who turned it on was still on every public ladder. Filtering here
// rather than at write time keeps their score accruing — turning privacy off
// puts them back where they belong instead of starting them from zero.
//
// Ranks are left as Nakama assigned them: renumbering would silently claim
// positions that are not the player's, and a gap is the honest rendering of
// "someone is there and chose not to be named".
func hidePrivateEntries(ctx context.Context, db *sql.DB, entries []leaderboardEntry) []leaderboardEntry {
	if len(entries) == 0 {
		return entries
	}
	ids := make([]string, 0, len(entries))
	for _, e := range entries {
		ids = append(ids, e.UserID)
	}
	private, err := store.PrivateUserIDs(ctx, db, ids)
	if err != nil || len(private) == 0 {
		// On a lookup failure the ladder renders unfiltered rather than empty.
		// This is the one place privacy fails OPEN, because the alternative is a
		// blank leaderboard for everyone whenever the query hiccups; the data
		// exposed is a username and a score the player already published by
		// playing ranked, not the account detail PrivacyMode guards.
		return entries
	}
	out := entries[:0]
	for _, e := range entries {
		if !private[e.UserID] {
			out = append(out, e)
		}
	}
	return out
}


// SeasonCurrent reports the active bankroll season: its window (start = the
// season board's previous reset, end = its next reset) and the season's current
// top standings. The season boundaries come straight from the seasonal
// leaderboard's monthly reset schedule, so there is no separate season registry
// to drift out of sync.
func SeasonCurrent(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	var req struct {
		Metric string `json:"metric"`
		Limit  int    `json:"limit"`
	}
	if payload != "" {
		_ = json.Unmarshal([]byte(payload), &req)
	}
	metric := req.Metric
	if metric == "" {
		metric = "winnings"
	}
	board := leaderboardBoardFor(metric, "season")
	if board == "" {
		return "", runtime.NewError("unknown leaderboard metric", 3)
	}
	limit := req.Limit
	if limit <= 0 || limit > 100 {
		limit = 25
	}

	// Season window from the board's reset schedule (unix seconds; 0 => unset).
	var startsAt, endsAt int64
	if boards, err := nk.LeaderboardsGetId(ctx, []string{board}); err == nil && len(boards) > 0 {
		startsAt = int64(boards[0].GetPrevReset())
		endsAt = int64(boards[0].GetNextReset())
	}

	entries := make([]leaderboardEntry, 0, limit)
	if records, _, _, _, err := nk.LeaderboardRecordsList(ctx, board, nil, limit, "", 0); err == nil {
		for _, r := range records {
			name := ""
			if r.Username != nil {
				name = r.Username.Value
			}
			entries = append(entries, leaderboardEntry{
				Rank:     r.Rank,
				UserID:   r.OwnerId,
				Username: name,
				Score:    r.Score,
				Subscore: r.Subscore,
			})
		}
	}
	entries = hidePrivateEntries(ctx, db, entries)

	out, _ := json.Marshal(map[string]interface{}{
		"metric":    metric,
		"starts_at": startsAt, // unix seconds; 0 if season has never reset yet
		"ends_at":   endsAt,   // unix seconds of the next monthly reset
		"entries":   entries,
	})
	return string(out), nil
}
