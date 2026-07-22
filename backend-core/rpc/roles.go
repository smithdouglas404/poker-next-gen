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
	PlatformAdmin bool              `json:"platform_admin"`
	ClubAdminOf   []string          `json:"club_admin_of"`
	Clubs         []store.ClubRole  `json:"clubs"` // fine per-club role (owner/manager/agent/admin/member)
}

// MeRoles returns the caller's platform-admin flag, the clubs they can
// administer, and their fine role in every club they belong to, so the Command
// Center can gate actions by role in the active club. Still advisory: the
// backend enforces every action independently.
func MeRoles(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	userID, err := callerID(ctx)
	if err != nil {
		return "", err
	}
	resp := meRolesResponse{
		PlatformAdmin: isAdmin(userID),
		ClubAdminOf:   []string{},
		Clubs:         []store.ClubRole{},
	}
	cs := store.NewClubStore(db)
	if ids, err := cs.ClubsAdministeredBy(ctx, userID); err == nil && ids != nil {
		resp.ClubAdminOf = ids
	}
	if roles, err := cs.RolesFor(ctx, userID); err == nil && roles != nil {
		resp.Clubs = roles
	}
	out, err := json.Marshal(resp)
	if err != nil {
		return "", err
	}
	return string(out), nil
}
