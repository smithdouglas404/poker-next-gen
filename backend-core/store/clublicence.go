package store

import (
	"context"
	"database/sql"

	"github.com/smithdouglas404/poker-next-gen/backend-core/billing"
)

// Who may host what, and on whose authority.
//
// The model is a liquor licence. The licence belongs to a PERSON, not to the
// premises: a bar does not hold a licence, a licensee does, and the bar may
// trade because a licensee stands behind it. A club may have several owners; ONE
// of them holding a valid licence is what lets the club run cash games. The
// others do not each need their own, and staff pouring drinks certainly do not.
//
// The code did none of this. table_create checked `CanSponsorTable(tier)` on
// WHOEVER CLICKED, so:
//
//   - The licence was checked against the wrong person. A club manager on the
//     free tier could not open even a friendly play-money game, though the club's
//     owner was fully licensed and standing behind it.
//   - Nobody's identity was verified. A paid tier alone opened a real-money cash
//     table. Players are KYC'd at sit-down, but the HOUSE — the club taking rake
//     off the pot — had no verified principal anywhere in the flow.
//   - A private home game and a raked cash game passed through the same gate.
//
// Two things decide the answer, and they are different questions:
//
//	what is being hosted   cash (real money changes hands) vs play (chips)
//	who stands behind it   does the CLUB have a licensed owner
//
// Play money needs no licence — it needs permission from the club, the same as
// any other operator action. Cash needs a licensed owner behind the club.

// StakeMode is what a table plays for.
type StakeMode string

const (
	// StakeCash is a real-money table: buy-ins draw the certified global wallet
	// and pots rake to the club. Requires a licensed club.
	StakeCash StakeMode = "cash"
	// StakePlay is chips — private games, home games, freerolls. No licence.
	StakePlay StakeMode = "play"
)

// ValidStakeMode clamps an arbitrary string, defaulting to PLAY.
//
// The default is deliberate and is the safe direction: an unrecognised value
// becomes the mode that requires no licence and moves no real money. Defaulting
// to cash would let a typo open an unlicensed real-money table.
func ValidStakeMode(v string) StakeMode {
	if StakeMode(v) == StakeCash {
		return StakeCash
	}
	return StakePlay
}

// ClubLicence describes a club's authority to host, and who supplies it.
type ClubLicence struct {
	ClubID string `json:"club_id"`
	// CanHostCash is true when at least one owner is a qualified licensee.
	CanHostCash bool `json:"can_host_cash"`
	// LicensedBy is the user id of a qualifying owner (the first found). Empty
	// when the club is unlicensed.
	LicensedBy string `json:"licensed_by,omitempty"`
	// Reason explains a refusal in words an operator can act on.
	Reason string `json:"reason,omitempty"`
	// OwnersChecked is how many owner seats were considered.
	OwnersChecked int `json:"owners_checked"`
}

// LicenceFor reports whether a club may host cash games.
//
// A qualifying licensee is an owner-role seat whose holder has BOTH a
// sponsor-capable membership and verified identity. Both, because they answer
// different questions: the membership is the commercial agreement to operate,
// the KYC is the regulator's requirement to know who is operating.
//
// Managers and agents do not qualify however senior — they hold delegated
// permissions inside the club, not the licence. That mirrors the analogy exactly:
// the bar manager runs the shift, the licensee carries the licence.
func LicenceFor(ctx context.Context, db *sql.DB, clubID string) ClubLicence {
	lic := ClubLicence{ClubID: clubID}
	if clubID == "" {
		lic.Reason = "no club"
		return lic
	}
	owners, err := NewClubStore(db).ListOwners(ctx, clubID)
	if err != nil {
		// Fail CLOSED. An unreadable owner list is not evidence of a licence, and
		// treating it as one would open a real-money table on a database hiccup.
		lic.Reason = "could not verify the club's licence"
		return lic
	}
	verification := NewVerificationStore(db)
	unverified := 0
	for _, o := range owners {
		if o.Role != "owner" {
			continue // delegated seats do not carry the licence
		}
		lic.OwnersChecked++
		if !billing.CanSponsorTable(SubscriptionTier(ctx, db, o.UserID)) {
			continue
		}
		st, _ := verification.Statuses(ctx, o.UserID)
		if st["kyc_aml"] != "verified" {
			unverified++
			continue
		}
		lic.CanHostCash = true
		lic.LicensedBy = o.UserID
		return lic
	}
	switch {
	case lic.OwnersChecked == 0:
		lic.Reason = "this club has no owner on record"
	case unverified > 0:
		lic.Reason = "an owner has the right membership but has not completed identity verification (KYC)"
	default:
		lic.Reason = "no owner holds a membership that allows sponsoring cash games"
	}
	return lic
}
