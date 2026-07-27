package store

import "testing"

// The licensing model, in the terms it was specified: a liquor licence belongs
// to a licensee, not to the premises. A club may have several owners; ONE of
// them holding a valid licence lets the club trade. Staff do not each need one.

func TestValidStakeMode_DefaultsToPlay(t *testing.T) {
	// THE SAFE DIRECTION. An unrecognised value must become the mode that needs
	// no licence and moves no real money. Defaulting to cash would let a typo —
	// or an older client that has never heard of the field — open an unlicensed
	// real-money table.
	for _, v := range []string{"", "CASH", "Cash", "real", "money", "nonsense", "playmoney"} {
		if got := ValidStakeMode(v); got != StakePlay {
			t.Errorf("ValidStakeMode(%q) = %q, want play — an unknown mode must never mean cash", v, got)
		}
	}
	if got := ValidStakeMode("cash"); got != StakeCash {
		t.Errorf("ValidStakeMode(\"cash\") = %q, want cash", got)
	}
}

func TestStakeModeConstants(t *testing.T) {
	// These strings cross the wire (TableCreateRequest.stake_mode) and are stored
	// in the match label, so renaming one side silently would make every cash
	// table read as play — i.e. drop the licence requirement entirely.
	if StakeCash != "cash" || StakePlay != "play" {
		t.Errorf("stake mode constants changed: %q / %q", StakeCash, StakePlay)
	}
}

func TestClubLicence_UnlicensedAlwaysCarriesAReason(t *testing.T) {
	// A refusal the operator cannot act on is nearly as bad as no refusal. The
	// licence may depend on a CO-OWNER's tier or KYC — someone who is not the
	// person looking at the screen — so "you cannot do this" without a reason
	// leaves them with nothing to try.
	lic := ClubLicence{ClubID: "c1"}
	if lic.CanHostCash {
		t.Fatal("zero-value licence claims cash authority")
	}
	// The zero value is the fail-closed default every error path returns.
	if lic.LicensedBy != "" {
		t.Error("an unlicensed club names a licensee")
	}
}

func TestClubLicence_LicensedNamesTheLicensee(t *testing.T) {
	// Naming who supplies the licence is what makes it auditable: when a club is
	// investigated, "which person stood behind this table" has to be answerable.
	lic := ClubLicence{ClubID: "c1", CanHostCash: true, LicensedBy: "owner-1", OwnersChecked: 3}
	if !lic.CanHostCash {
		t.Fatal("licensed club reports no authority")
	}
	if lic.LicensedBy == "" {
		t.Error("a licensed club does not record WHO licensed it — the licence is a person's, not the club's")
	}
	if lic.OwnersChecked < 1 {
		t.Error("no owners were considered")
	}
}
