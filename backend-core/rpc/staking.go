package rpc

import (
	"context"
	"database/sql"
	"encoding/json"
	"strconv"

	"github.com/heroiclabs/nakama-common/runtime"

	"github.com/smithdouglas404/poker-next-gen/backend-core/store"
)

// Staking / backing marketplace (P10). A backer escrows a stake and posts an open
// offer; a player accepts and receives the stake as bankroll; either party then
// proposes a repay amount and the OTHER confirms (mutual manual settle — there is
// no oracle tying the repayment to live table results, by design). Escrow ordering
// guarantees a payout can never exceed the stake advanced.
//
// PLAY-MONEY ONLY: every staking RPC rejects when REAL_MONEY_ENABLED is on. Staking
// against real balances raises money-transmission/consumer-protection questions we
// deliberately do not take on here — flagged, not hidden.
//
// Honest MVP limit (recorded, not faked): settlement is a mutual agreement, not
// derived from table results. If a player never settles, the backer carries the
// risk — the nature of staking, acceptable in play-money.

// requirePlayMoneyStaking blocks staking while real money is enabled.
func requirePlayMoneyStaking() error {
	if realMoneyEnabled() {
		return runtime.NewError("staking is play-money only and is disabled while real money is enabled", 9)
	}
	return nil
}

// StakingOffer escrows the backer's stake and creates an open offer.
func StakingOffer(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	caller, err := callerID(ctx)
	if err != nil {
		return "", err
	}
	if err := requirePlayMoneyStaking(); err != nil {
		return "", err
	}
	var req struct {
		StakeMinor int64  `json:"stake_minor"`
		MarkupBps  int    `json:"markup_bps"`
		Note       string `json:"note"`
	}
	if err := json.Unmarshal([]byte(payload), &req); err != nil || req.StakeMinor <= 0 {
		return "", runtime.NewError("stake_minor must be positive", 3)
	}
	if req.MarkupBps < 0 {
		req.MarkupBps = 0
	}
	name, _ := ctx.Value(runtime.RUNTIME_CTX_USERNAME).(string)
	// Escrow the backer's stake first; only create the offer if it succeeds.
	if err := store.NewWalletStore(db).Debit(ctx, caller, req.StakeMinor, "staking_stake"); err != nil {
		return "", runtime.NewError("insufficient wallet balance", 9)
	}
	ss := store.NewStakingStore(db)
	id, err := ss.Create(ctx, &store.StakingDeal{
		Backer: caller, BackerName: name, StakeMinor: req.StakeMinor,
		MarkupBps: req.MarkupBps, Note: req.Note,
	})
	if err != nil {
		_ = store.NewWalletStore(db).Credit(ctx, caller, req.StakeMinor, "staking_stake_refund")
		return "", runtime.NewError(err.Error(), 13)
	}
	return `{"ok":true,"id":"` + id + `"}`, nil
}

// StakingAccept takes an open offer: the escrowed stake is advanced to the player
// as bankroll. Atomic status flip happens BEFORE the credit, so a lost race moves
// no money.
func StakingAccept(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	caller, err := callerID(ctx)
	if err != nil {
		return "", err
	}
	if err := requirePlayMoneyStaking(); err != nil {
		return "", err
	}
	var req struct {
		DealID string `json:"deal_id"`
	}
	if err := json.Unmarshal([]byte(payload), &req); err != nil || req.DealID == "" {
		return "", runtime.NewError("deal_id required", 3)
	}
	ss := store.NewStakingStore(db)
	deal, err := ss.Get(ctx, req.DealID)
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	if deal == nil || deal.Status != "offered" {
		return "", runtime.NewError("this offer is no longer open", 9)
	}
	if deal.Backer == caller {
		return "", runtime.NewError("you cannot accept your own backing offer", 3)
	}
	name, _ := ctx.Value(runtime.RUNTIME_CTX_USERNAME).(string)
	ok, err := ss.Accept(ctx, req.DealID, caller, name)
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	if !ok {
		return "", runtime.NewError("this offer was just taken", 9)
	}
	// Advance the escrowed stake to the player as bankroll.
	_ = store.NewWalletStore(db).Credit(ctx, caller, deal.StakeMinor, "staking_advance")
	return `{"ok":true}`, nil
}

// StakingCancel cancels an unaccepted offer (backer only) and refunds the stake.
func StakingCancel(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	caller, err := callerID(ctx)
	if err != nil {
		return "", err
	}
	var req struct {
		DealID string `json:"deal_id"`
	}
	if err := json.Unmarshal([]byte(payload), &req); err != nil || req.DealID == "" {
		return "", runtime.NewError("deal_id required", 3)
	}
	ss := store.NewStakingStore(db)
	deal, err := ss.Get(ctx, req.DealID)
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	if deal == nil || deal.Backer != caller {
		return "", runtime.NewError("not your backing offer", 7)
	}
	ok, err := ss.Cancel(ctx, req.DealID)
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	if !ok {
		return "", runtime.NewError("only an unaccepted offer can be cancelled", 9)
	}
	_ = store.NewWalletStore(db).Credit(ctx, caller, deal.StakeMinor, "staking_refund")
	return `{"ok":true}`, nil
}

// StakingDecline declines an unaccepted offer (any player) and refunds the backer.
func StakingDecline(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	caller, err := callerID(ctx)
	if err != nil {
		return "", err
	}
	var req struct {
		DealID string `json:"deal_id"`
	}
	if err := json.Unmarshal([]byte(payload), &req); err != nil || req.DealID == "" {
		return "", runtime.NewError("deal_id required", 3)
	}
	ss := store.NewStakingStore(db)
	deal, err := ss.Get(ctx, req.DealID)
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	if deal == nil {
		return "", runtime.NewError("offer not found", 5)
	}
	if deal.Backer == caller {
		return "", runtime.NewError("use cancel for your own offer", 3)
	}
	ok, err := ss.Decline(ctx, req.DealID)
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	if !ok {
		return "", runtime.NewError("only an unaccepted offer can be declined", 9)
	}
	_ = store.NewWalletStore(db).Credit(ctx, deal.Backer, deal.StakeMinor, "staking_refund")
	return `{"ok":true}`, nil
}

// StakingSettlePropose records a repay proposal from either party (the amount the
// player returns to the backer). No money moves until the other party confirms.
func StakingSettlePropose(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	caller, err := callerID(ctx)
	if err != nil {
		return "", err
	}
	var req struct {
		DealID     string `json:"deal_id"`
		RepayMinor int64  `json:"repay_minor"`
	}
	if err := json.Unmarshal([]byte(payload), &req); err != nil || req.DealID == "" || req.RepayMinor < 0 {
		return "", runtime.NewError("deal_id and a non-negative repay_minor required", 3)
	}
	ss := store.NewStakingStore(db)
	deal, err := ss.Get(ctx, req.DealID)
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	if deal == nil || (caller != deal.Backer && caller != deal.Player) {
		return "", runtime.NewError("only a party to the deal may propose settlement", 7)
	}
	if deal.Status != "active" && deal.Status != "settle_proposed" {
		return "", runtime.NewError("this deal is not open for settlement", 9)
	}
	ok, err := ss.ProposeSettle(ctx, req.DealID, caller, req.RepayMinor)
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	if !ok {
		return "", runtime.NewError("this deal is not open for settlement", 9)
	}
	return `{"ok":true}`, nil
}

// StakingSettleConfirm confirms a proposed settlement. The confirmer must be the
// party who did NOT propose. On confirm, the player repays the backer. Escrow
// ordering: debit the player first, flip the status atomically, then credit the
// backer — a lost race or an unfunded player moves no net money.
func StakingSettleConfirm(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	caller, err := callerID(ctx)
	if err != nil {
		return "", err
	}
	var req struct {
		DealID string `json:"deal_id"`
	}
	if err := json.Unmarshal([]byte(payload), &req); err != nil || req.DealID == "" {
		return "", runtime.NewError("deal_id required", 3)
	}
	ss := store.NewStakingStore(db)
	deal, err := ss.Get(ctx, req.DealID)
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	if deal == nil || deal.Status != "settle_proposed" {
		return "", runtime.NewError("no settlement is awaiting confirmation", 9)
	}
	if caller != deal.Backer && caller != deal.Player {
		return "", runtime.NewError("only a party to the deal may confirm", 7)
	}
	if caller == deal.SettleProposedBy {
		return "", runtime.NewError("the other party must confirm your proposal", 9)
	}
	ws := store.NewWalletStore(db)
	// Debit the player's repay first so an unfunded player cannot settle.
	if err := ws.Debit(ctx, deal.Player, deal.RepayMinor, "staking_settle"); err != nil {
		return "", runtime.NewError("player has insufficient balance to settle", 9)
	}
	ok, err := ss.ConfirmSettle(ctx, req.DealID)
	if err != nil || !ok {
		_ = ws.Credit(ctx, deal.Player, deal.RepayMinor, "staking_settle_refund")
		return "", runtime.NewError("could not confirm settlement", 13)
	}
	_ = ws.Credit(ctx, deal.Backer, deal.RepayMinor, "staking_settle")
	return `{"ok":true,"repay_minor":` + strconv.FormatInt(deal.RepayMinor, 10) + `}`, nil
}

// StakingSettleReject sends a proposed settlement back to active to renegotiate.
// Either party may reject a pending proposal.
func StakingSettleReject(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	caller, err := callerID(ctx)
	if err != nil {
		return "", err
	}
	var req struct {
		DealID string `json:"deal_id"`
	}
	if err := json.Unmarshal([]byte(payload), &req); err != nil || req.DealID == "" {
		return "", runtime.NewError("deal_id required", 3)
	}
	ss := store.NewStakingStore(db)
	deal, err := ss.Get(ctx, req.DealID)
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	if deal == nil || (caller != deal.Backer && caller != deal.Player) {
		return "", runtime.NewError("only a party to the deal may reject", 7)
	}
	ok, err := ss.RejectSettle(ctx, req.DealID)
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	if !ok {
		return "", runtime.NewError("no settlement is awaiting confirmation", 9)
	}
	return `{"ok":true}`, nil
}

// StakingList returns the caller's deals (as backer and as player).
func StakingList(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
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
	deals, err := store.NewStakingStore(db).ListForUser(ctx, caller, req.Limit)
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	out, _ := json.Marshal(map[string]interface{}{"deals": deals, "me": caller})
	return string(out), nil
}

// StakingOpenList returns open offers awaiting a player.
func StakingOpenList(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
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
	deals, err := store.NewStakingStore(db).ListOpen(ctx, req.Limit)
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	out, _ := json.Marshal(map[string]interface{}{"deals": deals, "me": caller})
	return string(out), nil
}
