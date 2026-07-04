package main

import (
	"context"
	"database/sql"
	"time"

	"github.com/heroiclabs/nakama-common/runtime"

	"github.com/smithdouglas404/poker-next-gen/backend-core/match/holdem"
	"github.com/smithdouglas404/poker-next-gen/backend-core/models"
	"github.com/smithdouglas404/poker-next-gen/backend-core/protocol"
	"github.com/smithdouglas404/poker-next-gen/backend-core/rpc"
)

func InitModule(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, initializer runtime.Initializer) error {
	start := time.Now()

	if err := initializer.RegisterRpc("healthz", rpc.Healthz); err != nil {
		return err
	}
	if err := initializer.RegisterRpc("club_create", rpc.ClubCreate); err != nil {
		return err
	}
	if err := initializer.RegisterRpc("table_create", rpc.TableCreate); err != nil {
		return err
	}
	if err := initializer.RegisterRpc("table_list", rpc.TableList); err != nil {
		return err
	}

	if err := initializer.RegisterMatch(protocol.MatchModule, func(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule) (runtime.Match, error) {
		return &holdem.Handler{}, nil
	}); err != nil {
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
