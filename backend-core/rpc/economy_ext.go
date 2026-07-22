package rpc

import (
	"context"
	"database/sql"
	"encoding/json"

	"github.com/heroiclabs/nakama-common/runtime"

	"github.com/smithdouglas404/poker-next-gen/backend-core/integrations"
	"github.com/smithdouglas404/poker-next-gen/backend-core/store"
)

// WalletBalances returns the caller's per-bucket balances (main / cash_game /
// sng / tournament / bonus). Part of the deferred multi-wallet surface; the
// bucket ledger is separate from the single global wallet.
func WalletBalances(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	userID, err := callerID(ctx)
	if err != nil {
		return "", err
	}
	buckets, err := store.NewEconomyExtStore(db).BucketBalances(ctx, userID)
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	out, _ := json.Marshal(map[string]interface{}{"buckets": buckets})
	return string(out), nil
}

// WalletTransfer atomically moves funds between two of the caller's buckets.
func WalletTransfer(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	userID, err := callerID(ctx)
	if err != nil {
		return "", err
	}
	var req struct {
		From        string `json:"from"`
		To          string `json:"to"`
		AmountCents int64  `json:"amount_cents"`
	}
	if err := json.Unmarshal([]byte(payload), &req); err != nil {
		return "", runtime.NewError("invalid payload", 3)
	}
	if req.From == "" || req.To == "" {
		return "", runtime.NewError("from and to buckets required", 3)
	}
	if req.AmountCents <= 0 {
		return "", runtime.NewError("amount must be positive", 3)
	}
	if err := store.NewEconomyExtStore(db).TransferBucket(ctx, userID, req.From, req.To, req.AmountCents); err != nil {
		switch err.Error() {
		case "insufficient balance":
			return "", runtime.NewError("insufficient balance in "+req.From, 9)
		case "source and destination buckets must differ", "unknown bucket", "amount must be positive":
			return "", runtime.NewError(err.Error(), 3)
		default:
			return "", runtime.NewError(err.Error(), 13)
		}
	}
	buckets, _ := store.NewEconomyExtStore(db).BucketBalances(ctx, userID)
	out, _ := json.Marshal(map[string]interface{}{"ok": true, "buckets": buckets})
	return string(out), nil
}

// CosmeticBuy debits the caller's wallet by the cosmetic price and grants it to
// their inventory. Refunds on any grant failure so a charge never strands.
func CosmeticBuy(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
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
	if c == nil || !c.Active {
		return "", runtime.NewError("cosmetic not available", 5)
	}
	if cs.Owns(ctx, userID, req.CosmeticID) {
		return "", runtime.NewError("you already own this item", 6)
	}

	if c.PriceCents > 0 {
		if err := store.NewWalletStore(db).Debit(ctx, userID, c.PriceCents, "cosmetic_buy"); err != nil {
			return "", runtime.NewError("purchase requires a balance of "+dollars(c.PriceCents)+" — add funds", 9)
		}
	}
	if err := cs.Grant(ctx, userID, req.CosmeticID, "shop"); err != nil {
		if c.PriceCents > 0 {
			_ = store.NewWalletStore(db).Credit(ctx, userID, c.PriceCents, "cosmetic_buy_refund")
		}
		return "", runtime.NewError(err.Error(), 13)
	}
	out, _ := json.Marshal(map[string]interface{}{"ok": true, "cosmetic_id": req.CosmeticID})
	return string(out), nil
}

// CosmeticWishlistAdd adds a cosmetic to the caller's wishlist.
func CosmeticWishlistAdd(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
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
	if err := store.NewEconomyExtStore(db).WishlistAdd(ctx, userID, req.CosmeticID); err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	return `{"ok":true}`, nil
}

// CosmeticWishlistRemove drops a cosmetic from the caller's wishlist.
func CosmeticWishlistRemove(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
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
	if err := store.NewEconomyExtStore(db).WishlistRemove(ctx, userID, req.CosmeticID); err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	return `{"ok":true}`, nil
}

// CosmeticWishlistList returns the caller's wishlisted cosmetics.
func CosmeticWishlistList(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	userID, err := callerID(ctx)
	if err != nil {
		return "", err
	}
	items, err := store.NewEconomyExtStore(db).WishlistList(ctx, userID)
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	out, _ := json.Marshal(map[string]interface{}{"wishlist": items})
	return string(out), nil
}

// CosmeticDyeGet returns the caller's saved dye params for a cosmetic.
func CosmeticDyeGet(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
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
	params, err := store.NewEconomyExtStore(db).DyeGet(ctx, userID, req.CosmeticID)
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	if params == "" {
		params = "{}"
	}
	out, _ := json.Marshal(map[string]interface{}{
		"cosmetic_id": req.CosmeticID,
		"params":      json.RawMessage(params),
	})
	return string(out), nil
}

// CosmeticDyeSet stores the caller's dye params for an owned cosmetic.
func CosmeticDyeSet(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	userID, err := callerID(ctx)
	if err != nil {
		return "", err
	}
	var req struct {
		CosmeticID string          `json:"cosmetic_id"`
		Params     json.RawMessage `json:"params"`
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
	params := "{}"
	if len(req.Params) > 0 {
		params = string(req.Params)
	}
	if err := store.NewEconomyExtStore(db).DyeSet(ctx, userID, req.CosmeticID, params); err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	return `{"ok":true}`, nil
}

// LoadoutSave stores a named, multi-slot outfit for the caller.
func LoadoutSave(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	userID, err := callerID(ctx)
	if err != nil {
		return "", err
	}
	var req struct {
		Name  string            `json:"name"`
		Slots map[string]string `json:"slots"`
	}
	if err := json.Unmarshal([]byte(payload), &req); err != nil {
		return "", runtime.NewError("invalid payload", 3)
	}
	if req.Name == "" {
		return "", runtime.NewError("name required", 3)
	}
	slotsJSON, _ := json.Marshal(req.Slots)
	id, err := store.NewEconomyExtStore(db).LoadoutSave(ctx, userID, req.Name, string(slotsJSON))
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	out, _ := json.Marshal(map[string]interface{}{"loadout_id": id})
	return string(out), nil
}

// LoadoutList returns the caller's saved loadouts.
func LoadoutList(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	userID, err := callerID(ctx)
	if err != nil {
		return "", err
	}
	items, err := store.NewEconomyExtStore(db).LoadoutList(ctx, userID)
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	out, _ := json.Marshal(map[string]interface{}{"loadouts": items})
	return string(out), nil
}

// LoadoutEquip equips every owned cosmetic in a saved loadout's slots. Slots the
// caller doesn't own are skipped (reported), never silently equipped.
func LoadoutEquip(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	userID, err := callerID(ctx)
	if err != nil {
		return "", err
	}
	var req struct {
		LoadoutID string `json:"loadout_id"`
	}
	if err := json.Unmarshal([]byte(payload), &req); err != nil || req.LoadoutID == "" {
		return "", runtime.NewError("loadout_id required", 3)
	}
	ecs := store.NewEconomyExtStore(db)
	l, err := ecs.LoadoutGet(ctx, req.LoadoutID)
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	if l == nil || l.UserID != userID {
		return "", runtime.NewError("loadout not found", 5)
	}
	var slots map[string]string
	if err := json.Unmarshal([]byte(l.SlotsJSON), &slots); err != nil {
		return "", runtime.NewError("corrupt loadout", 13)
	}
	cs := store.NewCosmeticStore(db)
	equipped := []string{}
	skipped := []string{}
	for _, cosmeticID := range slots {
		if cosmeticID == "" {
			continue
		}
		c, gerr := cs.GetByID(ctx, cosmeticID)
		if gerr != nil || c == nil {
			skipped = append(skipped, cosmeticID)
			continue
		}
		if !cs.Owns(ctx, userID, cosmeticID) {
			skipped = append(skipped, cosmeticID)
			continue
		}
		if err := cs.Equip(ctx, userID, c.Kind, cosmeticID); err != nil {
			skipped = append(skipped, cosmeticID)
			continue
		}
		equipped = append(equipped, cosmeticID)
	}
	out, _ := json.Marshal(map[string]interface{}{"ok": true, "equipped": equipped, "skipped": skipped})
	return string(out), nil
}

// CosmeticMintNFT mints an owned cosmetic as an NFT via the on-chain relay
// (reuses integrations/polygon.go). Dormant without POLYGON_ANCHOR_URL — returns
// {"configured":false} so the UI can render a disabled "coming soon" state.
func CosmeticMintNFT(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
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
	if !integrations.PolygonAnchorConfigured() {
		out, _ := json.Marshal(map[string]interface{}{
			"configured": false,
			"message":    "On-chain minting isn't configured yet (set POLYGON_ANCHOR_URL).",
		})
		return string(out), nil
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
	ecs := store.NewEconomyExtStore(db)
	// Already minted (or minting)? Report existing state — never double-mint.
	if existing, _ := ecs.NFTGetByCosmetic(ctx, req.CosmeticID); existing != nil && existing.Status != "failed" {
		out, _ := json.Marshal(map[string]interface{}{
			"configured": true,
			"mint_id":    existing.ID,
			"status":     existing.Status,
			"tx_hash":    existing.TxHash,
		})
		return string(out), nil
	}
	mintID, err := ecs.NFTCreatePending(ctx, userID, req.CosmeticID, "polygon")
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	// Submit the token to the on-chain relay. The cosmetic id is the token
	// identifier; the relay signs and broadcasts, returning the tx hash.
	txHash, serr := integrations.SubmitMerkleRoot(ctx, req.CosmeticID, 1)
	if serr != nil {
		logger.Error("nft mint relay failed for %s: %v", req.CosmeticID, serr)
		_ = ecs.NFTMarkFailed(ctx, req.CosmeticID)
		return "", runtime.NewError("mint submission failed", 13)
	}
	if err := ecs.NFTMarkMinted(ctx, req.CosmeticID, txHash); err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	out, _ := json.Marshal(map[string]interface{}{
		"configured": true,
		"mint_id":    mintID,
		"status":     "minted",
		"tx_hash":    txHash,
	})
	return string(out), nil
}

// CosmeticNFTStatus reports the mint state of a cosmetic for the caller.
func CosmeticNFTStatus(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
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
	m, err := store.NewEconomyExtStore(db).NFTGetByCosmetic(ctx, req.CosmeticID)
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	if m == nil || m.UserID != userID {
		out, _ := json.Marshal(map[string]interface{}{
			"configured": integrations.PolygonAnchorConfigured(),
			"status":     "none",
		})
		return string(out), nil
	}
	out, _ := json.Marshal(map[string]interface{}{
		"configured": integrations.PolygonAnchorConfigured(),
		"mint_id":    m.ID,
		"status":     m.Status,
		"tx_hash":    m.TxHash,
		"chain":      m.Chain,
	})
	return string(out), nil
}
