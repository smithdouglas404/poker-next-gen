package rpc

import (
	"context"
	"database/sql"
	"encoding/json"

	"github.com/heroiclabs/nakama-common/runtime"

	"github.com/smithdouglas404/poker-next-gen/backend-core/store"
)

// Seat sessions (Tier-1 C). Every non-bot sitting (sit → leave) at a table is
// recorded with duration, hands played, stack-on-leave and net, plus advisory
// hit-and-run / ratholing flags. This lists a club's recent sittings for the
// owner-hub Seat Sessions panel so an operator can spot a player who bought in,
// won a little, and immediately left, or who left and re-bought short. Owner /
// configurer only — mirrors the guest-session owner gate. Read-only; nothing here
// moves money or blocks play.
func SeatSessionsList(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	if _, err := callerID(ctx); err != nil {
		return "", err
	}
	var req struct {
		ClubID string `json:"club_id"`
		Limit  int    `json:"limit"`
	}
	if err := json.Unmarshal([]byte(payload), &req); err != nil || req.ClubID == "" {
		return "", runtime.NewError("club_id required", 3)
	}
	if _, err := requireClubConfigurer(ctx, db, req.ClubID); err != nil {
		return "", err
	}
	list, err := store.NewSeatSessionStore(db).ListForClub(ctx, req.ClubID, req.Limit)
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	b, _ := json.Marshal(map[string]interface{}{"sessions": list})
	return string(b), nil
}
