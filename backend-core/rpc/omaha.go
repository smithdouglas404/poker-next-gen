package rpc

import (
	"context"
	"database/sql"
	"encoding/json"
	"strings"

	"github.com/heroiclabs/nakama-common/runtime"

	"github.com/smithdouglas404/poker-next-gen/backend-core/poker/enginemath"
)

type omahaRankRequest struct {
	Hole  string `json:"hole"`
	Board string `json:"board"`
}

type omahaShowdownRequest struct {
	Holes []string `json:"holes"`
	Board string   `json:"board"`
}

// OmahaRank returns rs_poker Omaha category for hole + board.
func OmahaRank(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	var req omahaRankRequest
	if payload != "" {
		_ = json.Unmarshal([]byte(payload), &req)
	}
	if req.Hole == "" {
		return "", runtime.NewError("hole required", 3)
	}
	cat, err := enginemath.RankOmaha(req.Hole, strings.TrimSpace(req.Board))
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	out, _ := json.Marshal(map[string]string{"category": cat, "variant": "omaha", "engine": "rs_poker"})
	return string(out), nil
}

// OmahaShowdown resolves Omaha side-by-side hands via rs_poker.
func OmahaShowdown(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	var req omahaShowdownRequest
	if payload != "" {
		_ = json.Unmarshal([]byte(payload), &req)
	}
	if len(req.Holes) < 2 {
		return "", runtime.NewError("need at least two Omaha hands", 3)
	}
	winners, cats, err := enginemath.ResolveOmahaShowdown(req.Holes, strings.TrimSpace(req.Board))
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	out, _ := json.Marshal(map[string]any{
		"winners":    winners,
		"categories": cats,
		"variant":    "omaha",
		"engine":     "rs_poker",
	})
	return string(out), nil
}
