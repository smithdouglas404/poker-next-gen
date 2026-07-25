package rpc

import (
	"context"
	"database/sql"
	"encoding/json"

	"github.com/heroiclabs/nakama-common/runtime"
)

// AdminCashGames lists every live cash game for HRC platform admins. By the
// certification rule, registered players buy into cash games ONLY from the
// funded, KYC-verified global wallet (enforced in reserveBuyIn), so every table
// here is a verified global-wallet cash game — whether stood up by a club owner
// or a sponsor. Admin only. The label is the same JSON the lobby/cyber-deck
// parse (room_id, club_id, blinds, seated, open_seats, status).
func AdminCashGames(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	userID, _ := ctx.Value(runtime.RUNTIME_CTX_USER_ID).(string)
	if !isAdmin(userID) {
		return "", runtime.NewError("forbidden", 7)
	}
	matches, err := nk.MatchList(ctx, 100, true, "", nil, nil, "+label.module:holdem_cash_6max")
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	type item struct {
		MatchID   string `json:"match_id"`
		Label     string `json:"label"`
		Size      int    `json:"size"`
		Certified bool   `json:"certified"`
	}
	items := make([]item, 0, len(matches))
	for _, m := range matches {
		items = append(items, item{
			MatchID:   m.MatchId,
			Label:     m.Label.GetValue(),
			Size:      int(m.Size),
			Certified: true, // global-wallet only, by rule
		})
	}
	out, _ := json.Marshal(map[string]interface{}{"cash_games": items, "count": len(items)})
	return string(out), nil
}
