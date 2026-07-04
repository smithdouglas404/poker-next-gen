package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"time"

	"github.com/heroiclabs/nakama-common/runtime"

	"github.com/smithdouglas404/poker-next-gen/backend-core/match/holdem"
	"github.com/smithdouglas404/poker-next-gen/backend-core/match/tournament"
	"github.com/smithdouglas404/poker-next-gen/backend-core/models"
	"github.com/smithdouglas404/poker-next-gen/backend-core/protocol"
	"github.com/smithdouglas404/poker-next-gen/backend-core/rpc"
	"github.com/smithdouglas404/poker-next-gen/backend-core/store"
)

func InitModule(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, initializer runtime.Initializer) error {
	start := time.Now()

	if err := store.Migrate(ctx, db); err != nil {
		logger.Error("schema migration failed: %v", err)
		return err
	}

	rpcs := map[string]func(context.Context, runtime.Logger, *sql.DB, runtime.NakamaModule, string) (string, error){
		"healthz":              rpc.Healthz,
		"club_create":          rpc.ClubCreate,
		"club_list":            rpc.ClubList,
		"club_owner_add":       rpc.ClubOwnerAdd,
		"balance_allocate":     rpc.BalanceAllocate,
		"balance_get":          rpc.BalanceGet,
		"rake_config_set":      rpc.RakeConfigSet,
		"rake_config_get":      rpc.RakeConfigGet,
		"rake_ledger_get":      rpc.RakeLedgerGet,
		"table_create":         rpc.TableCreate,
		"table_list":           rpc.TableList,
		"tournament_create":    rpc.TournamentCreate,
		"tournament_list":      rpc.TournamentList,
		"tournament_register":  rpc.TournamentRegister,
		"tournament_start":     rpc.TournamentStart,
		"blind_level_add":      rpc.BlindLevelAdd,
		"blind_level_list":     rpc.BlindLevelList,
		"prize_pool_add":       rpc.PrizePoolAdd,
		"prize_pool_list":      rpc.PrizePoolList,
		"balancing_rule_set":   rpc.BalancingRuleSet,
		"wallet_get":           rpc.WalletGet,
		"profile_get":          rpc.ProfileGet,
		"matchmaker_enqueue":   rpc.MatchmakerEnqueue,
		"equity_estimate":      rpc.EquityEstimate,
		"hand_rank":            rpc.HandRank,
	}
	for id, fn := range rpcs {
		if err := initializer.RegisterRpc(id, fn); err != nil {
			return err
		}
	}

	if err := initializer.RegisterMatch(protocol.MatchModule, func(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule) (runtime.Match, error) {
		return &holdem.Handler{}, nil
	}); err != nil {
		return err
	}

	if err := initializer.RegisterMatch(protocol.TournamentModule, func(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule) (runtime.Match, error) {
		return &tournament.Handler{}, nil
	}); err != nil {
		return err
	}

	if err := initializer.RegisterMatchmakerMatched(onMatchmakerMatched); err != nil {
		return err
	}

	logger.Info("poker-next-gen backend-core loaded in %s (engine-math/rs_poker required — no local fallbacks)", time.Since(start))
	logger.Info(
		"registered schemas: clubs=%T owners=%T balances=%T rake=%T brackets=%T balancing=%T blinds=%T prizes=%T",
		models.Club{}, models.Owner{}, models.PlayerAllocatedBalance{}, models.CustomRakeConfiguration{},
		models.TournamentBracket{}, models.MultiTableBalancingRule{}, models.BlindTimer{}, models.PrizeDistributionPool{},
	)
	return nil
}

func onMatchmakerMatched(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, entries []runtime.MatchmakerEntry) (string, error) {
	if len(entries) == 0 {
		return "", runtime.NewError("no matchmaker entries", 3)
	}

	sb := int64(100)
	bb := int64(200)
	buyIn := int64(100000)
	clubID := ""
	for _, e := range entries {
		for k, v := range e.GetProperties() {
			switch k {
			case "buy_in_cents":
				switch n := v.(type) {
				case string:
					var parsed int64
					_ = json.Unmarshal([]byte(n), &parsed)
					if parsed > 0 {
						buyIn = parsed
					}
				case float64:
					if int64(n) > 0 {
						buyIn = int64(n)
					}
				}
			case "club_id":
				if s, ok := v.(string); ok {
					clubID = s
				}
			}
		}
	}

	params := map[string]interface{}{
		"room_id":     "matchmaker",
		"small_blind": sb,
		"big_blind":   bb,
		"buy_in":      buyIn,
	}
	if clubID != "" {
		params["club_id"] = clubID
	}

	matchID, err := nk.MatchCreate(ctx, protocol.MatchModule, params)
	if err != nil {
		return "", err
	}
	return matchID, nil
}
