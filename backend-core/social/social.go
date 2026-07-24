// Package social wires the platform onto native Nakama features that the repo
// previously left unused: leaderboards and notifications.
package social

import (
	"context"

	"github.com/heroiclabs/nakama-common/runtime"
)

// GlobalWinnings is the id of the all-time net-winnings leaderboard.
const GlobalWinnings = "global_winnings"

// GlobalHands is the id of the all-time hands-played leaderboard.
const GlobalHands = "global_hands"

// GlobalHRP is the id of the all-time High Roller Points leaderboard.
const GlobalHRP = "global_hrp"

// Bankroll seasons: mirror boards that reset monthly so competition restarts each
// season while the all-time boards keep accumulating. Nakama auto-resets on the
// CRON and preserves the prior season's final records (queryable by expiry).
const (
	SeasonWinnings = "season_winnings"
	SeasonHands    = "season_hands"
	SeasonHRP      = "season_hrp"
	// SeasonReset fires 00:00 UTC on the 1st of every month.
	SeasonReset = "0 0 1 * *"
)

// EnsureLeaderboards creates the platform leaderboards idempotently. Calling it
// when a board already exists returns an error, which is expected and ignored.
func EnsureLeaderboards(ctx context.Context, nk runtime.NakamaModule) {
	// authoritative, sort desc, "incr" operator (accumulate), no reset.
	_ = nk.LeaderboardCreate(ctx, GlobalWinnings, true, "desc", "incr", "", nil, true)
	_ = nk.LeaderboardCreate(ctx, GlobalHands, true, "desc", "incr", "", nil, true)
	_ = nk.LeaderboardCreate(ctx, GlobalHRP, true, "desc", "incr", "", nil, true)
	// Seasonal mirrors: same accumulate semantics, monthly reset schedule.
	_ = nk.LeaderboardCreate(ctx, SeasonWinnings, true, "desc", "incr", SeasonReset, nil, true)
	_ = nk.LeaderboardCreate(ctx, SeasonHands, true, "desc", "incr", SeasonReset, nil, true)
	_ = nk.LeaderboardCreate(ctx, SeasonHRP, true, "desc", "incr", SeasonReset, nil, true)
}

// RecordWinnings increments a player's winnings on the all-time and season boards.
func RecordWinnings(ctx context.Context, nk runtime.NakamaModule, userID, username string, amount int64) {
	if userID == "" || amount <= 0 {
		return
	}
	_, _ = nk.LeaderboardRecordWrite(ctx, GlobalWinnings, userID, username, amount, 0, nil, nil)
	_, _ = nk.LeaderboardRecordWrite(ctx, SeasonWinnings, userID, username, amount, 0, nil, nil)
}

// RecordHands increments a player's hands-played count on the all-time and season boards.
func RecordHands(ctx context.Context, nk runtime.NakamaModule, userID, username string, count int64) {
	if userID == "" || count <= 0 {
		return
	}
	_, _ = nk.LeaderboardRecordWrite(ctx, GlobalHands, userID, username, count, 0, nil, nil)
	_, _ = nk.LeaderboardRecordWrite(ctx, SeasonHands, userID, username, count, 0, nil, nil)
}

// RecordHRP increments a player's High Roller Points on the all-time and season boards.
func RecordHRP(ctx context.Context, nk runtime.NakamaModule, userID, username string, hrp int64) {
	if userID == "" || hrp <= 0 {
		return
	}
	_, _ = nk.LeaderboardRecordWrite(ctx, GlobalHRP, userID, username, hrp, 0, nil, nil)
	_, _ = nk.LeaderboardRecordWrite(ctx, SeasonHRP, userID, username, hrp, 0, nil, nil)
}

// Notify sends a persistent in-app notification to a player.
func Notify(ctx context.Context, nk runtime.NakamaModule, userID, subject string, content map[string]interface{}, code int) {
	if userID == "" {
		return
	}
	if content == nil {
		content = map[string]interface{}{}
	}
	_ = nk.NotificationSend(ctx, userID, subject, content, code, "", true)
}

// Notification codes (client can branch on these).
const (
	CodeHandWon        = 1
	CodeTournamentWon  = 2
	CodeKnockedOut     = 3
	CodeTournamentInfo = 4
)
