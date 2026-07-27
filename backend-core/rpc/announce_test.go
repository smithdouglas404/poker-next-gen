package rpc

import (
	"testing"
	"time"
)

// A club announcement now fans out to every targeted member instead of writing a
// row nobody reads. These pin the three things that guard that fan-out.

func TestAnnounceSeverity_ClampsToWhatClientsRender(t *testing.T) {
	// Severity used to be an unvalidated passthrough. That is how "high" — written
	// by the in-table composer (overlaySession.ts) — ended up stored: a value no
	// severity switch in the frontend recognises, so it silently rendered as the
	// default while claiming to be urgent.
	for _, bad := range []string{"high", "urgent", "HIGH", "", "critical!", "info "} {
		if got := announceSeverity(bad); got != "info" {
			t.Errorf("announceSeverity(%q) = %q, want the safe default %q", bad, got, "info")
		}
	}
	for _, good := range []string{"warning", "critical"} {
		if got := announceSeverity(good); got != good {
			t.Errorf("announceSeverity(%q) = %q, want it preserved", good, got)
		}
	}
}

func TestAnnounceAudienceAndChannel_UnchangedBehaviour(t *testing.T) {
	// Regression guard: these two clamps predate delivery and the stored values
	// now actually select recipients, so silently widening them would broadcast
	// to the wrong people.
	for _, tc := range []struct{ in, want string }{
		{"private", "private"}, {"tournament", "tournament"},
		{"all", "all"}, {"", "all"}, {"everyone", "all"}, {"Private", "all"},
	} {
		if got := announceAudience(tc.in); got != tc.want {
			t.Errorf("announceAudience(%q) = %q, want %q", tc.in, got, tc.want)
		}
	}
	for _, tc := range []struct{ in, want string }{
		{"modal", "modal"}, {"chat", "chat"},
		{"overlay", "overlay"}, {"", "overlay"}, {"banner", "overlay"},
	} {
		if got := announceChannel(tc.in); got != tc.want {
			t.Errorf("announceChannel(%q) = %q, want %q", tc.in, got, tc.want)
		}
	}
}

func TestClubAnnounceAllowed_RateLimitsPerClub(t *testing.T) {
	// Reset shared state so this test does not depend on execution order.
	clubAnnounceMu.Lock()
	clubAnnounceLast = map[string]time.Time{}
	clubAnnounceMu.Unlock()

	if _, ok := clubAnnounceAllowed("club-a"); !ok {
		t.Fatal("first broadcast for a club was refused")
	}
	wait, ok := clubAnnounceAllowed("club-a")
	if ok {
		t.Error("second immediate broadcast was allowed — a whole membership can be spammed")
	}
	if wait <= 0 || wait > int(clubAnnounceCooldown.Seconds())+1 {
		t.Errorf("reported wait of %ds is not within the cooldown window", wait)
	}

	// The limit is per club: one club broadcasting must not mute another.
	if _, ok := clubAnnounceAllowed("club-b"); !ok {
		t.Error("a different club was blocked by club-a's cooldown")
	}
}

func TestClubAnnounceAllowed_ReleasesAfterCooldown(t *testing.T) {
	clubAnnounceMu.Lock()
	clubAnnounceLast = map[string]time.Time{"club-c": time.Now().Add(-clubAnnounceCooldown - time.Second)}
	clubAnnounceMu.Unlock()

	if _, ok := clubAnnounceAllowed("club-c"); !ok {
		t.Error("broadcast still refused after the cooldown had elapsed")
	}
}

func TestClubAnnouncementCode_DistinctFromPlatform(t *testing.T) {
	// Clients tell a club broadcast from a platform-wide one by notification code
	// alone. Collapsing them onto the same code would make a club notice
	// indistinguishable from an operator-wide alert.
	if clubAnnouncementCode == 555 {
		t.Error("club announcements share the platform announcement code 555")
	}
}

func TestNotificationCodes_AreAllDistinct(t *testing.T) {
	// Every notification the client renders differently needs its own code. An
	// invitation is ACTIONABLE (accept / decline) where the two announcement codes
	// are read-only, so collapsing it onto either would strip the buttons off it —
	// and the invitee would be back to having no way to accept, which is the exact
	// defect this code was added to fix.
	codes := map[string]int{
		"platform announcement": 555,
		"club announcement":     clubAnnouncementCode,
		"club invite":           clubInviteCode,
	}
	seen := map[int]string{}
	for name, code := range codes {
		if prev, dup := seen[code]; dup {
			t.Errorf("%q and %q share notification code %d", name, prev, code)
		}
		seen[code] = name
	}
}

func TestInviteExpiryDefaults(t *testing.T) {
	// An accepted invite immediately allocates its credit line against the club,
	// so a pending one is an outstanding commitment. The default window must be
	// bounded, and the cap must not be so far out that "bounded" is meaningless.
	if defaultInviteExpiryDays <= 0 {
		t.Error("invites default to never expiring — a stale invite would still draw its credit line")
	}
	if defaultInviteExpiryDays > maxInviteExpiryDays {
		t.Errorf("default expiry %d exceeds the maximum %d", defaultInviteExpiryDays, maxInviteExpiryDays)
	}
}
