package rpc

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"

	"github.com/heroiclabs/nakama-common/runtime"

	"github.com/smithdouglas404/poker-next-gen/backend-core/store"
)

// Graduated club permissions — the authorization gate.
//
// store/clubperm.go owns the vocabulary and the rules; this file applies them at
// the RPC boundary and exposes the one RPC that edits a seat's grid.

// permLabel turns a slug into operator-facing wording for the refusal message.
// Errors name the capability, not the slug, because the operator's mental model
// is "I can't touch the money here", not "manage_money".
func permLabel(perm string) string {
	switch perm {
	case store.PermMembers:
		return "manage members"
	case store.PermMoney:
		return "manage club funds"
	case store.PermTables:
		return "manage tables"
	case store.PermSettings:
		return "change club settings"
	}
	return perm
}

// requireClubPermission authorizes the caller for ONE capability at a club.
//
// It layers on requireClubConfigurer rather than replacing it, so it is strictly
// narrower than the existing gate: anyone it authorizes would already have been
// authorized before. That is what makes converting call sites to it safe — a
// conversion can only ever remove access from a seat whose owner has explicitly
// constrained it, never grant new access.
func requireClubPermission(ctx context.Context, db *sql.DB, clubID, perm string) (string, error) {
	userID, err := requireClubConfigurer(ctx, db, clubID)
	if err != nil {
		return "", err
	}
	owners, err := store.NewClubStore(db).ListOwners(ctx, clubID)
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	for _, o := range owners {
		if o.UserID != userID {
			continue
		}
		if store.SeatHasPermission(o.Role, o.Permissions, perm) {
			return userID, nil
		}
		return "", runtime.NewError(
			fmt.Sprintf("your club role does not let you %s — ask an owner to grant it", permLabel(perm)), 7)
	}
	// requireClubConfigurer already proved a seat exists; reaching here means the
	// roster changed underneath us. Fail closed.
	return "", runtime.NewError("forbidden: not a club owner/configurer", 7)
}

// clubRequires2FA reports whether the club demands TOTP on its operators.
func clubRequires2FA(ctx context.Context, db *sql.DB, clubID string) bool {
	c, err := store.NewClubStore(db).GetByID(ctx, clubID)
	return err == nil && c != nil && c.TwoFARequired
}

// callerHas2FA reports whether the caller has TOTP enrolled AND enabled.
func callerHas2FA(ctx context.Context, db *sql.DB, userID string) bool {
	t, err := store.NewResponsibleStore(db).GetTwoFA(ctx, userID)
	return err == nil && t != nil && t.Enabled
}

// ClubPermissionsSet assigns a seat's role and capability grid.
//
// Owner-only, via clubsextRequireOwner rather than requireClubConfigurer: handing
// out authority must not itself be delegable, or a constrained operator could
// grant themselves the permissions they were denied.
func ClubPermissionsSet(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	var req struct {
		ClubID      string   `json:"club_id"`
		UserID      string   `json:"user_id"`
		Role        string   `json:"role"`
		Permissions []string `json:"permissions"`
	}
	if err := json.Unmarshal([]byte(payload), &req); err != nil {
		return "", runtime.NewError("invalid payload", 3)
	}
	if req.ClubID == "" || req.UserID == "" {
		return "", runtime.NewError("club_id and user_id required", 3)
	}
	if _, err := clubsextRequireOwner(ctx, db, req.ClubID); err != nil {
		return "", err
	}
	switch req.Role {
	case "owner", "manager", "moderator", "agent", "":
	default:
		return "", runtime.NewError("role must be one of owner, manager, moderator, agent", 3)
	}
	for _, p := range req.Permissions {
		if !store.IsPermission(p) {
			return "", runtime.NewError(fmt.Sprintf("unknown permission %q", p), 3)
		}
	}

	cs := store.NewClubStore(db)
	owners, err := cs.ListOwners(ctx, req.ClubID)
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	var seat *struct {
		Role string
	}
	ownerCount := 0
	found := false
	currentRole := ""
	for _, o := range owners {
		if o.Role == "owner" {
			ownerCount++
		}
		if o.UserID == req.UserID {
			found, currentRole = true, o.Role
		}
	}
	_ = seat
	if !found {
		return "", runtime.NewError("that user is not an operator of this club", 5)
	}
	role := req.Role
	if role == "" {
		role = currentRole
	}
	// A club with no owner cannot be administered by anyone ever again — the
	// owner-only gate above would reject every future caller.
	if currentRole == "owner" && role != "owner" && ownerCount <= 1 {
		return "", runtime.NewError("this is the club's only owner — promote another owner first", 9)
	}

	// An explicitly empty grid would read as "full access" under the legacy rule,
	// which is the opposite of what an owner clearing every box means. Store the
	// role's preset instead, and say so.
	perms := req.Permissions
	if len(perms) == 0 {
		perms = store.RolePermissions(role)
	}

	if err := cs.SetOwnerPermissions(ctx, req.ClubID, req.UserID, role, store.JoinPermissions(perms)); err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	out, _ := json.Marshal(map[string]interface{}{
		"ok":          true,
		"club_id":     req.ClubID,
		"user_id":     req.UserID,
		"role":        role,
		"permissions": store.SplitPermissions(store.JoinPermissions(perms)),
	})
	return string(out), nil
}

// ClubPermissionsList returns every operator seat with its role and grid, plus
// the catalog of assignable capabilities so the UI never hard-codes the list.
func ClubPermissionsList(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	var req struct {
		ClubID string `json:"club_id"`
	}
	if err := json.Unmarshal([]byte(payload), &req); err != nil || req.ClubID == "" {
		return "", runtime.NewError("club_id required", 3)
	}
	if _, err := requireClubConfigurer(ctx, db, req.ClubID); err != nil {
		return "", err
	}
	owners, err := store.NewClubStore(db).ListOwners(ctx, req.ClubID)
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	seats := make([]map[string]interface{}, 0, len(owners))
	for _, o := range owners {
		seats = append(seats, map[string]interface{}{
			"user_id":       o.UserID,
			"role":          o.Role,
			"equity_bps":    o.EquityBps,
			"can_configure": o.CanConfigure,
			"permissions":   store.SplitPermissions(o.Permissions),
			// legacy=true means "no grid assigned yet, so this seat still has full
			// access". The UI must show that, not an empty row of unchecked boxes.
			"legacy": o.Role != "owner" && store.JoinPermissions(store.SplitPermissions(o.Permissions)) == "",
		})
	}
	out, _ := json.Marshal(map[string]interface{}{
		"club_id":     req.ClubID,
		"seats":       seats,
		"catalog":     store.AllPermissions,
		"roles":       []string{"owner", "manager", "moderator", "agent"},
		"role_preset": map[string][]string{
			"owner":     store.RolePermissions("owner"),
			"manager":   store.RolePermissions("manager"),
			"moderator": store.RolePermissions("moderator"),
			"agent":     store.RolePermissions("agent"),
		},
	})
	return string(out), nil
}
