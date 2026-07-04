package rpc

import (
	"context"
	"database/sql"
	"encoding/json"
	"time"

	"github.com/heroiclabs/nakama-common/runtime"
)

func Healthz(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	resp, err := json.Marshal(map[string]any{
		"status":  "ok",
		"service": "backend-core",
		"time":    time.Now().UTC().Format(time.RFC3339),
	})
	if err != nil {
		return "", err
	}
	return string(resp), nil
}

