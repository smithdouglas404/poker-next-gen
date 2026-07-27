package store

import "strings"

// Graduated club permissions.
//
// Club authority used to be binary. requireClubConfigurer accepted
// `can_configure OR role=='owner'` and that single check guarded 39 call sites —
// allocating balances, approving credit, setting rake, kicking members, granting
// other operators authority, creating tables, running tournaments. There was no
// way to let somebody moderate a club without also handing them its money.
//
// A seat's capabilities are a comma-separated slug list on poker_owner.
// This file owns the vocabulary and the parsing; rpc/clubperm.go owns the gate.

// The four capabilities. Deliberately coarse: a grid an operator can actually
// reason about beats a per-RPC matrix nobody configures correctly.
const (
	// PermMembers — invite, revoke, review join requests, kick, roster role,
	// announcements. This is the "moderator" capability.
	PermMembers = "manage_members"
	// PermMoney — allocate balances, approve/deny credit, rake config and ledger,
	// guest reconciliation. Anything that moves or reveals club funds.
	PermMoney = "manage_money"
	// PermTables — create tables, schedule and launch club nights, mutate
	// tournaments.
	PermTables = "manage_tables"
	// PermSettings — club update, branding, visibility, and granting other
	// operators seats.
	PermSettings = "manage_settings"
)

// AllPermissions is the canonical set, in display order.
var AllPermissions = []string{PermMembers, PermMoney, PermTables, PermSettings}

// IsPermission reports whether slug is one of the four known capabilities.
// Unknown slugs are rejected at write time rather than silently stored, so a
// typo can never masquerade as a granted permission.
func IsPermission(slug string) bool {
	for _, p := range AllPermissions {
		if p == slug {
			return true
		}
	}
	return false
}

// RolePermissions is the preset capability set for a seat role. Used to fill in
// permissions when an operator is added without an explicit grid.
//
// `owner` returns everything, but the gate never consults this for owners — an
// owner is authorized structurally so they can never lock themselves out of
// their own club.
func RolePermissions(role string) []string {
	switch role {
	case "owner":
		return append([]string{}, AllPermissions...)
	case "manager":
		// Everything except the money.
		return []string{PermMembers, PermTables, PermSettings}
	case "moderator", "agent":
		return []string{PermMembers}
	default:
		return []string{PermMembers}
	}
}

// SplitPermissions parses the stored column into slugs, dropping blanks and
// anything not in the known set.
func SplitPermissions(stored string) []string {
	out := []string{}
	for _, part := range strings.Split(stored, ",") {
		p := strings.TrimSpace(part)
		if p != "" && IsPermission(p) {
			out = append(out, p)
		}
	}
	return out
}

// JoinPermissions renders slugs back to the stored form, de-duplicated and in
// canonical order so the column never depends on the order a UI sent them.
func JoinPermissions(perms []string) string {
	seen := map[string]bool{}
	for _, p := range perms {
		if IsPermission(p) {
			seen[p] = true
		}
	}
	ordered := []string{}
	for _, p := range AllPermissions {
		if seen[p] {
			ordered = append(ordered, p)
		}
	}
	return strings.Join(ordered, ",")
}

// SeatHasPermission reports whether a seat with this role and stored permission
// column may perform `perm`.
//
// TWO RULES CARRY THE WHOLE MIGRATION:
//
//  1. An owner is always authorized. The column is not consulted. Otherwise a
//     mis-saved grid could lock an owner out of their own club with no way back.
//
//  2. An EMPTY column means full access. Every seat that exists today has an
//     empty column, and enforcement must not begin the instant the ALTER runs —
//     that would strip authority from every operator on every club at deploy
//     time. A seat becomes constrained only once an owner explicitly assigns it
//     permissions.
//
// Rule 2 is why this returns true for "", and reversing it is a production
// outage, not a stricter default.
func SeatHasPermission(role, storedPermissions, perm string) bool {
	if role == "owner" {
		return true
	}
	if strings.TrimSpace(storedPermissions) == "" {
		return true // legacy seat, predates the grid
	}
	for _, p := range SplitPermissions(storedPermissions) {
		if p == perm {
			return true
		}
	}
	return false
}
