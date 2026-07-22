package rpc

import (
	"context"
	"database/sql"
	"encoding/json"

	"github.com/heroiclabs/nakama-common/runtime"

	"github.com/smithdouglas404/poker-next-gen/backend-core/antibot"
)

// AntibotScore evaluates betting pattern bot-likelihood for a user action history.
func AntibotScore(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	var req antibot.ScoreRequest
	if payload != "" {
		_ = json.Unmarshal([]byte(payload), &req)
	}
	// SEC-1: the scored user comes from the session, not the payload. Only an
	// admin may score a user other than themselves — otherwise any caller could
	// probe any user's anti-bot score.
	caller, err := callerID(ctx)
	if err != nil {
		return "", err
	}
	if req.UserID == "" || (req.UserID != caller && !isAdmin(caller)) {
		req.UserID = caller
	}
	score := antibot.AnalyzeBettingPatterns(req)
	out, _ := json.Marshal(score)
	return string(out), nil
}
