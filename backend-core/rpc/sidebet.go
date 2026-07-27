package rpc

import (
	"context"
	"database/sql"
	"encoding/json"
	"strings"

	"github.com/heroiclabs/nakama-common/runtime"

	"github.com/smithdouglas404/poker-next-gen/backend-core/poker/enginemath"
	"github.com/smithdouglas404/poker-next-gen/backend-core/store"
)

// Player-vs-player side bets. Stakes are escrowed to the platform on offer/accept
// (wallet debit) and paid out on settle (wallet credit), so a payout can never
// exceed what was escrowed. Settlement is neutral: either party can settle an
// accepted bet by supplying both showdown hands, and engine-math (rs_poker)
// equity splits the pot — no self-declaration of a win. A party may also concede.

// SidebetOffer escrows the proposer's stake and creates an open offer.
func SidebetOffer(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	caller, err := callerID(ctx)
	if err != nil {
		return "", err
	}
	var req struct {
		MatchID     string `json:"match_id"`
		HandNo      int    `json:"hand_no"`
		Proposition string `json:"proposition"`
		StakeMinor  int64  `json:"stake_minor"`
	}
	if err := json.Unmarshal([]byte(payload), &req); err != nil || req.StakeMinor <= 0 {
		return "", runtime.NewError("stake_minor must be positive", 3)
	}
	name, _ := ctx.Value(runtime.RUNTIME_CTX_USERNAME).(string)
	// Escrow the proposer's stake first; only create the offer if it succeeds.
	if err := store.NewWalletStore(db).Debit(ctx, caller, req.StakeMinor, "sidebet_escrow"); err != nil {
		return "", runtime.NewError("insufficient wallet balance", 9)
	}
	ss := store.NewSidebetStore(db)
	id, err := ss.Create(ctx, &store.Sidebet{
		MatchID: req.MatchID, HandNo: req.HandNo, Proposer: caller, ProposerName: name,
		Proposition: req.Proposition, StakeMinor: req.StakeMinor,
	})
	if err != nil {
		if rerr := store.NewWalletStore(db).Credit(ctx, caller, req.StakeMinor, "sidebet_escrow_refund"); rerr != nil {
			logger.Error("REFUND FAILED sidebet_offer user=%s amount_minor=%d: %v", caller, req.StakeMinor, rerr)
		}
		return "", runtime.NewError(err.Error(), 13)
	}
	return `{"ok":true,"id":"` + id + `"}`, nil
}

// SidebetAccept escrows the acceptor's stake and takes an open offer.
func SidebetAccept(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	caller, err := callerID(ctx)
	if err != nil {
		return "", err
	}
	var req struct {
		SidebetID string `json:"sidebet_id"`
	}
	if err := json.Unmarshal([]byte(payload), &req); err != nil || req.SidebetID == "" {
		return "", runtime.NewError("sidebet_id required", 3)
	}
	ss := store.NewSidebetStore(db)
	bet, err := ss.Get(ctx, req.SidebetID)
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	if bet == nil || bet.Status != "offered" {
		return "", runtime.NewError("this side bet is no longer open", 9)
	}
	if bet.Proposer == caller {
		return "", runtime.NewError("you cannot accept your own side bet", 3)
	}
	name, _ := ctx.Value(runtime.RUNTIME_CTX_USERNAME).(string)
	ws := store.NewWalletStore(db)
	if err := ws.Debit(ctx, caller, bet.StakeMinor, "sidebet_escrow"); err != nil {
		return "", runtime.NewError("insufficient wallet balance", 9)
	}
	ok, err := ss.Accept(ctx, req.SidebetID, caller, name)
	if err != nil || !ok {
		if rerr := ws.Credit(ctx, caller, bet.StakeMinor, "sidebet_escrow_refund"); rerr != nil {
			logger.Error("REFUND FAILED sidebet_accept user=%s bet=%s amount_minor=%d: %v",
				caller, req.SidebetID, bet.StakeMinor, rerr)
		}
		if err != nil {
			return "", runtime.NewError(err.Error(), 13)
		}
		return "", runtime.NewError("this side bet was just taken", 9)
	}
	return `{"ok":true}`, nil
}

// SidebetCancel cancels an unaccepted offer (proposer only) and refunds the stake.
func SidebetCancel(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	caller, err := callerID(ctx)
	if err != nil {
		return "", err
	}
	var req struct {
		SidebetID string `json:"sidebet_id"`
	}
	if err := json.Unmarshal([]byte(payload), &req); err != nil || req.SidebetID == "" {
		return "", runtime.NewError("sidebet_id required", 3)
	}
	ss := store.NewSidebetStore(db)
	bet, err := ss.Get(ctx, req.SidebetID)
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	if bet == nil || bet.Proposer != caller {
		return "", runtime.NewError("not your side bet", 7)
	}
	ok, err := ss.Cancel(ctx, req.SidebetID)
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	if !ok {
		return "", runtime.NewError("only an unaccepted offer can be cancelled", 9)
	}
	if rerr := store.NewWalletStore(db).Credit(ctx, caller, bet.StakeMinor, "sidebet_refund"); rerr != nil {
		logger.Error("REFUND FAILED sidebet_cancel user=%s bet=%s amount_minor=%d: %v",
			caller, req.SidebetID, bet.StakeMinor, rerr)
	}
	return `{"ok":true}`, nil
}

// SidebetSettle finalizes an accepted bet. With {holes:[proposerHand,acceptorHand],
// board}, engine-math equity splits the pot (neutral). With {concede:true}, the
// caller concedes the whole pot to the other party. Only a party may settle.
func SidebetSettle(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	caller, err := callerID(ctx)
	if err != nil {
		return "", err
	}
	var req struct {
		SidebetID string   `json:"sidebet_id"`
		Holes     []string `json:"holes"`   // [proposerHand, acceptorHand] for equity settle
		Board     string   `json:"board"`   // community cards
		Concede   bool     `json:"concede"` // caller gives the pot to the other party
	}
	if err := json.Unmarshal([]byte(payload), &req); err != nil || req.SidebetID == "" {
		return "", runtime.NewError("sidebet_id required", 3)
	}
	ss := store.NewSidebetStore(db)
	bet, err := ss.Get(ctx, req.SidebetID)
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	if bet == nil || bet.Status != "accepted" {
		return "", runtime.NewError("side bet is not awaiting settlement", 9)
	}
	if caller != bet.Proposer && caller != bet.Acceptor {
		return "", runtime.NewError("only a party to the bet may settle it", 7)
	}
	pot := bet.StakeMinor * 2
	ws := store.NewWalletStore(db)

	// Concede: caller hands the whole pot to the opponent.
	if req.Concede {
		winner := bet.Proposer
		if caller == bet.Proposer {
			winner = bet.Acceptor
		}
		if ok, serr := ss.Settle(ctx, bet.ID, winner); serr != nil || !ok {
			return "", runtime.NewError("could not settle side bet", 13)
		}
		// Settle already marked the bet resolved, so a failed payout here has no
		// natural retry — the caller sees "ok" and the winner is simply never
		// paid, with the system believing it's fully settled. This has to be
		// findable.
		if perr := ws.Credit(ctx, winner, pot, "sidebet_win"); perr != nil {
			logger.Error("PAYOUT FAILED sidebet_settle_concede bet=%s winner=%s amount_minor=%d: %v",
				bet.ID, winner, pot, perr)
		}
		return `{"ok":true,"winner":"` + winner + `","mode":"concede"}`, nil
	}

	// Equity: engine-math (rs_poker) splits the pot by each hand's win probability.
	if len(req.Holes) != 2 {
		return "", runtime.NewError("equity settle needs both hole cards, or set concede", 3)
	}
	eq, eerr := enginemath.EstimateEquity(req.Holes, strings.TrimSpace(req.Board), 2000)
	if eerr != nil || len(eq) != 2 {
		return "", runtime.NewError("engine-math equity unavailable; cannot settle", 14)
	}
	proposerShare := int64(float64(pot) * float64(eq[0]))
	if proposerShare < 0 {
		proposerShare = 0
	}
	if proposerShare > pot {
		proposerShare = pot
	}
	acceptorShare := pot - proposerShare
	winner := bet.Proposer
	if eq[1] > eq[0] {
		winner = bet.Acceptor
	}
	if ok, serr := ss.Settle(ctx, bet.ID, winner); serr != nil || !ok {
		return "", runtime.NewError("could not settle side bet", 13)
	}
	// Same "already settled, no retry" hazard as the concede path above.
	if proposerShare > 0 {
		if perr := ws.Credit(ctx, bet.Proposer, proposerShare, "sidebet_equity"); perr != nil {
			logger.Error("PAYOUT FAILED sidebet_settle_equity bet=%s user=%s amount_minor=%d: %v",
				bet.ID, bet.Proposer, proposerShare, perr)
		}
	}
	if acceptorShare > 0 {
		if perr := ws.Credit(ctx, bet.Acceptor, acceptorShare, "sidebet_equity"); perr != nil {
			logger.Error("PAYOUT FAILED sidebet_settle_equity bet=%s user=%s amount_minor=%d: %v",
				bet.ID, bet.Acceptor, acceptorShare, perr)
		}
	}
	out, _ := json.Marshal(map[string]interface{}{
		"ok": true, "mode": "equity", "winner": winner,
		"proposer_share": proposerShare, "acceptor_share": acceptorShare,
		"proposer_equity": eq[0], "acceptor_equity": eq[1],
	})
	return string(out), nil
}

// SidebetList returns side bets at a match (open + settled).
func SidebetList(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	if _, err := callerID(ctx); err != nil {
		return "", err
	}
	var req struct {
		MatchID string `json:"match_id"`
		Limit   int    `json:"limit"`
	}
	if payload != "" {
		_ = json.Unmarshal([]byte(payload), &req)
	}
	bets, err := store.NewSidebetStore(db).ListForMatch(ctx, req.MatchID, req.Limit)
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	out, _ := json.Marshal(map[string]interface{}{"sidebets": bets})
	return string(out), nil
}
