package rpc

import (
	"context"
	"database/sql"
	"encoding/json"
	"strings"

	"github.com/heroiclabs/nakama-common/runtime"

	"github.com/smithdouglas404/poker-next-gen/backend-core/poker/enginemath"
)

type equityRequest struct {
	Holes      []string `json:"holes"`
	Board      string   `json:"board"`
	Iterations int      `json:"iterations"`
}

type handRankRequest struct {
	Cards string `json:"cards"`
}

// EquityEstimate proxies Monte Carlo equity to engine-math (rs_poker).
func EquityEstimate(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	var req equityRequest
	if payload != "" {
		_ = json.Unmarshal([]byte(payload), &req)
	}
	if len(req.Holes) < 2 {
		return "", runtime.NewError("need at least two hole hands", 3)
	}
	if !enginemath.Available() {
		return "", runtime.NewError("engine-math sidecar unavailable", 14)
	}
	iters := req.Iterations
	if iters <= 0 {
		iters = 2000
	}
	eq, err := enginemath.EstimateEquity(req.Holes, strings.TrimSpace(req.Board), iters)
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	out, _ := json.Marshal(map[string]interface{}{
		"equity":     eq,
		"iterations": iters,
		"engine":     "rs_poker",
	})
	return string(out), nil
}

// HandRank returns rs_poker category for a concatenated card string.
func HandRank(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	var req handRankRequest
	if payload != "" {
		_ = json.Unmarshal([]byte(payload), &req)
	}
	if req.Cards == "" {
		return "", runtime.NewError("cards required", 3)
	}
	if !enginemath.Available() {
		return "", runtime.NewError("engine-math sidecar unavailable", 14)
	}
	cat, err := enginemath.RankHand(req.Cards)
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	out, _ := json.Marshal(map[string]string{
		"category": cat,
		"engine":   "rs_poker",
	})
	return string(out), nil
}
