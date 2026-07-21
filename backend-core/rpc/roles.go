package rpc

import (
	"context"
	"database/sql"
	"encoding/json"

	"github.com/heroiclabs/nakama-common/runtime"

	"github.com/smithdouglas404/poker-next-gen/backend-core/store"
)

// meRolesResponse tells the client which privileged surfaces to reveal. The
// backend still enforces every action independently (requireClubConfigurer /
// isAdmin) — this only drives what the UI shows, so a tampered client gains
// nothing.
type meRolesResponse struct {
	PlatformAdmin bool     `json:"platform_admin"`
	ClubAdminOf   []string `json:"club_admin_of"`
}

// MeRoles returns the caller's platform-admin flag and the clubs they can
// administer, so the Command Center can hide actions they aren't entitled to.
func MeRoles(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	userID, err := callerID(ctx)
	if err != nil {
		return "", err
	}
	resp := meRolesResponse{
		PlatformAdmin: isAdmin(userID),
		ClubAdminOf:   []string{},
	}
	if ids, err := store.NewClubStore(db).ClubsAdministeredBy(ctx, userID); err == nil && ids != nil {
		resp.ClubAdminOf = ids
	}
	out, err := json.Marshal(resp)
	if err != nil {
		return "", err
	}
	return string(out), nil
}
