package rpc

import (
	"context"
	"database/sql"
	"encoding/json"

	"github.com/heroiclabs/nakama-common/runtime"
)

// MatchmakerEnqueue returns matchmaker query parameters for the client socket.
// Tickets are added client-side via socket.addMatchmaker; the server handles
// matching through RegisterMatchmakerMatched in main.go.
func MatchmakerEnqueue(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	var req struct {
		MinPlayers int    `json:"min_players"`
		MaxPlayers int    `json:"max_players"`
		ClubID     string `json:"club_id,omitempty"`
		BuyIn      int64  `json:"buy_in_cents"`
	}
	if payload != "" {
		if err := json.Unmarshal([]byte(payload), &req); err != nil {
			return "", runtime.NewError("invalid payload", 3)
		}
	}
	if req.MinPlayers < 2 {
		req.MinPlayers = 2
	}
	if req.MaxPlayers < req.MinPlayers {
		req.MaxPlayers = req.MinPlayers
	}
	if req.MaxPlayers > 6 {
		req.MaxPlayers = 6
	}

	stringProps := map[string]string{
		"mode": "holdem_cash_6max",
	}
	if req.ClubID != "" {
		stringProps["club_id"] = req.ClubID
	}
	if req.BuyIn > 0 {
		stringProps["buy_in_cents"] = jsonNumber(req.BuyIn)
	}

	out, _ := json.Marshal(map[string]interface{}{
		"query":       "+properties.mode:holdem_cash_6max",
		"min_count":   req.MinPlayers,
		"max_count":   req.MaxPlayers,
		"string_properties": stringProps,
		"note":        "Call socket.addMatchmaker with these params, then join the returned match.",
	})
	return string(out), nil
}

func jsonNumber(n int64) string {
	b, _ := json.Marshal(n)
	return string(b)
}
