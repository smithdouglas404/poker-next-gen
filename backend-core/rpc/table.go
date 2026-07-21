package rpc

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"

	"github.com/heroiclabs/nakama-common/runtime"

	"github.com/smithdouglas404/poker-next-gen/backend-core/protocol"
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

	matchID, err := nk.MatchCreate(ctx, protocol.MatchModule, map[string]interface{}{
		"room_id":     roomID,
		"small_blind": sb,
		"big_blind":   bb,
		"buy_in":      buyIn,
		"max_seats":   maxSeats,
		"num_bots":    numBots,
	})
	if err != nil {
		return "", err
	}

	resp, err := json.Marshal(protocol.TableCreateResponse{
		MatchID: matchID,
		RoomID:  roomID,
		Label:   roomID,
	})
	if err != nil {
		return "", err
	}
	return string(resp), nil
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
