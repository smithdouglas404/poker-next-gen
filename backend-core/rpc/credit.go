package rpc

import (
	"context"
	"database/sql"
	"encoding/json"

	"github.com/heroiclabs/nakama-common/runtime"

	"github.com/smithdouglas404/poker-next-gen/backend-core/models"
	"github.com/smithdouglas404/poker-next-gen/backend-core/store"
)

// Over-limit buy-in credit requests (#63). A player asks a club for extra buy-in
// credit; a club owner/configurer approves (which allocates the amount to the
// player's club balance through the same owner-gated path as balance_allocate) or
// denies. The player can only create requests; only a configurer can review.

// CreditRequestCreate raises a pending credit request for the caller at a club.
func CreditRequestCreate(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	caller, err := callerID(ctx)
	if err != nil {
		return "", err
	}
	var req struct {
		ClubID      string `json:"club_id"`
		AmountMinor int64  `json:"amount_minor"`
		Reason      string `json:"reason"`
	}
	if err := json.Unmarshal([]byte(payload), &req); err != nil || req.ClubID == "" || req.AmountMinor <= 0 {
		return "", runtime.NewError("club_id and a positive amount_minor are required", 3)
	}
	club, err := store.NewClubStore(db).GetByID(ctx, req.ClubID)
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	if club == nil {
		return "", runtime.NewError("club not found", 5)
	}
	username, _ := ctx.Value(runtime.RUNTIME_CTX_USERNAME).(string)
	id, err := store.NewCreditRequestStore(db).Create(ctx, &store.CreditRequest{
		ClubID: req.ClubID, UserID: caller, Username: username, AmountMinor: req.AmountMinor, Reason: req.Reason,
	})
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	return `{"ok":true,"id":"` + id + `"}`, nil
}

// CreditRequestsPending lists a club's pending credit requests (owner/configurer).
func CreditRequestsPending(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	if _, err := callerID(ctx); err != nil {
		return "", err
	}
	var req struct {
		ClubID string `json:"club_id"`
	}
	if err := json.Unmarshal([]byte(payload), &req); err != nil || req.ClubID == "" {
		return "", runtime.NewError("club_id required", 3)
	}
	if _, err := requireClubConfigurer(ctx, db, req.ClubID); err != nil {
		return "", err
	}
	list, err := store.NewCreditRequestStore(db).ListPending(ctx, req.ClubID)
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	out, _ := json.Marshal(map[string]interface{}{"requests": list})
	return string(out), nil
}

// CreditRequestReview approves (allocating the credit) or denies a request. Only a
// configurer of the request's club may review; approval is idempotent.
func CreditRequestReview(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	if _, err := callerID(ctx); err != nil {
		return "", err
	}
	var req struct {
		ID      string `json:"id"`
		Approve bool   `json:"approve"`
	}
	if err := json.Unmarshal([]byte(payload), &req); err != nil || req.ID == "" {
		return "", runtime.NewError("id required", 3)
	}
	crs := store.NewCreditRequestStore(db)
	cr, err := crs.Get(ctx, req.ID)
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	if cr == nil || cr.Status != "pending" {
		return "", runtime.NewError("request not found or already resolved", 5)
	}
	reviewer, err := requireClubConfigurer(ctx, db, cr.ClubID)
	if err != nil {
		return "", err
	}
	status := "denied"
	if req.Approve {
		status = "approved"
	}
	// Resolve atomically first so a double-review can't double-allocate.
	ok, err := crs.Review(ctx, req.ID, status, reviewer)
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	if !ok {
		return "", runtime.NewError("request already resolved", 9)
	}
	if req.Approve {
		if err := store.NewClubStore(db).AllocateBalance(ctx, &models.PlayerAllocatedBalance{
			ClubID: cr.ClubID, UserID: cr.UserID, Balance: cr.AmountMinor, Currency: "USD",
		}); err != nil {
			return "", runtime.NewError("approved but allocation failed: "+err.Error(), 13)
		}
	}
	return `{"ok":true,"status":"` + status + `"}`, nil
}
