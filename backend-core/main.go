// Package main is the Nakama Go runtime plugin for the Poker Next-Gen network.
//
// Nakama loads this package as a shared object (buildmode=plugin) and invokes
// InitModule at boot. Here we register server-authoritative RPCs and surface
// the persistence models for the private club and global tournament systems.
package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"time"

	"github.com/heroiclabs/nakama-common/runtime"

	"github.com/smithdouglas404/poker-next-gen/backend-core/models"
)

// InitModule is the entrypoint Nakama calls when loading this Go plugin.
func InitModule(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, initializer runtime.Initializer) error {
	start := time.Now()

	if err := initializer.RegisterRpc("healthz", rpcHealthz); err != nil {
		return err
	}
	if err := initializer.RegisterRpc("club_create", rpcClubCreate); err != nil {
		return err
	}

	logger.Info("poker-next-gen backend-core loaded in %s", time.Since(start))
	logger.Info(
		"registered schemas: clubs=%T owners=%T balances=%T rake=%T brackets=%T balancing=%T blinds=%T prizes=%T",
		models.Club{}, models.Owner{}, models.PlayerAllocatedBalance{}, models.CustomRakeConfiguration{},
		models.TournamentBracket{}, models.MultiTableBalancingRule{}, models.BlindTimer{}, models.PrizeDistributionPool{},
	)
	return nil
}

// rpcHealthz is a lightweight liveness probe exposed to clients and load
// balancers via the Nakama RPC gateway.
func rpcHealthz(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
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

// rpcClubCreate is a minimal example RPC demonstrating use of the Club model.
func rpcClubCreate(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
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
