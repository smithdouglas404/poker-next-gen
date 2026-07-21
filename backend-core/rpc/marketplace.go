package rpc

import (
	"context"
	"database/sql"
	"encoding/json"

	"github.com/heroiclabs/nakama-common/runtime"

	"github.com/smithdouglas404/poker-next-gen/backend-core/billing"
	"github.com/smithdouglas404/poker-next-gen/backend-core/store"
)

// MarketplaceList offers an owned cosmetic for sale.
func MarketplaceList(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	userID, err := callerID(ctx)
	if err != nil {
		return "", err
	}
	if err := requireVerified(ctx, db, userID, "biometric", "selling on the marketplace"); err != nil {
		return "", err
	}
	var req struct {
		CosmeticID string `json:"cosmetic_id"`
		PriceCents int64  `json:"price_cents"`
	}
	if err := json.Unmarshal([]byte(payload), &req); err != nil || req.CosmeticID == "" {
		return "", runtime.NewError("cosmetic_id and price required", 3)
	}
	id, err := store.NewMarketplaceStore(db).CreateListing(ctx, userID, req.CosmeticID, req.PriceCents)
	if err != nil {
		return "", runtime.NewError(err.Error(), 9)
	}
	out, _ := json.Marshal(map[string]interface{}{"listing_id": id})
	return string(out), nil
}

// MarketplaceBrowse returns open listings, with the viewer's marketplace fee bps.
func MarketplaceBrowse(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	items, err := store.NewMarketplaceStore(db).Browse(ctx, 100)
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	out, _ := json.Marshal(map[string]interface{}{"listings": items})
	return string(out), nil
}

// MarketplaceBuy purchases a listing. The platform fee is the SELLER tier's
// marketplace bps; the sale is one atomic transaction.
func MarketplaceBuy(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	buyerID, err := callerID(ctx)
	if err != nil {
		return "", err
	}
	if err := requireVerified(ctx, db, buyerID, "biometric", "buying on the marketplace"); err != nil {
		return "", err
	}
	var req struct {
		ListingID string `json:"listing_id"`
	}
	if err := json.Unmarshal([]byte(payload), &req); err != nil || req.ListingID == "" {
		return "", runtime.NewError("listing_id required", 3)
	}
	mk := store.NewMarketplaceStore(db)
	sellerID, status, err := mk.GetSellerAndStatus(ctx, req.ListingID)
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	if sellerID == "" || status != "open" {
		return "", runtime.NewError("listing not available", 5)
	}
	feeBps := billing.GetTierDef(store.SubscriptionTier(ctx, db, sellerID)).MarketplaceFeeBps
	price, err := mk.Buy(ctx, req.ListingID, buyerID, feeBps)
	if err != nil {
		code := 13
		if err.Error() == "insufficient balance" {
			code = 9
		}
		return "", runtime.NewError(err.Error(), code)
	}
	out, _ := json.Marshal(map[string]interface{}{"ok": true, "paid_cents": price})
	return string(out), nil
}

// MarketplaceCancel closes the caller's open listing.
func MarketplaceCancel(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	userID, err := callerID(ctx)
	if err != nil {
		return "", err
	}
	var req struct {
		ListingID string `json:"listing_id"`
	}
	if err := json.Unmarshal([]byte(payload), &req); err != nil || req.ListingID == "" {
		return "", runtime.NewError("listing_id required", 3)
	}
	if err := store.NewMarketplaceStore(db).Cancel(ctx, req.ListingID, userID); err != nil {
		return "", runtime.NewError(err.Error(), 9)
	}
	return `{"ok":true}`, nil
}
