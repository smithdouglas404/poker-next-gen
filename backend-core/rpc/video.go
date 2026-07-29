package rpc

import (
	"context"
	"database/sql"
	"encoding/json"

	"github.com/heroiclabs/nakama-common/runtime"

	"github.com/smithdouglas404/poker-next-gen/backend-core/integrations"
)

// VideoTokenGet issues a per-user Daily.co meeting token for a table's video
// room. Degrades honestly (available:false, not an error) when DAILY_API_KEY
// isn't configured — mirrors the reference HighRollersClub route exactly, so
// the client can show "Video chat unavailable" rather than a broken join
// attempt. isOwner (controls who may start cloud recording) is resolved by
// asking the match itself via MatchSignal, never trusted from the client.
func VideoTokenGet(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	userID, err := callerID(ctx)
	if err != nil {
		return "", err
	}
	var req struct {
		MatchID string `json:"match_id"`
	}
	if err := json.Unmarshal([]byte(payload), &req); err != nil || req.MatchID == "" {
		return "", runtime.NewError("match_id required", 3)
	}

	if !integrations.DailyConfigured() {
		out, _ := json.Marshal(map[string]interface{}{
			"available": false,
			"message":   "Video chat is not currently available. Contact the platform administrator to enable this feature.",
		})
		return string(out), nil
	}

	username, _ := ctx.Value(runtime.RUNTIME_CTX_USERNAME).(string)
	if username == "" {
		username = "Player"
	}

	sig, _ := json.Marshal(map[string]interface{}{"type": "is_host", "user_id": userID})
	resp, err := nk.MatchSignal(ctx, req.MatchID, string(sig))
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	isOwner := resp == "true"

	token, err := integrations.CreateMeetingToken(ctx, req.MatchID, userID, username, isOwner)
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	out, _ := json.Marshal(map[string]interface{}{"available": true, "token": token})
	return string(out), nil
}
