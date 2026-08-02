package rpc

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"strings"

	"github.com/heroiclabs/nakama-common/runtime"

	"github.com/smithdouglas404/poker-next-gen/backend-core/audit"
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
	if err := requireRealMoney(); err != nil { // SEC-2: fail-closed real-money switch
		return "", err
	}
	// Receiving money requires KYC/AML verification.
	if err := requireVerified(ctx, db, userID, "kyc_aml", "withdrawing funds"); err != nil {
		return "", err
	}
	// Same jurisdiction gate every deposit path applies. Its absence here meant a
	// player in a denied country — including one added to the deny list after
	// they funded — could still pull money OUT, which is the direction that
	// actually matters for sanctions exposure.
	if err := guardJurisdiction(ctx, db); err != nil {
		return "", err
	}
	// The sign-up stipend is play money: every wallet opens with
	// store.GuestStipendCents that no deposit funded and no ledger entry
	// records. Nothing stopped it being withdrawn as real cash — an account
	// that never paid in a cent could complete KYC and draw the stipend (plus
	// any bonuses/rakeback accrued on top of it) straight out, so the platform
	// paid out money it never took in.
	//
	// The invariant the store layer already documents ("free accounts cannot
	// deposit or withdraw, so the stipend ... can never become or come from
	// real funds") is enforced HERE, and by real inflow rather than by tier:
	// gating on the subscription tier would sell access to your own money and
	// would strand a lapsed paid member. An account that has genuinely
	// deposited may withdraw; one that never has, cannot.
	deposited, derr := store.NewDepositStore(db).LifetimeCreditedCents(ctx, userID)
	if derr != nil {
		// Fail CLOSED, matching the weekly-limit handling below: an unreadable
		// deposit history means real-vs-stipend can't be told apart.
		return "", runtime.NewError("could not verify your deposit history — please try again", 13)
	}
	if deposited <= 0 {
		return "", runtime.NewError(
			"your balance is sign-up credit, which can't be withdrawn — make a deposit first", 9)
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

	wd := store.NewWithdrawalStore(db)

	// Tier gate: the weekly withdrawal limit. Every tier advertises one on the
	// membership page and the wallet screen shows it as a live figure, and
	// nothing enforced it — the number was decoration on both surfaces.
	//
	// It is a VELOCITY cap, not an access gate. Access to your own money is never
	// sold: the rule above stands, which is why a tier with no configured limit
	// falls back to the lowest positive one rather than blocking outright. A free
	// account cannot deposit, so it has little real balance to move, but a player
	// who lapsed from a paid plan must still be able to withdraw what is theirs.
	weekly := billing.GetTierDef(store.SubscriptionTier(ctx, db, userID)).WithdrawLimitWeeklyCents
	if weekly <= 0 {
		weekly = billing.LowestWithdrawWeeklyCents()
	}
	if weekly > 0 {
		used, uerr := wd.SumRecentCents(ctx, userID, 24*7)
		if uerr != nil {
			// Fail CLOSED. An unreadable history means the limit cannot be
			// evaluated, and letting money out on an unknown total is the one
			// outcome that cannot be undone.
			return "", runtime.NewError("could not verify your recent withdrawals — try again shortly", 13)
		}
		if used+req.AmountCents > weekly {
			remaining := weekly - used
			if remaining < 0 {
				remaining = 0
			}
			return "", runtime.NewError(fmt.Sprintf(
				"this would exceed your plan's weekly withdrawal limit of $%d — $%d remaining this week",
				weekly/100, remaining/100), 9)
		}
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
	// CLAIM BEFORE PAYING. This used to be an unlocked GetByID, then an
	// irreversible payout, then the status flip — so two admins (or one
	// double-click, or a retried request) could both read 'pending' and both
	// send real crypto, while the books recorded one payout. ClaimForPayout
	// atomically moves pending → paying and returns the row, so exactly one
	// caller is ever authorised to spend, and there is no unlocked read left.
	w, err := wd.ClaimForPayout(ctx, req.WithdrawalID)
	if err != nil {
		// "withdrawal not pending" covers both a missing row and one another
		// caller already claimed — either way this caller must not pay.
		return "", runtime.NewError(err.Error(), 9)
	}

	payoutID := req.PayoutID
	autopaid := false
	// Automated crypto payout: if this is a crypto withdrawal and NOWPayments
	// payout is configured, execute the payout now and record the batch id.
	// Fiat/manual withdrawals just get marked paid for the operator to send.
	if w.Gateway == "nowpayments" && payments.NowPaymentsPayoutConfigured() {
		// w.ID is passed as the payout's external id so a retry at the gateway
		// is deduplicated on their side too, not just ours.
		batchID, perr := payments.CreateNowPaymentsPayout(ctx, w.Destination, w.Currency, w.AmountCents, w.ID)
		if perr != nil {
			logger.Error("crypto payout failed for %s: %v", w.ID, perr)
			// Park it in a terminal failed state rather than releasing back to
			// 'pending'. A transport error is ambiguous about whether the money
			// actually left; auto-returning it to the approvable pool is exactly
			// how the same request gets paid twice. A human reconciles against
			// the gateway before this can be approved again.
			if rerr := wd.ReleaseClaim(ctx, w.ID, "payout execution failed: "+perr.Error()); rerr != nil {
				logger.Error("WITHDRAWAL STUCK IN 'paying' %s — release failed: %v", w.ID, rerr)
			}
			return "", runtime.NewError("payout execution failed: "+perr.Error(), 13)
		}
		payoutID = batchID
		autopaid = true
	}

	if err := wd.Approve(ctx, req.WithdrawalID, payoutID); err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	if err := audit.EmitLedger(ctx, audit.NewPostgresEmitter(db), "withdrawal_paid", "", map[string]any{
		"withdrawal_id": w.ID,
		"user_id":       w.UserID,
		"amount_cents":  w.AmountCents,
		"currency":      w.Currency,
		"gateway":       w.Gateway,
		"payout_id":     payoutID,
		"auto_payout":   autopaid,
	}); err != nil {
		logger.Warn("withdrawal audit anchor failed: %v", err)
	}
	out, _ := json.Marshal(map[string]interface{}{
		"status":      "paid",
		"auto_payout": autopaid,
		"payout_id":   payoutID,
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
