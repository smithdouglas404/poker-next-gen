package rpc

import (
	"context"
	"database/sql"
	"encoding/json"

	"github.com/heroiclabs/nakama-common/runtime"

	"github.com/smithdouglas404/poker-next-gen/backend-core/integrations"
	"github.com/smithdouglas404/poker-next-gen/backend-core/store"
)

// AnchorRun batches the unanchored audit events, computes their Merkle root, and
// submits ONE anchoring tx (via the Polygon relay), stamping the events with the
// tx hash. Admin-gated; intended to be called on a schedule (cron) or on demand.
func AnchorRun(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	callerID, _ := ctx.Value(runtime.RUNTIME_CTX_USER_ID).(string)
	if !isAdmin(callerID) {
		return "", runtime.NewError("forbidden", 7)
	}
	if !integrations.PolygonAnchorConfigured() {
		out, _ := json.Marshal(map[string]interface{}{
			"configured": false,
			"message":    "On-chain anchoring isn't configured (set POLYGON_ANCHOR_URL).",
		})
		return string(out), nil
	}
	var req struct {
		Limit int `json:"limit"`
	}
	if payload != "" {
		_ = json.Unmarshal([]byte(payload), &req)
	}

	as := store.NewAnchorStore(db)
	ids, hashes, err := as.UnanchoredEvents(ctx, req.Limit)
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	if len(ids) == 0 {
		return `{"configured":true,"anchored":0,"message":"nothing to anchor"}`, nil
	}
	root := store.MerkleRoot(hashes)
	batchID, err := as.CreateBatch(ctx, root, len(ids), "polygon")
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	txHash, err := integrations.SubmitMerkleRoot(ctx, root, len(ids))
	if err != nil {
		logger.Error("anchor submit failed: %v", err)
		_ = as.MarkFailed(ctx, batchID)
		return "", runtime.NewError("anchor submission failed", 13)
	}
	if err := as.MarkAnchored(ctx, batchID, txHash, ids); err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	out, _ := json.Marshal(map[string]interface{}{
		"configured":  true,
		"anchored":    len(ids),
		"merkle_root": root,
		"tx_hash":     txHash,
	})
	return string(out), nil
}

// AnchorStatus returns the latest anchored batch (public — powers the
// provably-fair page's "anchored to Polygon" proof).
func AnchorStatus(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	latest, err := store.NewAnchorStore(db).Latest(ctx)
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	out, _ := json.Marshal(map[string]interface{}{
		"configured": integrations.PolygonAnchorConfigured(),
		"latest":     latest,
	})
	return string(out), nil
}
