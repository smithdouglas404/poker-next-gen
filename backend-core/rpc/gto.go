package rpc

import (
	"context"
	"database/sql"
	"encoding/json"
	"strings"

	"github.com/heroiclabs/nakama-common/runtime"

	"github.com/smithdouglas404/poker-next-gen/backend-core/coaching"
	"github.com/smithdouglas404/poker-next-gen/backend-core/poker/enginemath"
)

type gtoAdviseRequest struct {
	HeroHole     string   `json:"hero_hole"`
	VillainHoles []string `json:"villain_holes"`
	Board        string   `json:"board"`
	Pot          float64  `json:"pot"`
	ToCall       float64  `json:"to_call"`
	Iterations   int      `json:"iterations"`
}

// GtoAdvise proxies equity-based GTO approximation to engine-math (rs_poker CFR-lite).
func GtoAdvise(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	var req gtoAdviseRequest
	if payload != "" {
		_ = json.Unmarshal([]byte(payload), &req)
	}
	if req.HeroHole == "" {
		return "", runtime.NewError("hero_hole required", 3)
	}
	iters := req.Iterations
	if iters <= 0 {
		iters = 2000
	}
	advice, err := enginemath.GtoAdvise(req.HeroHole, req.VillainHoles, strings.TrimSpace(req.Board), req.Pot, req.ToCall, iters)
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	out, _ := json.Marshal(advice)
	return string(out), nil
}

// CoachingTip returns Smart HUD coaching alerts (MCP-ready analysis surface).
func CoachingTip(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	var req coaching.TipRequest
	if payload != "" {
		_ = json.Unmarshal([]byte(payload), &req)
	}
	tip, err := coaching.Analyze(req)
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	out, _ := json.Marshal(tip)
	return string(out), nil
}
