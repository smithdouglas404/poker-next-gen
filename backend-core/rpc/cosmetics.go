package rpc

import (
	"context"
	"database/sql"
	"encoding/json"

	"github.com/heroiclabs/nakama-common/runtime"

	"github.com/smithdouglas404/poker-next-gen/backend-core/store"
)

// CosmeticList returns the active catalog (optionally filtered by ?kind).
func CosmeticList(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	var req struct {
		Kind string `json:"kind"`
	}
	if payload != "" {
		_ = json.Unmarshal([]byte(payload), &req)
	}
	items, err := store.NewCosmeticStore(db).ListActive(ctx, req.Kind)
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	out, _ := json.Marshal(map[string]interface{}{"cosmetics": items})
	return string(out), nil
}

// InventoryList returns the caller's owned cosmetics + equipped ids.
func InventoryList(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	userID, err := callerID(ctx)
	if err != nil {
		return "", err
	}
	cs := store.NewCosmeticStore(db)
	items, err := cs.Inventory(ctx, userID)
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	equipped, _ := cs.Equipped(ctx, userID)
	out, _ := json.Marshal(map[string]interface{}{"inventory": items, "equipped": equipped})
	return string(out), nil
}

// CosmeticEquip equips an owned cosmetic for its kind.
func CosmeticEquip(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	userID, err := callerID(ctx)
	if err != nil {
		return "", err
	}
	var req struct {
		CosmeticID string `json:"cosmetic_id"`
	}
	if err := json.Unmarshal([]byte(payload), &req); err != nil || req.CosmeticID == "" {
		return "", runtime.NewError("cosmetic_id required", 3)
	}
	cs := store.NewCosmeticStore(db)
	c, err := cs.GetByID(ctx, req.CosmeticID)
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	if c == nil {
		return "", runtime.NewError("cosmetic not found", 5)
	}
	if !cs.Owns(ctx, userID, req.CosmeticID) {
		return "", runtime.NewError("you don't own this item", 7)
	}
	if err := cs.Equip(ctx, userID, c.Kind, req.CosmeticID); err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	return `{"ok":true}`, nil
}
