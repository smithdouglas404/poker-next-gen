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
