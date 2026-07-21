package rpc

import (
	"context"
	"database/sql"
	"encoding/base64"
	"encoding/json"

	"github.com/heroiclabs/nakama-common/runtime"

	"github.com/smithdouglas404/poker-next-gen/backend-core/store"
)

// ModelAsset returns a durably re-hosted generated character GLB (base64) by
// cosmetic id. Deliberately public — every player at a table must be able to
// load the others' equipped models — so there is no owner check. The browser
// reaches this through the /api/model/<id> route, never directly.
func ModelAsset(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	var req struct {
		CosmeticID string `json:"cosmetic_id"`
	}
	if err := json.Unmarshal([]byte(payload), &req); err != nil || req.CosmeticID == "" {
		return "", runtime.NewError("cosmetic_id required", 3)
	}
	ct, data, err := store.NewModelAssetStore(db).Get(ctx, req.CosmeticID)
	if err != nil {
		return "", runtime.NewError("asset lookup failed", 13)
	}
	if data == nil {
		return "", runtime.NewError("asset not found", 5)
	}
	out, _ := json.Marshal(map[string]interface{}{
		"content_type": ct,
		"data_base64":  base64.StdEncoding.EncodeToString(data),
	})
	return string(out), nil
}
