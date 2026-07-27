package store

import (
	"testing"
	"time"
)

// SeatHasPermission decides whether a club operator may move money, kick members
// or change settings. Two of its rules are load-bearing enough that getting them
// wrong is a production incident rather than a bug, so they are pinned here.

func TestSeatHasPermission_EmptyMeansFullAccess(t *testing.T) {
	// THE MIGRATION RULE. Every operator seat that exists today has an empty
	// permissions column. If empty ever meant "no permissions", running the ALTER
	// would strip authority from every operator on every club the moment it
	// deployed — and `main` auto-deploys on push.
	for _, perm := range AllPermissions {
		if !SeatHasPermission("manager", "", perm) {
			t.Errorf("legacy seat with an empty grid was refused %q — this locks out every existing operator", perm)
		}
	}
}

func TestSeatHasPermission_OwnerIsAlwaysAuthorized(t *testing.T) {
	// An owner is authorized structurally, never by the column. Otherwise a
	// mis-saved grid could lock an owner out of their own club with no way back —
	// the RPC that fixes a grid is itself owner-only.
	for _, perm := range AllPermissions {
		if !SeatHasPermission("owner", "manage_members", perm) {
			t.Errorf("owner refused %q despite a narrow grid", perm)
		}
	}
	if !SeatHasPermission("owner", "not-a-real-permission", PermMoney) {
		t.Error("owner refused because of a corrupt grid value")
	}
}

func TestSeatHasPermission_ModeratorCannotTouchMoney(t *testing.T) {
	// The whole point of the feature: moderate without holding the club's funds.
	grid := JoinPermissions(RolePermissions("moderator"))
	if !SeatHasPermission("moderator", grid, PermMembers) {
		t.Error("moderator should be able to manage members")
	}
	for _, denied := range []string{PermMoney, PermTables, PermSettings} {
		if SeatHasPermission("moderator", grid, denied) {
			t.Errorf("moderator was granted %q", denied)
		}
	}
}

func TestSeatHasPermission_ManagerHasEverythingButMoney(t *testing.T) {
	grid := JoinPermissions(RolePermissions("manager"))
	for _, allowed := range []string{PermMembers, PermTables, PermSettings} {
		if !SeatHasPermission("manager", grid, allowed) {
			t.Errorf("manager refused %q", allowed)
		}
	}
	if SeatHasPermission("manager", grid, PermMoney) {
		t.Error("manager was granted manage_money")
	}
}

func TestPermissions_UnknownSlugsAreDropped(t *testing.T) {
	// A typo must never be stored as though it were a granted permission, and must
	// never widen a grid.
	if IsPermission("manage_everything") {
		t.Error("unknown slug accepted as a permission")
	}
	got := SplitPermissions("manage_members, manage_everything ,, manage_money")
	if len(got) != 2 || got[0] != PermMembers || got[1] != PermMoney {
		t.Errorf("SplitPermissions dropped/kept the wrong slugs: %v", got)
	}
}

func TestJoinPermissions_IsCanonicalAndDeduped(t *testing.T) {
	// The stored column must not depend on the order a UI happened to send.
	a := JoinPermissions([]string{PermSettings, PermMembers, PermMembers, "bogus"})
	b := JoinPermissions([]string{PermMembers, PermSettings})
	if a != b {
		t.Errorf("JoinPermissions not canonical: %q vs %q", a, b)
	}
	if a != "manage_members,manage_settings" {
		t.Errorf("unexpected canonical form %q", a)
	}
}

func TestRolePermissions_UnknownRoleIsLeastPrivilege(t *testing.T) {
	// An unrecognised role must fall to the narrowest grid, not the widest.
	got := RolePermissions("something-new")
	if len(got) != 1 || got[0] != PermMembers {
		t.Errorf("unknown role got %v, want least privilege", got)
	}
}

// ── club-night scheduling in the club's timezone ──────────────────────────────

func TestNextRun_ResolvesInClubTimezone(t *testing.T) {
	// A club night is weekday + "HH:MM". Until the club carried a timezone that
	// named no actual instant. New York is UTC-4 in July, so 20:00 local on a
	// Wednesday is 00:00 UTC Thursday.
	loc, err := time.LoadLocation("America/New_York")
	if err != nil {
		t.Skipf("tzdata unavailable in this environment: %v", err)
	}
	sch := ClubSchedule{Enabled: true, Weekday: 3, TimeOfDay: "20:00"} // Wednesday
	now := time.Date(2026, 7, 27, 12, 0, 0, 0, time.UTC)              // Monday

	next := sch.NextRun(now, loc)
	if next == nil {
		t.Fatal("NextRun returned nil for a valid enabled template")
	}
	if next.Weekday() != time.Wednesday {
		t.Errorf("next run landed on %s, want Wednesday", next.Weekday())
	}
	if h, m, _ := next.Clock(); h != 20 || m != 0 {
		t.Errorf("next run local clock = %02d:%02d, want 20:00", h, m)
	}
	if !next.After(now) {
		t.Error("next run is not in the future")
	}
}

func TestNextRun_TodayButAlreadyPastRollsAWeek(t *testing.T) {
	sch := ClubSchedule{Enabled: true, Weekday: 1, TimeOfDay: "09:00"} // Monday
	// Monday 18:00 UTC — 09:00 has gone, so the next one is next Monday.
	now := time.Date(2026, 7, 27, 18, 0, 0, 0, time.UTC)

	next := sch.NextRun(now, time.UTC)
	if next == nil {
		t.Fatal("NextRun returned nil")
	}
	if got := next.Sub(now).Hours(); got < 24 {
		t.Errorf("next run is only %.1fh away — a passed slot was reused instead of rolling forward", got)
	}
	if next.Weekday() != time.Monday {
		t.Errorf("next run on %s, want Monday", next.Weekday())
	}
}

func TestNextRun_DisabledOrUnparseableReturnsNil(t *testing.T) {
	now := time.Date(2026, 7, 27, 12, 0, 0, 0, time.UTC)
	// Nil rather than a guessed instant — a schedule screen showing a confident
	// wrong time is worse than one showing none.
	if (&ClubSchedule{Enabled: false, Weekday: 1, TimeOfDay: "20:00"}).NextRun(now, time.UTC) != nil {
		t.Error("disabled template produced a next run")
	}
	for _, bad := range []string{"", "not-a-time", "25:00", "12:99"} {
		if (&ClubSchedule{Enabled: true, Weekday: 1, TimeOfDay: bad}).NextRun(now, time.UTC) != nil {
			t.Errorf("time_of_day %q produced a next run", bad)
		}
	}
}

func TestAttachNextRuns_UnknownZoneFallsBackToUTC(t *testing.T) {
	list := []ClubSchedule{{Enabled: true, Weekday: 1, TimeOfDay: "20:00"}}
	AttachNextRuns(list, "Mars/Olympus_Mons", time.Date(2026, 7, 27, 12, 0, 0, 0, time.UTC))
	if list[0].NextRunAt == nil {
		t.Error("an unknown zone dropped the next run entirely; it should fall back to UTC")
	}
}
