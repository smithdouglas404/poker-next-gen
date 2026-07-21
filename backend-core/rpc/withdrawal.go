package rpc

import (
	"context"
	"database/sql"
	"encoding/json"
	"strings"

	"github.com/heroiclabs/nakama-common/runtime"

	"github.com/smithdouglas404/poker-next-gen/backend-core/billing"
	"github.com/smithdouglas404/poker-next-gen/backend-core/payments"
	"github.com/smithdouglas404/poker-next-gen/backend-core/store"
)

// WalletWithdraw requests a withdrawal: it holds (debits) the funds now and
// records a pending request that an admin approves (payout) or rejects
// (refund). Enforces the tier's weekly withdraw limit as a rolling sum.
func WalletWithdraw(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	userID, err := callerID(ctx)
	if err != nil {
		return "", err
	}
	var req struct {
		AmountCents int64  `json:"amount_cents"`
		Destination string `json:"destination"`
		Currency    string `json:"currency"` // crypto coin ticker (e.g. "btc"); empty/"usd" = manual
	}
	if err := json.Unmarshal([]byte(payload), &req); err != nil {
		return "", runtime.NewError("invalid payload", 3)
	}
	if req.AmountCents < 500 {
		return "", runtime.NewError("minimum withdrawal is $5.00", 3)
	}
	if req.Destination == "" {
		return "", runtime.NewError("a payout destination is required", 3)
	}
	// A crypto coin ticker routes to automated payout on approve; otherwise the
	// operator pays out by hand.
	gateway := "manual"
	currency := "usd"
	if req.Currency != "" && strings.ToLower(req.Currency) != "usd" {
		gateway = "nowpayments"
		currency = strings.ToLower(req.Currency)
	}

	tier := store.SubscriptionTier(ctx, db, userID)
	def := billing.GetTierDef(tier)
	if def.WithdrawLimitWeeklyCents <= 0 {
		return "", runtime.NewError("withdrawals require a paid membership", 7)
	}
	wd := store.NewWithdrawalStore(db)
	priorWeek, err := wd.SumRecentCents(ctx, userID, 168)
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	if priorWeek+req.AmountCents > def.WithdrawLimitWeeklyCents {
		return "", runtime.NewError("amount exceeds your plan's weekly withdrawal limit", 7)
	}

	id, err := wd.CreateRequest(ctx, userID, req.AmountCents, currency, req.Destination, gateway)
	if err != nil {
		if err.Error() == "insufficient balance" {
			return "", runtime.NewError("insufficient balance", 9)
		}
		return "", runtime.NewError(err.Error(), 13)
	}
	out, _ := json.Marshal(map[string]interface{}{"withdrawal_id": id, "status": "pending"})
	return string(out), nil
}

// WithdrawalList returns the caller's recent withdrawals.
func WithdrawalList(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	userID, err := callerID(ctx)
	if err != nil {
		return "", err
	}
	items, err := store.NewWithdrawalStore(db).List(ctx, userID, 25)
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	out, _ := json.Marshal(map[string]interface{}{"withdrawals": items})
	return string(out), nil
}

// WithdrawalApproveAdmin marks a pending withdrawal paid (funds were already
// held on request). Admin-gated. Payout execution (sending the crypto/fiat) is
// operator-driven or a future gateway-payout integration.
func WithdrawalApproveAdmin(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	callerUserID, _ := ctx.Value(runtime.RUNTIME_CTX_USER_ID).(string)
	if !isAdmin(callerUserID) {
		return "", runtime.NewError("forbidden", 7)
	}
	var req struct {
		WithdrawalID string `json:"withdrawal_id"`
		PayoutID     string `json:"payout_id"`
	}
	if err := json.Unmarshal([]byte(payload), &req); err != nil || req.WithdrawalID == "" {
		return "", runtime.NewError("withdrawal_id required", 3)
	}
	wd := store.NewWithdrawalStore(db)
	w, err := wd.GetByID(ctx, req.WithdrawalID)
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	if w == nil {
		return "", runtime.NewError("withdrawal not found", 5)
	}

	payoutID := req.PayoutID
	autopaid := false
	// Automated crypto payout: if this is a crypto withdrawal and NOWPayments
	// payout is configured, execute the payout now and record the batch id.
	// Fiat/manual withdrawals just get marked paid for the operator to send.
	if w.Gateway == "nowpayments" && payments.NowPaymentsPayoutConfigured() {
		batchID, perr := payments.CreateNowPaymentsPayout(ctx, w.Destination, w.Currency, w.AmountCents)
		if perr != nil {
			logger.Error("crypto payout failed for %s: %v", w.ID, perr)
			return "", runtime.NewError("payout execution failed: "+perr.Error(), 13)
		}
		payoutID = batchID
		autopaid = true
	}

	if err := wd.Approve(ctx, req.WithdrawalID, payoutID); err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	out, _ := json.Marshal(map[string]interface{}{
		"status":     "paid",
		"auto_payout": autopaid,
		"payout_id":  payoutID,
	})
	return string(out), nil
}

// WithdrawalRejectAdmin refunds a pending withdrawal to the wallet. Admin-gated.
func WithdrawalRejectAdmin(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	callerUserID, _ := ctx.Value(runtime.RUNTIME_CTX_USER_ID).(string)
	if !isAdmin(callerUserID) {
		return "", runtime.NewError("forbidden", 7)
	}
	var req struct {
		WithdrawalID string `json:"withdrawal_id"`
		Reason       string `json:"reason"`
	}
	if err := json.Unmarshal([]byte(payload), &req); err != nil || req.WithdrawalID == "" {
		return "", runtime.NewError("withdrawal_id required", 3)
	}
	if err := store.NewWithdrawalStore(db).Reject(ctx, req.WithdrawalID, req.Reason); err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	return `{"status":"rejected"}`, nil
}
