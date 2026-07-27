package rpc

import (
	"context"
	"database/sql"
	"encoding/json"

	"github.com/heroiclabs/nakama-common/runtime"

	"github.com/smithdouglas404/poker-next-gen/backend-core/store"
)

// ClubLicenceGet reports whether a club may host cash games, and if not, why.
//
// The "why" is the point. A host who cannot open a cash table needs to know
// whether the fix is an upgrade, a KYC submission, or asking a co-owner to do
// one of those — a greyed-out button teaches none of that, and the licence
// depends on someone who may not even be the person looking at the screen.
//
// Readable by anyone who can act for the club: they are the people who would
// otherwise hit the wall at create time.
func ClubLicenceGet(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	var req struct {
		ClubID string `json:"club_id"`
	}
	if err := json.Unmarshal([]byte(payload), &req); err != nil || req.ClubID == "" {
		return "", runtime.NewError("club_id required", 3)
	}
	if err := requireClubReader(ctx, db, req.ClubID); err != nil {
		return "", err
	}
	lic := store.LicenceFor(ctx, db, req.ClubID)
	out, _ := json.Marshal(lic)
	return string(out), nil
}
