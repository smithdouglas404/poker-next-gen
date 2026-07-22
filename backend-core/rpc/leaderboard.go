package rpc

import (
	"context"
	"database/sql"
	"encoding/json"

	"github.com/heroiclabs/nakama-common/runtime"

	"github.com/smithdouglas404/poker-next-gen/backend-core/social"
)

// leaderboardBoardID maps a public metric to its native Nakama leaderboard id.
// "chips"/"winnings" both read the all-time net-winnings board created in
// social.EnsureLeaderboards; "hands" and "hrp" read boards the loyalty/match
// pipeline writes. An unknown metric returns "".
func leaderboardBoardID(metric string) string {
	switch metric {
	case "", "winnings", "chips":
		return social.GlobalWinnings
	case "hands":
		return "global_hands"
	case "hrp":
		return "global_hrp"
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
	board := leaderboardBoardID(req.Metric)
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
		"entries": entries,
		"cursor":  nextCursor,
	})
	return string(out), nil
}
