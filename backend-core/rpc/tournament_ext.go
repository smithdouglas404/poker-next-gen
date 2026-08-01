package rpc

import (
	"context"
	"database/sql"
	"encoding/json"

	"github.com/heroiclabs/nakama-common/runtime"

	"github.com/smithdouglas404/poker-next-gen/backend-core/audit"
	"github.com/smithdouglas404/poker-next-gen/backend-core/store"
)

// Tournament read/analytics + config ("tournext"). These RPCs are a pure
// projection of the authoritative director/tournament state plus settlement —
// they never alter match/tournament/director flow, only the config columns
// (late_reg_secs, time_bank_secs, format) and the payout settlement. Live
// figures (levels, per-table counts, standings, eliminations) are read from the
// same tables the director writes; where the director hasn't populated a field
// yet the snapshot is best-effort (zeros / empty lists).

// tournextValidFormat reports whether f is a supported tournament format.
func tournextValidFormat(f string) bool {
	switch f {
	case "mtt", "sng", "lottery_sng", "heads_up":
		return true
	}
	return false
}

// tournextPrizePool derives the prize pool from entrants × buy-in — the same
// basis the director uses when it settles (see match/tournament/director.go).
// tournextMoney is the ONLY prize-pool computation in this file. It used to be
// `entrants × buy_in`, which ignored the entry fee entirely — so the pool paid
// out money the club had already been credited with in "Total Fees". See
// store.TournamentMoney for the accounting.
func tournextMoney(info *store.TournamentExtInfo, entrants int) store.TournamentEconomics {
	if info == nil {
		return store.TournamentEconomics{}
	}
	return store.TournamentMoney(info.Bracket(), entrants)
}

// TournamentBalance signals the tournament director to rebalance/merge tables
// now. The director already has the rebalance+merge logic (director.rebalance)
// but nothing triggered it; this connects the operator's "Balance / Merge"
// action to it. Authorized as a tournament mutation (configurer/owner).
func TournamentBalance(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	var req struct {
		TournamentID string `json:"tournament_id"`
	}
	if err := json.Unmarshal([]byte(payload), &req); err != nil || req.TournamentID == "" {
		return "", runtime.NewError("tournament_id required", 3)
	}
	if _, err := requireTournamentOwner(ctx, db, req.TournamentID); err != nil {
		return "", err
	}
	info, err := store.NewTournamentExtStore(db).GetInfo(ctx, req.TournamentID)
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	if info == nil || info.DirectorMatchID == "" {
		return "", runtime.NewError("tournament is not running", 9)
	}
	if _, err := nk.MatchSignal(ctx, info.DirectorMatchID, `{"type":"balance"}`); err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	return `{"ok":true}`, nil
}

// TournamentStatus returns a live snapshot of a tournament: registered count,
// players left, derived prize pool, current level, per-table counts, chip
// standings, and recent eliminations. Read-only and best-effort — fields the
// director has not populated come back as zeros / empty lists.
func TournamentStatus(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	var req struct {
		TournamentID string `json:"tournament_id"`
	}
	if err := json.Unmarshal([]byte(payload), &req); err != nil || req.TournamentID == "" {
		return "", runtime.NewError("tournament_id required", 3)
	}

	es := store.NewTournamentExtStore(db)
	info, err := es.GetInfo(ctx, req.TournamentID)
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	if info == nil {
		return "", runtime.NewError("tournament not found", 5)
	}

	registered, err := es.RegisteredCount(ctx, req.TournamentID)
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	playersLeft, err := es.PlayersLeft(ctx, req.TournamentID)
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	tables, err := es.TableCounts(ctx, req.TournamentID)
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	standings, err := es.ChipStandings(ctx, req.TournamentID, 20)
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	eliminations, err := es.Eliminations(ctx, req.TournamentID, 20)
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}

	econ := tournextMoney(info, registered)
	pool := econ.PoolMinor
	out, _ := json.Marshal(map[string]interface{}{
		"tournament_id":       info.ID,
		"name":                info.Name,
		"status":              info.Status,
		"format":              info.Format,
		"variant":             info.Variant,
		"level":               info.CurrentLevel,
		"level_started_at":    info.LevelStartedAt,
		"late_reg_secs":       info.LateRegSecs,
		"time_bank_secs":      info.TimeBankSecs,
		"director_match_id":   info.DirectorMatchID,
		"registered_count":    registered,
		"players_left":        playersLeft,
		"buy_in_minor":        info.BuyInMinor,
		"prize_pool_minor":    pool,
		"prize_pool_display":  dollars(pool),
		"tables":              tables,
		"standings":           standings,
		"eliminations":        eliminations,
	})
	return string(out), nil
}

// TournamentAnalytics returns a financial + progress overview for a tournament:
// entrants, prize pool, total fees, completion progress, the payout ladder, and
// the recorded finishers. Read-only.
func TournamentAnalytics(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	var req struct {
		TournamentID string `json:"tournament_id"`
	}
	if err := json.Unmarshal([]byte(payload), &req); err != nil || req.TournamentID == "" {
		return "", runtime.NewError("tournament_id required", 3)
	}

	es := store.NewTournamentExtStore(db)
	info, err := es.GetInfo(ctx, req.TournamentID)
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	if info == nil {
		return "", runtime.NewError("tournament not found", 5)
	}

	ts := store.NewTournamentStore(db)
	entrants, err := ts.CountEntrants(ctx, req.TournamentID)
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	playersLeft, err := es.PlayersLeft(ctx, req.TournamentID)
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	prizes, err := ts.ListPrizes(ctx, req.TournamentID)
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	finishers, err := ts.ListFinishers(ctx, req.TournamentID)
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}

	econ := tournextMoney(info, entrants)
	pool, totalFees := econ.PoolMinor, econ.RakeMinor
	progressPct := 0.0
	if entrants > 0 {
		progressPct = float64(entrants-playersLeft) / float64(entrants) * 100.0
	}

	out, _ := json.Marshal(map[string]interface{}{
		"tournament_id":      info.ID,
		"name":               info.Name,
		"status":             info.Status,
		"format":             info.Format,
		"variant":            info.Variant,
		"entrants":           entrants,
		"players_left":       playersLeft,
		"progress_pct":       progressPct,
		"level":              info.CurrentLevel,
		"starting_stack":     info.StartingStack,
		"max_players":        info.MaxPlayers,
		"buy_in_minor":       info.BuyInMinor,
		"fee_minor":          info.FeeMinor,
		"prize_pool_minor":   pool,
		"prize_pool_display": dollars(pool),
		"total_fees_minor":   totalFees,
		"total_fees_display": dollars(totalFees),
		// Gross is what entrants paid; pool is what pays out; overlay is the
		// club's cost of meeting a guarantee the field did not cover.
		"gross_minor":        econ.GrossMinor,
		"rake_minor":         econ.RakeMinor,
		"overlay_minor":      econ.OverlayMinor,
		"admin_fee_bps":      info.AdminFeeBps,
		"guarantee_minor":    info.GuaranteeMinor,
		"late_reg_secs":      info.LateRegSecs,
		"time_bank_secs":     info.TimeBankSecs,
		"time_bank_per_hand_secs": info.TimeBankPerHandSecs,
		"auto_away_on_timeout":    info.AutoAwayOnTimeout,
		"operating_start_min":     info.OperatingStartMin,
		"operating_end_min":       info.OperatingEndMin,
		"scheduled_at":            info.ScheduledAt,
		"prizes":             prizes,
		"finishers":          finishers,
	})
	return string(out), nil
}

// TournamentConfig sets the tournext config columns (late registration window,
// per-player time bank, format) and returns the updated info. Platform-admin
// only, mirroring the other *_admin gates.
func TournamentConfig(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	if _, err := requireAdmin(ctx); err != nil {
		return "", err
	}
	var req struct {
		TournamentID string `json:"tournament_id"`
		LateRegSecs  int    `json:"late_reg_secs"`
		TimeBankSecs int    `json:"time_bank_secs"`
		Format       string `json:"format"`
	}
	if err := json.Unmarshal([]byte(payload), &req); err != nil || req.TournamentID == "" {
		return "", runtime.NewError("tournament_id required", 3)
	}
	if req.LateRegSecs < 0 || req.TimeBankSecs < 0 {
		return "", runtime.NewError("late_reg_secs and time_bank_secs must be non-negative", 3)
	}
	if req.Format == "" {
		req.Format = "mtt"
	}
	if !tournextValidFormat(req.Format) {
		return "", runtime.NewError("format must be one of mtt|sng|lottery_sng|heads_up", 3)
	}

	es := store.NewTournamentExtStore(db)
	info, err := es.GetInfo(ctx, req.TournamentID)
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	if info == nil {
		return "", runtime.NewError("tournament not found", 5)
	}
	if err := es.SetConfig(ctx, req.TournamentID, req.LateRegSecs, req.TimeBankSecs, req.Format); err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	info, err = es.GetInfo(ctx, req.TournamentID)
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	out, _ := json.Marshal(info)
	return string(out), nil
}

// TournamentFinalize settles a tournament's payouts and marks it complete. It
// mirrors the director's settlement (entrants × buy-in split across the payout
// ladder by basis points) as an admin-triggered fallback for when the director
// match is not running. Idempotent: a tournament already 'finished' is not paid
// twice. Platform-admin only.
func TournamentFinalize(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	if _, err := requireAdmin(ctx); err != nil {
		return "", err
	}
	var req struct {
		TournamentID string `json:"tournament_id"`
	}
	if err := json.Unmarshal([]byte(payload), &req); err != nil || req.TournamentID == "" {
		return "", runtime.NewError("tournament_id required", 3)
	}

	es := store.NewTournamentExtStore(db)
	info, err := es.GetInfo(ctx, req.TournamentID)
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	if info == nil {
		return "", runtime.NewError("tournament not found", 5)
	}
	if info.Status == "finished" {
		out, _ := json.Marshal(map[string]interface{}{
			"tournament_id": info.ID,
			"status":        "finished",
			"already":       true,
			"payouts":       []interface{}{},
		})
		return string(out), nil
	}

	ts := store.NewTournamentStore(db)
	playing, err := ts.CountPlaying(ctx, req.TournamentID)
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	if playing > 1 {
		return "", runtime.NewError("tournament still in progress: more than one player left", 9)
	}

	// Claim the right to pay out BEFORE computing or crediting anything. The
	// tournament director pays this same prize ladder automatically the moment
	// one player remains (checkFinish, in match/tournament/director.go) — this
	// RPC racing that, or being called twice itself, must not pay every winner
	// a second time. A caller that doesn't get the claim pays nobody.
	if claimed, cerr := ts.FinishOnce(ctx, req.TournamentID); cerr != nil {
		return "", runtime.NewError(cerr.Error(), 13)
	} else if !claimed {
		out, _ := json.Marshal(map[string]interface{}{
			"tournament_id": req.TournamentID,
			"status":        "finished",
			"already":       true,
			"payouts":       []interface{}{},
		})
		return string(out), nil
	}

	// The last player still 'playing' is the champion — finish place 1.
	if playing == 1 {
		players, err := ts.ListRegistered(ctx, req.TournamentID)
		if err != nil {
			return "", runtime.NewError(err.Error(), 13)
		}
		for _, p := range players {
			if p.Status == "playing" {
				// ListFinishers (below) is what the payout loop reads to decide
				// who gets paid what; a champion who never got finish_place=1
				// recorded is a champion the payout loop cannot see, despite
				// FinishOnce having already claimed the payout for this event.
				if serr := ts.SetFinishPlace(ctx, req.TournamentID, p.UserID, 1); serr != nil {
					logger.Error("champion finish place not recorded tournament=%s user=%s: %v",
						req.TournamentID, p.UserID, serr)
				}
			}
		}
	}

	// Real prize pool = entrants × buy-in (same basis as the director).
	entrants, err := ts.CountEntrants(ctx, req.TournamentID)
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	pool := tournextMoney(info, entrants).PoolMinor

	prizes, err := ts.ListPrizes(ctx, req.TournamentID)
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	finishers, err := ts.ListFinishers(ctx, req.TournamentID)
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}

	// store.TournamentPayouts owns the ladder arithmetic (shared with the
	// director's automatic finish): it keeps an over-promised ladder inside the
	// pool and pays the champion when no ladder was configured.
	payouts := []map[string]interface{}{}
	var paidTotal int64
	for _, p := range store.TournamentPayouts(prizes, finishers, pool) {
		if err := ts.PayWinner(ctx, req.TournamentID, p.UserID, p.AmountMinor); err != nil {
			return "", runtime.NewError(err.Error(), 13)
		}
		if aerr := audit.EmitLedger(ctx, audit.NewPostgresEmitter(db), "tournament_prize_paid", "", map[string]any{
			"tournament_id": req.TournamentID,
			"user_id":       p.UserID,
			"finish_place":  p.Place,
			"amount_cents":  p.AmountMinor,
		}); aerr != nil {
			logger.Warn("tournament prize audit anchor failed: %v", aerr)
		}
		paidTotal += p.AmountMinor
		payouts = append(payouts, map[string]interface{}{
			"user_id":        p.UserID,
			"username":       p.Username,
			"place":          p.Place,
			"amount_minor":   p.AmountMinor,
			"amount_display": dollars(p.AmountMinor),
		})
	}

	// Status is already 'finished' — FinishOnce claimed it before any payout ran.

	out, _ := json.Marshal(map[string]interface{}{
		"tournament_id":      info.ID,
		"status":             "finished",
		"already":            false,
		"entrants":           entrants,
		"prize_pool_minor":   pool,
		"prize_pool_display": dollars(pool),
		"paid_total_minor":   paidTotal,
		"paid_total_display": dollars(paidTotal),
		"payouts":            payouts,
	})
	return string(out), nil
}

// TournamentRulesSet persists the tournament builder's Financials and Rules
// tabs (HRC `comprehensive_tournament_setup`): the club's admin fee percentage,
// a guaranteed prize pool, the daily operating-hours window, tournament-scoped
// auto-away, and the composite time bank.
//
// Authorized as a tournament mutation (creator or a configurer of the owning
// club) rather than platform-admin like TournamentConfig — an operator building
// their own event must be able to set its rules. The values are consumed by
// store.TournamentMoney (fee/guarantee), store.RegistrationOpen (hours) and
// tournament.StartTournament (auto-away, time bank), so nothing set here is
// merely recorded.
func TournamentRulesSet(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	var req struct {
		TournamentID        string `json:"tournament_id"`
		AdminFeeBps         int32  `json:"admin_fee_bps"`
		GuaranteeMinor      int64  `json:"guarantee_minor"`
		OperatingStartMin   int32  `json:"operating_start_min"`
		OperatingEndMin     int32  `json:"operating_end_min"`
		AutoAwayOnTimeout   bool   `json:"auto_away_on_timeout"`
		TimeBankPerHandSecs int32  `json:"time_bank_per_hand_secs"`
	}
	if err := json.Unmarshal([]byte(payload), &req); err != nil || req.TournamentID == "" {
		return "", runtime.NewError("tournament_id required", 3)
	}
	if _, err := requireTournamentOwner(ctx, db, req.TournamentID); err != nil {
		return "", err
	}
	// An admin fee at or above 100% would leave nothing to pay out. Cap it well
	// below that: the pool, not the club's cut, is the point of the event.
	if req.AdminFeeBps < 0 || req.AdminFeeBps > 5000 {
		return "", runtime.NewError("admin fee must be between 0% and 50%", 3)
	}
	if req.GuaranteeMinor < 0 {
		return "", runtime.NewError("guaranteed prize pool cannot be negative", 3)
	}
	if req.OperatingStartMin < 0 || req.OperatingStartMin > 1439 ||
		req.OperatingEndMin < 0 || req.OperatingEndMin > 1439 {
		return "", runtime.NewError("operating hours must be minutes past midnight (0–1439)", 3)
	}
	if req.TimeBankPerHandSecs < 0 || req.TimeBankPerHandSecs > 120 {
		return "", runtime.NewError("per-hand time bank must be between 0 and 120 seconds", 3)
	}

	es := store.NewTournamentExtStore(db)
	info, err := es.GetInfo(ctx, req.TournamentID)
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	if info == nil {
		return "", runtime.NewError("tournament not found", 5)
	}
	// The flat entry fee and the admin percentage both come out of the buy-in, so
	// together they must leave something to play for.
	if info.BuyInMinor > 0 {
		perEntryRake := info.FeeMinor + info.BuyInMinor*int64(req.AdminFeeBps)/10000
		if perEntryRake >= info.BuyInMinor {
			return "", runtime.NewError(
				"the entry fee plus admin fee would consume the whole buy-in — lower one of them", 3)
		}
	}
	if err := es.SetRules(ctx, req.TournamentID, store.TournamentRules{
		AdminFeeBps:         req.AdminFeeBps,
		GuaranteeMinor:      req.GuaranteeMinor,
		OperatingStartMin:   req.OperatingStartMin,
		OperatingEndMin:     req.OperatingEndMin,
		AutoAwayOnTimeout:   req.AutoAwayOnTimeout,
		TimeBankPerHandSecs: req.TimeBankPerHandSecs,
	}); err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	info, err = es.GetInfo(ctx, req.TournamentID)
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	out, _ := json.Marshal(info)
	return string(out), nil
}
