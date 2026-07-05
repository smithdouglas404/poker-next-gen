package rpc

import (
	"context"
	"database/sql"
	"encoding/json"
	"strings"

	"github.com/heroiclabs/nakama-common/runtime"

	"github.com/smithdouglas404/poker-next-gen/backend-core/models"
	"github.com/smithdouglas404/poker-next-gen/backend-core/store"
)

// callerID returns the authenticated user id, or an error if the call is not
// user-authenticated (server-key/HTTP calls have no user context).
func callerID(ctx context.Context) (string, error) {
	userID, _ := ctx.Value(runtime.RUNTIME_CTX_USER_ID).(string)
	if userID == "" {
		return "", runtime.NewError("unauthorized", 16)
	}
	return userID, nil
}

// requireClubConfigurer authorizes the caller as an owner/configurer of the
// club. Without this, any authenticated player could allocate themselves club
// chips, add themselves as an owner, change rake, or read the house ledger.
func requireClubConfigurer(ctx context.Context, db *sql.DB, clubID string) (string, error) {
	userID, err := callerID(ctx)
	if err != nil {
		return "", err
	}
	if clubID == "" {
		return "", runtime.NewError("club_id required", 3)
	}
	owners, err := store.NewClubStore(db).ListOwners(ctx, clubID)
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	for _, o := range owners {
		if o.UserID == userID && (o.CanConfigure || o.Role == "owner") {
			return userID, nil
		}
	}
	return "", runtime.NewError("forbidden: not a club owner/configurer", 7)
}

func ClubCreate(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	var club models.Club
	if payload != "" {
		if err := json.Unmarshal([]byte(payload), &club); err != nil {
			return "", runtime.NewError("invalid payload", 3)
		}
	}
	if club.Name == "" {
		return "", runtime.NewError("name required", 3)
	}
	if club.Slug == "" {
		club.Slug = strings.ToLower(strings.ReplaceAll(club.Name, " ", "-"))
	}
	if club.Currency == "" {
		club.Currency = "USD"
	}
	club.IsActive = true

	userID, _ := ctx.Value(runtime.RUNTIME_CTX_USER_ID).(string)
	clubStore := store.NewClubStore(db)
	if err := clubStore.Create(ctx, &club); err != nil {
		logger.Error("club create: %v", err)
		return "", runtime.NewError("failed to create club", 13)
	}
	if userID != "" {
		_ = clubStore.AddOwner(ctx, &models.Owner{
			ClubID:       club.ID,
			UserID:       userID,
			Role:         "owner",
			EquityBps:    10000,
			CanConfigure: true,
		})
	}
	out, err := json.Marshal(club)
	if err != nil {
		return "", err
	}
	return string(out), nil
}

func ClubList(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	clubs, err := store.NewClubStore(db).List(ctx)
	if err != nil {
		return "", runtime.NewError("failed to list clubs", 13)
	}
	out, _ := json.Marshal(map[string]interface{}{"clubs": clubs})
	return string(out), nil
}

func ClubOwnerAdd(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	var req models.Owner
	if err := json.Unmarshal([]byte(payload), &req); err != nil {
		return "", runtime.NewError("invalid payload", 3)
	}
	if req.ClubID == "" || req.UserID == "" {
		return "", runtime.NewError("club_id and user_id required", 3)
	}
	if _, err := requireClubConfigurer(ctx, db, req.ClubID); err != nil {
		return "", err
	}
	if req.Role == "" {
		req.Role = "manager"
	}
	if err := store.NewClubStore(db).AddOwner(ctx, &req); err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	out, _ := json.Marshal(req)
	return string(out), nil
}

func BalanceAllocate(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	var req models.PlayerAllocatedBalance
	if err := json.Unmarshal([]byte(payload), &req); err != nil {
		return "", runtime.NewError("invalid payload", 3)
	}
	if req.ClubID == "" || req.UserID == "" {
		return "", runtime.NewError("club_id and user_id required", 3)
	}
	// Only a club owner/configurer may allocate chips — otherwise any player
	// could mint themselves an unlimited buy-in bankroll.
	if _, err := requireClubConfigurer(ctx, db, req.ClubID); err != nil {
		return "", err
	}
	if req.Currency == "" {
		req.Currency = "USD"
	}
	if err := store.NewClubStore(db).AllocateBalance(ctx, &req); err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	out, _ := json.Marshal(req)
	return string(out), nil
}

func BalanceGet(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	var req struct {
		ClubID string `json:"club_id"`
		UserID string `json:"user_id"`
	}
	if err := json.Unmarshal([]byte(payload), &req); err != nil {
		return "", runtime.NewError("invalid payload", 3)
	}
	// A player may read their own balance; anyone else must be a club configurer.
	caller, err := callerID(ctx)
	if err != nil {
		return "", err
	}
	if req.UserID == "" {
		req.UserID = caller
	}
	if req.UserID != caller {
		if _, err := requireClubConfigurer(ctx, db, req.ClubID); err != nil {
			return "", err
		}
	}
	bal, err := store.NewClubStore(db).GetBalance(ctx, req.ClubID, req.UserID)
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	out, _ := json.Marshal(bal)
	return string(out), nil
}

func RakeConfigSet(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	var req models.CustomRakeConfiguration
	if err := json.Unmarshal([]byte(payload), &req); err != nil {
		return "", runtime.NewError("invalid payload", 3)
	}
	if req.ClubID == "" {
		return "", runtime.NewError("club_id required", 3)
	}
	if _, err := requireClubConfigurer(ctx, db, req.ClubID); err != nil {
		return "", err
	}
	if req.Name == "" {
		req.Name = "Standard"
	}
	req.IsActive = true
	if err := store.NewClubStore(db).SetRake(ctx, &req); err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	out, _ := json.Marshal(req)
	return string(out), nil
}

func RakeConfigGet(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	var req struct {
		ClubID string `json:"club_id"`
	}
	if err := json.Unmarshal([]byte(payload), &req); err != nil {
		return "", runtime.NewError("invalid payload", 3)
	}
	rake, err := store.NewClubStore(db).GetRake(ctx, req.ClubID)
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	out, _ := json.Marshal(rake)
	return string(out), nil
}

func RakeLedgerGet(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	var req struct {
		ClubID string `json:"club_id"`
	}
	if err := json.Unmarshal([]byte(payload), &req); err != nil {
		return "", runtime.NewError("invalid payload", 3)
	}
	if _, err := requireClubConfigurer(ctx, db, req.ClubID); err != nil {
		return "", err
	}
	rakeStore := store.NewRakeStore(db)
	balance, err := rakeStore.HouseBalance(ctx, req.ClubID)
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	ledger, err := rakeStore.Ledger(ctx, req.ClubID, 50)
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	out, _ := json.Marshal(map[string]interface{}{
		"house_balance": balance,
		"ledger":        ledger,
	})
	return string(out), nil
}
