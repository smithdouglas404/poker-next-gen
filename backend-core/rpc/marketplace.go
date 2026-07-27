package rpc

import (
	"context"
	"database/sql"
	"encoding/json"

	"github.com/heroiclabs/nakama-common/runtime"

	"github.com/smithdouglas404/poker-next-gen/backend-core/billing"
	"github.com/smithdouglas404/poker-next-gen/backend-core/store"
)

// marketplaceSaleCode is the notification code for "your listing sold". Distinct
// from the platform (555), club-announcement (556) and club-invite (557) codes
// because the inbox renders it as a money event, not a message.
const marketplaceSaleCode = 558

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

// MarketplaceBrowse returns open listings, with the viewer's marketplace fee bps
// and the cosmetic ids they already have on the floor.
//
// The fee was charged but never disclosed. This comment has always claimed the
// fee was returned; the body did not return it, so a seller typed a price with
// no way to know whether they would receive it. A lower marketplace fee is also
// something the tier catalog SELLS — a paid benefit nobody could see applied.
func MarketplaceBrowse(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	mk := store.NewMarketplaceStore(db)
	items, err := mk.Browse(ctx, 100)
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	res := map[string]interface{}{"listings": items}

	// Browsing stays open to anyone; the fee and own-listing marks are personal,
	// so they are added only when there is a caller to compute them for.
	if userID, _ := ctx.Value(runtime.RUNTIME_CTX_USER_ID).(string); userID != "" {
		tier := store.SubscriptionTier(ctx, db, userID)
		res["fee_bps"] = billing.GetTierDef(tier).MarketplaceFeeBps
		res["fee_tier"] = tier
		if mine, err := mk.OpenListingCosmetics(ctx, userID); err == nil {
			res["my_listed_cosmetic_ids"] = mine
		}
	}
	out, _ := json.Marshal(res)
	return string(out), nil
}

// MarketplaceActivity returns the caller's own trading history — what they
// listed, what sold and for how much net of the fee, and what they bought.
func MarketplaceActivity(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	userID, err := callerID(ctx)
	if err != nil {
		return "", err
	}
	var req struct {
		Limit int `json:"limit"`
	}
	if payload != "" {
		_ = json.Unmarshal([]byte(payload), &req)
	}
	items, aerr := store.NewMarketplaceStore(db).MyActivity(ctx, userID, req.Limit)
	if aerr != nil {
		return "", runtime.NewError(aerr.Error(), 13)
	}
	out, _ := json.Marshal(map[string]interface{}{"activity": items})
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
	// Tell the seller. Their item leaves the floor and their wallet moves by a
	// number that is not the price they set (the fee comes out of it) — without
	// this the only evidence of a completed sale is an unexplained balance
	// change, which is exactly what a support ticket is made of.
	fee := price * int64(feeBps) / 10000
	if nerr := nk.NotificationsSend(ctx, []*runtime.NotificationSend{{
		UserID:  sellerID,
		Subject: "Your listing sold",
		Content: map[string]interface{}{
			"kind":        "marketplace_sale",
			"listing_id":  req.ListingID,
			"price_cents": price,
			"fee_cents":   fee,
			"net_cents":   price - fee,
		},
		Code:       marketplaceSaleCode,
		Persistent: true,
	}}); nerr != nil {
		// The sale is committed; a failed notification must not undo it.
		logger.Warn("marketplace sale notification failed for %s: %v", sellerID, nerr)
	}

	out, _ := json.Marshal(map[string]interface{}{
		"ok": true, "paid_cents": price, "fee_bps": feeBps,
	})
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
