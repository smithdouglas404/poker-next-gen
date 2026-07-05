// Package social wires the platform onto native Nakama features that the repo
// previously left unused: leaderboards and notifications.
package social

import (
	"context"

	"github.com/heroiclabs/nakama-common/runtime"
)

// GlobalWinnings is the id of the all-time net-winnings leaderboard.
const GlobalWinnings = "global_winnings"

// EnsureLeaderboards creates the platform leaderboards idempotently. Calling it
// when a board already exists returns an error, which is expected and ignored.
func EnsureLeaderboards(ctx context.Context, nk runtime.NakamaModule) {
	// authoritative, sort desc, "incr" operator (accumulate winnings), no reset.
	_ = nk.LeaderboardCreate(ctx, GlobalWinnings, true, "desc", "incr", "", nil, true)
}

// RecordWinnings increments a player's winnings on the global leaderboard.
func RecordWinnings(ctx context.Context, nk runtime.NakamaModule, userID, username string, amount int64) {
	if userID == "" || amount <= 0 {
		return
	}
	_, _ = nk.LeaderboardRecordWrite(ctx, GlobalWinnings, userID, username, amount, 0, nil, nil)
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
