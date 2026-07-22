package rpc

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"time"

	"github.com/heroiclabs/nakama-common/runtime"

	"github.com/smithdouglas404/poker-next-gen/backend-core/match/tournament"
	"github.com/smithdouglas404/poker-next-gen/backend-core/models"
	"github.com/smithdouglas404/poker-next-gen/backend-core/store"
)

// requireTournamentOwner authorizes a mutation on an existing tournament: the
// caller must be its creator, or a configurer of its owning club. Returns the
// caller id. (SEC-1 — these RPCs were previously unauthenticated.)
func requireTournamentOwner(ctx context.Context, db *sql.DB, tournamentID string) (string, error) {
	uid, err := callerID(ctx)
	if err != nil {
		return "", err
	}
	if tournamentID == "" {
		return "", runtime.NewError("tournament_id required", 3)
	}
	t, err := store.NewTournamentStore(db).Get(ctx, tournamentID)
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	if t == nil {
		return "", runtime.NewError("tournament not found", 5)
	}
	if t.CreatedBy != "" && t.CreatedBy == uid {
		return uid, nil
	}
	if t.ClubID != "" {
		if _, cerr := requireClubConfigurer(ctx, db, t.ClubID); cerr == nil {
			return uid, nil
		}
	}
	return "", runtime.NewError("forbidden: not the tournament owner", 7)
}

func TournamentCreate(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	var req models.TournamentBracket
	if err := json.Unmarshal([]byte(payload), &req); err != nil {
		return "", runtime.NewError("invalid payload", 3)
	}
	// Auth mandatory: record the creator, and if the tournament is club-owned the
	// caller must be a configurer of that club.
	uid, err := callerID(ctx)
	if err != nil {
		return "", err
	}
	if req.ClubID != "" {
		if _, cerr := requireClubConfigurer(ctx, db, req.ClubID); cerr != nil {
			return "", cerr
		}
	}
	req.CreatedBy = uid
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
				if err := wStore.Debit(ctx, userID, t.BuyInMinor, "tournament_buyin"); err != nil {
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
	if _, err := requireTournamentOwner(ctx, db, req.TournamentID); err != nil {
		return "", err
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
	if _, err := requireTournamentOwner(ctx, db, req.TournamentID); err != nil {
		return "", err
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
	if _, err := requireTournamentOwner(ctx, db, req.TournamentID); err != nil {
		return "", err
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
	if _, err := requireTournamentOwner(ctx, db, req.TournamentID); err != nil {
		return "", err
	}
	// Structure invariant (SEC-1 / P0-8): a tournament may only start with at
	// least one blind level and prize tiers that sum to exactly 100% (10000 bps).
	tStore := store.NewTournamentStore(db)
	blinds, err := tStore.ListBlinds(ctx, req.TournamentID)
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	if len(blinds) == 0 {
		return "", runtime.NewError("cannot start: no blind levels defined", 9)
	}
	prizes, err := tStore.ListPrizes(ctx, req.TournamentID)
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	var totalBps int32
	for _, p := range prizes {
		totalBps += p.PayoutBps
	}
	if totalBps != 10000 {
		return "", runtime.NewError(fmt.Sprintf("cannot start: prize tiers must total 100%% (10000 bps), got %d", totalBps), 9)
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
