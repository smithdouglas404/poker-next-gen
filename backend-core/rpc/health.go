package rpc

import (
	"context"
	"database/sql"
	"encoding/json"
	"time"

	"github.com/heroiclabs/nakama-common/runtime"

	"github.com/smithdouglas404/poker-next-gen/backend-core/models"
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

func ClubCreate(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	var club models.Club
	if payload != "" {
		if err := json.Unmarshal([]byte(payload), &club); err != nil {
			return "", err
		}
	}
	now := time.Now().UTC()
	club.CreatedAt = now
	club.UpdatedAt = now
	if club.Currency == "" {
		club.Currency = "USD"
	}
	club.IsActive = true
	out, err := json.Marshal(club)
	if err != nil {
		return "", err
	}
	return string(out), nil
}
