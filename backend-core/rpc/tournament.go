package rpc

import (
	"context"
	"database/sql"
	"encoding/json"
	"time"

	"github.com/heroiclabs/nakama-common/runtime"

	"github.com/smithdouglas404/poker-next-gen/backend-core/match/tournament"
	"github.com/smithdouglas404/poker-next-gen/backend-core/models"
	"github.com/smithdouglas404/poker-next-gen/backend-core/store"
)

func TournamentCreate(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	var req models.TournamentBracket
	if err := json.Unmarshal([]byte(payload), &req); err != nil {
		return "", runtime.NewError("invalid payload", 3)
	}
	if req.Name == "" {
		return "", runtime.NewError("name required", 3)
	}
	if req.Variant == "" {
		req.Variant = "texas-holdem"
	}
	if req.StartingStack == 0 {
		req.StartingStack = 10000
	}
	if req.MaxPlayers == 0 {
		req.MaxPlayers = 180
	}
	if req.MaxSeatsPerTable == 0 {
		req.MaxSeatsPerTable = 6
	}
	if req.ScheduledAt.IsZero() {
		req.ScheduledAt = time.Now().UTC()
	}
	req.Status = "registering"
	if err := store.NewTournamentStore(db).Create(ctx, &req); err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	out, _ := json.Marshal(req)
	return string(out), nil
}

func TournamentList(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	list, err := store.NewTournamentStore(db).List(ctx)
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	out, _ := json.Marshal(map[string]interface{}{"tournaments": list})
	return string(out), nil
}

func TournamentRegister(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	var req struct {
		TournamentID string `json:"tournament_id"`
	}
	if err := json.Unmarshal([]byte(payload), &req); err != nil {
		return "", runtime.NewError("invalid payload", 3)
	}
	userID, ok := ctx.Value(runtime.RUNTIME_CTX_USER_ID).(string)
	if !ok || userID == "" {
		return "", runtime.NewError("unauthorized", 16)
	}
	username, _ := ctx.Value(runtime.RUNTIME_CTX_USERNAME).(string)

	tStore := store.NewTournamentStore(db)
	tournaments, err := tStore.List(ctx)
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	var stack int64 = 10000
	for _, t := range tournaments {
		if t.ID == req.TournamentID {
			stack = t.StartingStack
			if t.BuyInMinor > 0 {
				wStore := store.NewWalletStore(db)
				if err := wStore.Debit(ctx, userID, t.BuyInMinor); err != nil {
					return "", runtime.NewError("insufficient wallet balance", 9)
				}
			}
			break
		}
	}
	if err := tStore.Register(ctx, req.TournamentID, userID, username, stack); err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	return `{"ok":true}`, nil
}

func BlindLevelAdd(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	var req models.BlindTimer
	if err := json.Unmarshal([]byte(payload), &req); err != nil {
		return "", runtime.NewError("invalid payload", 3)
	}
	if req.TournamentID == "" {
		return "", runtime.NewError("tournament_id required", 3)
	}
	if req.DurationSecs == 0 {
		req.DurationSecs = 600
	}
	if err := store.NewTournamentStore(db).AddBlindLevel(ctx, &req); err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	out, _ := json.Marshal(req)
	return string(out), nil
}

func BlindLevelList(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	var req struct {
		TournamentID string `json:"tournament_id"`
	}
	if err := json.Unmarshal([]byte(payload), &req); err != nil {
		return "", runtime.NewError("invalid payload", 3)
	}
	levels, err := store.NewTournamentStore(db).ListBlinds(ctx, req.TournamentID)
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	out, _ := json.Marshal(map[string]interface{}{"levels": levels})
	return string(out), nil
}

func PrizePoolAdd(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	var req models.PrizeDistributionPool
	if err := json.Unmarshal([]byte(payload), &req); err != nil {
		return "", runtime.NewError("invalid payload", 3)
	}
	if req.TournamentID == "" {
		return "", runtime.NewError("tournament_id required", 3)
	}
	if err := store.NewTournamentStore(db).AddPrizeTier(ctx, &req); err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	out, _ := json.Marshal(req)
	return string(out), nil
}

func PrizePoolList(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	var req struct {
		TournamentID string `json:"tournament_id"`
	}
	if err := json.Unmarshal([]byte(payload), &req); err != nil {
		return "", runtime.NewError("invalid payload", 3)
	}
	prizes, err := store.NewTournamentStore(db).ListPrizes(ctx, req.TournamentID)
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	out, _ := json.Marshal(map[string]interface{}{"prizes": prizes})
	return string(out), nil
}

func BalancingRuleSet(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	var req models.MultiTableBalancingRule
	if err := json.Unmarshal([]byte(payload), &req); err != nil {
		return "", runtime.NewError("invalid payload", 3)
	}
	if req.TournamentID == "" {
		return "", runtime.NewError("tournament_id required", 3)
	}
	if req.Strategy == "" {
		req.Strategy = "balanced"
	}
	if req.MaxSeatDifference == 0 {
		req.MaxSeatDifference = 1
	}
	if req.BreakTableAtOrBelow == 0 {
		req.BreakTableAtOrBelow = 2
	}
	if err := store.NewTournamentStore(db).SetBalancingRule(ctx, &req); err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	out, _ := json.Marshal(req)
	return string(out), nil
}

func TournamentStart(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	var req struct {
		TournamentID string `json:"tournament_id"`
	}
	if err := json.Unmarshal([]byte(payload), &req); err != nil {
		return "", runtime.NewError("invalid payload", 3)
	}
	if req.TournamentID == "" {
		return "", runtime.NewError("tournament_id required", 3)
	}
	directorID, tables, err := tournament.StartTournament(ctx, nk, db, req.TournamentID)
	if err != nil {
		return "", err
	}
	out, _ := json.Marshal(map[string]interface{}{
		"director_match_id": directorID,
		"table_match_ids":   tables,
		"status":            "running",
	})
	return string(out), nil
}
