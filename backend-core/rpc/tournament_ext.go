package rpc

import (
	"context"
	"database/sql"
	"encoding/json"

	"github.com/heroiclabs/nakama-common/runtime"

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
func tournextPrizePool(entrants int, buyInMinor int64) int64 {
	if entrants < 0 {
		entrants = 0
	}
	return int64(entrants) * buyInMinor
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

	pool := tournextPrizePool(registered, info.BuyInMinor)
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

	pool := tournextPrizePool(entrants, info.BuyInMinor)
	totalFees := int64(entrants) * info.FeeMinor
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

	// The last player still 'playing' is the champion — finish place 1.
	if playing == 1 {
		players, err := ts.ListRegistered(ctx, req.TournamentID)
		if err != nil {
			return "", runtime.NewError(err.Error(), 13)
		}
		for _, p := range players {
			if p.Status == "playing" {
				_ = ts.SetFinishPlace(ctx, req.TournamentID, p.UserID, 1)
			}
		}
	}

	// Real prize pool = entrants × buy-in (same basis as the director).
	entrants, err := ts.CountEntrants(ctx, req.TournamentID)
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	pool := tournextPrizePool(entrants, info.BuyInMinor)

	prizes, err := ts.ListPrizes(ctx, req.TournamentID)
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	finishers, err := ts.ListFinishers(ctx, req.TournamentID)
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}

	// Pay the full prize ladder: each tier's basis-point share is split evenly
	// across the finishing positions it covers.
	payouts := []map[string]interface{}{}
	var paidTotal int64
	for _, prize := range prizes {
		places := int(prize.RankTo - prize.RankFrom + 1)
		if places <= 0 {
			places = 1
		}
		perPlace := pool * int64(prize.PayoutBps) / 10000 / int64(places)
		if perPlace <= 0 {
			continue
		}
		for _, f := range finishers {
			if f.FinishPlace < int(prize.RankFrom) || f.FinishPlace > int(prize.RankTo) {
				continue
			}
			if err := ts.PayWinner(ctx, req.TournamentID, f.UserID, perPlace); err != nil {
				return "", runtime.NewError(err.Error(), 13)
			}
			paidTotal += perPlace
			payouts = append(payouts, map[string]interface{}{
				"user_id":        f.UserID,
				"username":       f.Username,
				"place":          f.FinishPlace,
				"amount_minor":   perPlace,
				"amount_display": dollars(perPlace),
			})
		}
	}

	if err := ts.Finish(ctx, req.TournamentID); err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}

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
