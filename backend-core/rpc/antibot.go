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
	if req.UserID == "" {
		return "", runtime.NewError("user_id required", 3)
	}
	score := antibot.AnalyzeBettingPatterns(req)
	out, _ := json.Marshal(score)
	return string(out), nil
}
