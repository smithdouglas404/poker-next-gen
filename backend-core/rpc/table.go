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

	// Tier gate: cap the big blind to what the caller's plan allows. Free plays
	// the default $1/$2; higher stakes require an upgrade (platinum = unlimited).
	if userID, uerr := callerID(ctx); uerr == nil {
		tier := store.SubscriptionTier(ctx, db, userID)
		if maxBB := billing.EffectiveMaxBigBlindCents(tier); bb > maxBB {
			return "", runtime.NewError(
				fmt.Sprintf("stakes exceed your plan (max big blind %d¢) — upgrade to play higher", maxBB), 7)
		}
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

	matchID, err := nk.MatchCreate(ctx, protocol.MatchModule, map[string]interface{}{
		"room_id":       roomID,
		"small_blind":   sb,
		"big_blind":     bb,
		"buy_in":        buyIn,
		"max_seats":     maxSeats,
		"num_bots":      numBots,
		"variant":       variant,
		"duration_secs": durationSecs,
		"host_user_id":  hostUserID,
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
