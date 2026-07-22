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
	if err := guardRTA(payload); err != nil { // S-1: no live assistance at stakes tables
		return "", err
	}
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

type gtoSolveRequest struct {
	HeroHole     string  `json:"hero_hole"`
	VillainHole  string  `json:"villain_hole"`
	Board        string  `json:"board"`
	HeroStack    float64 `json:"hero_stack"`
	VillainStack float64 `json:"villain_stack"`
	Pot          float64 `json:"pot"`
	ToCall       float64 `json:"to_call"`
	DeadlineMs   int     `json:"deadline_ms"`
	Iterations   int     `json:"iterations"`
}

// GtoSolve runs the genuine rs_poker CFR solver (engine-math /gto/solve) for a
// heads-up spot — real counterfactual regret minimization, not the equity
// heuristic behind GtoAdvise.
func GtoSolve(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	if err := guardRTA(payload); err != nil { // S-1
		return "", err
	}
	var req gtoSolveRequest
	if payload != "" {
		_ = json.Unmarshal([]byte(payload), &req)
	}
	if req.HeroHole == "" || req.VillainHole == "" {
		return "", runtime.NewError("hero_hole and villain_hole required (heads-up CFR)", 3)
	}
	if req.HeroStack <= 0 {
		req.HeroStack = 1000
	}
	if req.VillainStack <= 0 {
		req.VillainStack = 1000
	}
	if req.DeadlineMs <= 0 {
		req.DeadlineMs = 5000
	}
	if req.Iterations <= 0 {
		req.Iterations = 1000
	}
	advice, err := enginemath.CfrSolve(
		strings.TrimSpace(req.HeroHole),
		strings.TrimSpace(req.VillainHole),
		strings.TrimSpace(req.Board),
		req.HeroStack, req.VillainStack, req.Pot, req.ToCall,
		req.DeadlineMs, req.Iterations,
	)
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	out, _ := json.Marshal(advice)
	return string(out), nil
}

// CoachingTip returns Smart HUD coaching alerts (MCP-ready analysis surface).
func CoachingTip(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	if err := guardRTA(payload); err != nil { // S-1
		return "", err
	}
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
