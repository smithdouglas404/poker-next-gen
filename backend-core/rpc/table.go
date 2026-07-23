package rpc

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"strings"

	"github.com/heroiclabs/nakama-common/runtime"

	"github.com/smithdouglas404/poker-next-gen/backend-core/billing"
	"github.com/smithdouglas404/poker-next-gen/backend-core/poker"
	"github.com/smithdouglas404/poker-next-gen/backend-core/protocol"
	"github.com/smithdouglas404/poker-next-gen/backend-core/store"
)

func TableCreate(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	var req protocol.TableCreateRequest
	if payload != "" {
		if err := json.Unmarshal([]byte(payload), &req); err != nil {
			return "", err
		}
	}
	sb := int64(100)
	bb := int64(200)
	buyIn := int64(100000)
	if req.SmallBlind > 0 {
		sb = req.SmallBlind
	}
	if req.BigBlind > 0 {
		bb = req.BigBlind
	}
	if req.BuyIn > 0 {
		buyIn = req.BuyIn
	}
	// Buy-in range. Default the min to the default buy-in and the max to 3× it
	// when unset, so a table always has a sensible band.
	minBuyIn := req.MinBuyIn
	if minBuyIn <= 0 {
		minBuyIn = buyIn
	}
	maxBuyIn := req.MaxBuyIn
	if maxBuyIn <= 0 {
		maxBuyIn = buyIn * 3
	}
	if maxBuyIn < minBuyIn {
		maxBuyIn = minBuyIn
	}

	// Auth mandatory (SEC-1): fail closed. Previously the tier cap was applied
	// only when a session happened to be present, so an unauthenticated caller
	// could create a table and dodge the stakes limit entirely.
	userID, uerr := callerID(ctx)
	if uerr != nil {
		return "", uerr
	}
	// Jurisdiction gate: block table creation from a restricted region / network.
	if err := guardJurisdiction(ctx, db); err != nil {
		return "", err
	}
	// Tier gate: cap the big blind to what the caller's plan allows. Free plays
	// the default $1/$2; higher stakes require an upgrade (platinum = unlimited).
	tier := store.SubscriptionTier(ctx, db, userID)
	if maxBB := billing.EffectiveMaxBigBlindCents(tier); bb > maxBB {
		return "", runtime.NewError(
			fmt.Sprintf("stakes exceed your plan (max big blind %d¢) — upgrade to play higher", maxBB), 7)
	}

	roomID := req.Name
	if roomID == "" {
		roomID = fmt.Sprintf("table-%d", sb)
	}
	maxSeats := 6
	if req.MaxSeats >= 2 {
		maxSeats = req.MaxSeats
	}
	if maxSeats > protocol.MaxSeats {
		maxSeats = protocol.MaxSeats
	}

	numBots := req.NumBots
	if numBots < 0 {
		numBots = 0
	}
	if numBots > maxSeats-1 { // always leave a seat for the human creator
		numBots = maxSeats - 1
	}

	// Minimum players before hands auto-start (operator-configurable). Default 2
	// (heads-up); clamp to [2, maxSeats] so it can never exceed the seat count.
	minPlayers := 2
	if req.MinPlayers >= 2 {
		minPlayers = req.MinPlayers
	}
	if minPlayers > maxSeats {
		minPlayers = maxSeats
	}

	variant := poker.VariantHoldem
	if req.Variant == poker.VariantPLO {
		variant = poker.VariantPLO
	}

	// Optional self-managing duration: cap to [0, 12h] and convert to seconds.
	durationSecs := 0
	if req.DurationMins > 0 {
		mins := req.DurationMins
		if mins > 720 {
			mins = 720
		}
		durationSecs = mins * 60
	}

	hostUserID, _ := callerID(ctx) // the creator is the table host

	// Shot clock: clamp per-table action / time-bank seconds to [0, 120]. 0 keeps
	// the server defaults.
	clampSecs := func(v int) int {
		if v < 0 {
			return 0
		}
		if v > 120 {
			return 120
		}
		return v
	}
	actionSecs := clampSecs(req.ActionSecs)
	timeBankSecs := clampSecs(req.TimeBankSecs)

	// Club-bound table: buy-ins draw the player's club-allocated balance (union
	// model) and pots are raked to the club. Only a club owner/configurer may
	// stand one up, so a random member can't spin tables on someone's club.
	if req.ClubID != "" {
		if _, err := requireClubConfigurer(ctx, db, req.ClubID); err != nil {
			return "", err
		}
	}

	matchID, err := nk.MatchCreate(ctx, protocol.MatchModule, map[string]interface{}{
		"room_id":       roomID,
		"club_id":       req.ClubID,
		"war_id":        req.WarID,
		"league_id":     req.LeagueID,
		"small_blind":   sb,
		"big_blind":     bb,
		"buy_in":        buyIn,
		"max_seats":     maxSeats,
		"min_players":   minPlayers,
		"min_buy_in":    minBuyIn,
		"max_buy_in":    maxBuyIn,
		"num_bots":      numBots,
		"variant":       variant,
		"duration_secs": durationSecs,
		"action_secs":   actionSecs,
		"time_bank_secs": timeBankSecs,
		"host_user_id":  hostUserID,
		// Optional table features (#41); default-off so a plain table is unchanged.
		"allow_straddle":     req.AllowStraddle,
		"allow_bomb_pot":     req.AllowBombPot,
		"bomb_pot_ante":      req.BombPotAnte,
		"allow_insurance":    req.AllowInsurance,
		"allow_run_it_twice": req.AllowRunItTwice,
	})
	if err != nil {
		return "", err
	}

	// Allocate a short shareable room code (best-effort; table still works without).
	code, _ := store.NewRoomCodeStore(db).Create(ctx, matchID)

	resp, err := json.Marshal(protocol.TableCreateResponse{
		MatchID: matchID,
		RoomID:  roomID,
		Label:   roomID,
		Code:    code,
	})
	if err != nil {
		return "", err
	}
	return string(resp), nil
}

// RoomResolve maps a short room code to its match id, for join-by-code / links.
func RoomResolve(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	var req struct {
		Code string `json:"code"`
	}
	if payload != "" {
		_ = json.Unmarshal([]byte(payload), &req)
	}
	code := strings.ToUpper(strings.TrimSpace(req.Code))
	if code == "" {
		return "", runtime.NewError("code required", 3)
	}
	matchID, err := store.NewRoomCodeStore(db).Resolve(ctx, code)
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	if matchID == "" {
		return "", runtime.NewError("no table found for that code", 5)
	}
	out, _ := json.Marshal(map[string]string{"match_id": matchID, "code": code})
	return string(out), nil
}

// TableAddBot seats an AI player at the given match (fills empty seats so a
// player can play against bots). Signals the match to seat the bot.
func TableAddBot(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	var req struct {
		MatchID string `json:"match_id"`
	}
	if err := json.Unmarshal([]byte(payload), &req); err != nil {
		return "", runtime.NewError("invalid payload", 3)
	}
	if req.MatchID == "" {
		return "", runtime.NewError("match_id required", 3)
	}
	if _, err := nk.MatchSignal(ctx, req.MatchID, `{"type":"add_bot"}`); err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	return `{"ok":true}`, nil
}

// TablesFreezeAll is the platform-admin "emergency freeze all" / resume: it
// signals every active holdem table to pause (or resume) dealing. Uses a
// MatchSignal so it works even on tables whose host is not connected — the
// AdminPaused flag is honored regardless of host presence.
func TablesFreezeAll(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	if _, err := aiprocRequireAdmin(ctx); err != nil {
		return "", err
	}
	var req struct {
		Resume bool `json:"resume"`
	}
	_ = json.Unmarshal([]byte(payload), &req)
	action := "pause"
	if req.Resume {
		action = "resume"
	}
	matches, err := nk.MatchList(ctx, 100, true, "", nil, nil, "+label.module:holdem_cash_6max")
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	signal := `{"type":"` + action + `"}`
	n := 0
	for _, m := range matches {
		if _, err := nk.MatchSignal(ctx, m.MatchId, signal); err == nil {
			n++
		}
	}
	out, _ := json.Marshal(map[string]interface{}{"ok": true, "action": action, "tables": n})
	return string(out), nil
}

func TableList(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	matches, err := nk.MatchList(ctx, 20, true, "", nil, nil, "+label.module:holdem_cash_6max")
	if err != nil {
		return "", err
	}
	items := make([]protocol.TableListItem, 0, len(matches))
	for _, m := range matches {
		items = append(items, protocol.TableListItem{
			MatchID: m.MatchId,
			Label:   m.Label.GetValue(),
		})
	}
	resp, err := json.Marshal(protocol.TableListResponse{Matches: items})
	if err != nil {
		return "", err
	}
	return string(resp), nil
}
