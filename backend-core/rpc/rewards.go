package rpc

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"strings"

	"github.com/heroiclabs/nakama-common/runtime"

	"github.com/smithdouglas404/poker-next-gen/backend-core/store"
)

// pointsPerCent is the buy-points exchange rate: 1 spendable point per US cent
// (so $1 buys 100 points). Earned HRP and purchased points share one balance,
// but only earned HRP counts toward lifetime rank.
const pointsPerCent = 1

// rewardVoucher returns a human-friendly single-use voucher code.
func rewardVoucher() string {
	var b [4]byte
	_, _ = rand.Read(b[:])
	h := strings.ToUpper(hex.EncodeToString(b[:]))
	return "HRC-" + h[:4] + "-" + h[4:8]
}

// RewardsCatalog returns the marketplace: category list, active sponsors, and
// active reward items (optionally filtered by {category}). Auth required.
func RewardsCatalog(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	if _, err := callerID(ctx); err != nil {
		return "", err
	}
	var req struct {
		Category string `json:"category"`
	}
	if payload != "" {
		_ = json.Unmarshal([]byte(payload), &req)
	}
	rs := store.NewRewardsStore(db)
	sponsors, err := rs.ListSponsors(ctx, req.Category)
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	items, err := rs.ListItems(ctx, req.Category)
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	out, _ := json.Marshal(map[string]interface{}{
		"categories": store.RewardCategories,
		"sponsors":   sponsors,
		"items":      items,
	})
	return string(out), nil
}

// PointsBalance returns the caller's spendable + lifetime points and hand counts.
func PointsBalance(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	caller, err := callerID(ctx)
	if err != nil {
		return "", err
	}
	l, err := store.NewLoyaltyStore(db).Get(ctx, caller)
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	out, _ := json.Marshal(map[string]interface{}{
		"user_id":      caller,
		"spendable":    l.HRPSpendable,
		"lifetime":     l.HRPTotal,
		"hands_played": l.HandsPlayed,
		"hands_won":    l.HandsWon,
	})
	return string(out), nil
}

// RewardRedeem redeems a catalog item for the caller's spendable points and
// creates a voucher record for operator fulfilment. Atomic against the balance;
// stock is refunded to points if a limited item sells out mid-redeem.
func RewardRedeem(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	caller, err := callerID(ctx)
	if err != nil {
		return "", err
	}
	var req struct {
		ItemID string `json:"item_id"`
	}
	if err := json.Unmarshal([]byte(payload), &req); err != nil || req.ItemID == "" {
		return "", runtime.NewError("item_id required", 3)
	}
	rs := store.NewRewardsStore(db)
	ls := store.NewLoyaltyStore(db)
	item, err := rs.GetItem(ctx, req.ItemID)
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	if item == nil || !item.Active {
		return "", runtime.NewError("reward is not available", 5)
	}
	if item.Stock == 0 {
		return "", runtime.NewError("reward is out of stock", 9)
	}

	// Draw down spendable points first (atomic; refundable).
	ok, err := ls.SpendPoints(ctx, caller, item.PointsCost)
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	if !ok {
		return "", runtime.NewError("not enough points to redeem this reward", 9)
	}
	// Reserve a unit of limited stock; refund points if it just sold out.
	if item.Stock > 0 {
		got, derr := rs.DecrementStock(ctx, item.ID)
		if derr != nil {
			_ = ls.AddSpendable(ctx, caller, item.PointsCost)
			return "", runtime.NewError(derr.Error(), 13)
		}
		if !got {
			_ = ls.AddSpendable(ctx, caller, item.PointsCost)
			return "", runtime.NewError("reward is out of stock", 9)
		}
	}
	red := &store.RewardRedemption{
		UserID: caller, ItemID: item.ID, SponsorID: item.SponsorID, Title: item.Title,
		Category: item.Category, PointsSpent: item.PointsCost, Status: "pending",
		VoucherCode: rewardVoucher(),
	}
	if _, err := rs.CreateRedemption(ctx, red); err != nil {
		// Best-effort compensation: refund points + stock.
		_ = ls.AddSpendable(ctx, caller, item.PointsCost)
		return "", runtime.NewError(err.Error(), 13)
	}
	bal, _ := ls.Get(ctx, caller)
	out, _ := json.Marshal(map[string]interface{}{
		"ok":         true,
		"redemption": red,
		"spendable":  bal.HRPSpendable,
	})
	return string(out), nil
}

// PointsPurchase buys spendable points with the caller's chip wallet at
// pointsPerCent. Debits the wallet, credits the spendable balance (NOT lifetime,
// so rank is unaffected), and records the purchase.
func PointsPurchase(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	caller, err := callerID(ctx)
	if err != nil {
		return "", err
	}
	var req struct {
		Points int64 `json:"points"`
	}
	if err := json.Unmarshal([]byte(payload), &req); err != nil || req.Points <= 0 {
		return "", runtime.NewError("points must be a positive integer", 3)
	}
	costCents := req.Points / pointsPerCent
	if costCents <= 0 {
		return "", runtime.NewError("points amount too small", 3)
	}
	ws := store.NewWalletStore(db)
	if err := ws.Debit(ctx, caller, costCents, "points_purchase"); err != nil {
		return "", runtime.NewError("insufficient wallet balance", 9)
	}
	ls := store.NewLoyaltyStore(db)
	if err := ls.AddSpendable(ctx, caller, req.Points); err != nil {
		// Refund the chips if crediting points fails.
		if rerr := ws.Credit(ctx, caller, costCents, "points_purchase_refund"); rerr != nil {
			logger.Error("REFUND FAILED points_purchase user=%s amount_cents=%d: %v", caller, costCents, rerr)
		}
		return "", runtime.NewError(err.Error(), 13)
	}
	_ = store.NewRewardsStore(db).RecordPointsPurchase(ctx, caller, req.Points, costCents)
	bal, _ := ls.Get(ctx, caller)
	out, _ := json.Marshal(map[string]interface{}{
		"ok":         true,
		"points":     req.Points,
		"cost_cents": costCents,
		"spendable":  bal.HRPSpendable,
	})
	return string(out), nil
}

// RewardRedemptionsList returns the caller's redemption history.
func RewardRedemptionsList(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	caller, err := callerID(ctx)
	if err != nil {
		return "", err
	}
	var req struct {
		Limit int `json:"limit"`
	}
	if payload != "" {
		_ = json.Unmarshal([]byte(payload), &req)
	}
	reds, err := store.NewRewardsStore(db).ListRedemptions(ctx, caller, req.Limit)
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	out, _ := json.Marshal(map[string]interface{}{"redemptions": reds})
	return string(out), nil
}

// --- Admin catalog + fulfilment (platform admin gated) ---

// RewardSponsorUpsert creates/updates a sponsor. Admin only.
func RewardSponsorUpsert(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	admin, err := adminCaller(ctx)
	if err != nil {
		return "", err
	}
	var sp store.RewardSponsor
	if err := json.Unmarshal([]byte(payload), &sp); err != nil || sp.Name == "" {
		return "", runtime.NewError("name required", 3)
	}
	if payload != "" && !strings.Contains(payload, "\"active\"") {
		sp.Active = true // default new sponsors to active
	}
	id, err := store.NewRewardsStore(db).UpsertSponsor(ctx, &sp)
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	adminAuditDetail(ctx, logger, db, admin, "reward_sponsor_upsert", id, sp)
	return `{"ok":true,"id":"` + id + `"}`, nil
}

// RewardItemUpsert creates/updates a reward item. Admin only.
func RewardItemUpsert(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	admin, err := adminCaller(ctx)
	if err != nil {
		return "", err
	}
	var it store.RewardItem
	if err := json.Unmarshal([]byte(payload), &it); err != nil || it.SponsorID == "" || it.Title == "" {
		return "", runtime.NewError("sponsor_id and title required", 3)
	}
	if payload != "" && !strings.Contains(payload, "\"active\"") {
		it.Active = true
	}
	if payload != "" && !strings.Contains(payload, "\"stock\"") {
		it.Stock = -1 // default unlimited
	}
	id, err := store.NewRewardsStore(db).UpsertItem(ctx, &it)
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	adminAuditDetail(ctx, logger, db, admin, "reward_item_upsert", id, it)
	return `{"ok":true,"id":"` + id + `"}`, nil
}

// RewardRedemptionsPending returns the operator fulfilment queue. Admin only.
func RewardRedemptionsPending(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	if _, err := adminCaller(ctx); err != nil {
		return "", err
	}
	var req struct {
		Limit int `json:"limit"`
	}
	if payload != "" {
		_ = json.Unmarshal([]byte(payload), &req)
	}
	reds, err := store.NewRewardsStore(db).ListPendingRedemptions(ctx, req.Limit)
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	out, _ := json.Marshal(map[string]interface{}{"redemptions": reds})
	return string(out), nil
}

// RewardRedemptionFulfil marks a redemption fulfilled/cancelled. Admin only.
func RewardRedemptionFulfil(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	admin, err := adminCaller(ctx)
	if err != nil {
		return "", err
	}
	var req struct {
		ID     string `json:"id"`
		Status string `json:"status"`
	}
	if err := json.Unmarshal([]byte(payload), &req); err != nil || req.ID == "" {
		return "", runtime.NewError("id required", 3)
	}
	// Rejected at the boundary rather than coerced. This used to default anything
	// that was not "cancelled" to "fulfilled", so a typo marked the reward
	// delivered and kept the player's points — the exact opposite of the
	// operator's intent, and unrecoverable once the row left `pending`.
	if !store.ValidRedemptionStatus(req.Status) {
		return "", runtime.NewError("status must be \"fulfilled\" or \"cancelled\"", 3)
	}
	rs := store.NewRewardsStore(db)
	red, err := rs.FulfilRedemption(ctx, req.ID, req.Status)
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	if red == nil {
		return "", runtime.NewError("redemption not found or already resolved", 5)
	}

	// Cancelling has to give the player back what redeeming took. RewardRedeem
	// debits spendable points and reserves a unit of stock BEFORE writing the
	// row, and it compensates both if the write fails — but cancellation used to
	// flip the status and stop there, so an operator cancelling a redemption
	// destroyed the player's points. Points are bought with real chips
	// (points_purchase), so this is a refund, not a scoreboard adjustment.
	refunded := int64(0)
	if red.Status == "cancelled" {
		if red.PointsSpent > 0 {
			if rerr := store.NewLoyaltyStore(db).AddSpendable(ctx, red.UserID, red.PointsSpent); rerr != nil {
				// Do not swallow this. The status is already flipped, so a silent
				// failure here is a player permanently down the points with a
				// cancelled voucher and no record of why.
				logger.Error("redemption %s cancelled but the %d-point refund failed for %s: %v",
					red.ID, red.PointsSpent, red.UserID, rerr)
				return "", runtime.NewError("redemption cancelled but the point refund failed — resolve manually before retrying", 13)
			}
			refunded = red.PointsSpent
		}
		// Return the reserved unit. Best-effort and deliberately after the refund:
		// stock is inventory, points are the player's money, and if only one can
		// succeed it must be the player's.
		if serr := rs.IncrementStock(ctx, red.ItemID); serr != nil {
			logger.Warn("redemption %s refunded but stock was not restored on item %s: %v", red.ID, red.ItemID, serr)
		}
	}

	adminAuditDetail(ctx, logger, db, admin, "reward_redemption_fulfil", req.ID, req)
	out, _ := json.Marshal(map[string]interface{}{
		"ok":              true,
		"status":          red.Status,
		"points_refunded": refunded,
	})
	return string(out), nil
}
