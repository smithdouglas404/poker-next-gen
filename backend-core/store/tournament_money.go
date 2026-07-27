package store

import (
	"time"

	"github.com/smithdouglas404/poker-next-gen/backend-core/models"
)

// Tournament money, in exactly one place.
//
// Before this file the prize pool was computed as `entrants × buy_in` in THREE
// places — match/tournament/director.go (the payout at finish), rpc's
// tournamentPrizePool (the analytics snapshot), and TournamentFinalize. All
// three ignored FeeMinor entirely, while `tournament_analytics` cheerfully
// reported `entrants × fee_minor` as "Total Fees" and the settlement screen
// printed it as "Club Rake".
//
// That was revenue nobody paid: registration debits only the buy-in, and the
// full buy-in was then paid back out as prizes. The club's cut existed on the
// operator's reports and nowhere else.
//
// The fix keeps the price the player sees. The entry fee and the club's
// percentage come OUT of the advertised buy-in rather than being added on top,
// so a $220 event still costs $220 — the club's share is simply withheld from
// the pool instead of being invented. That also matches the HRC settlement
// design, whose Financial Overview reads Net Prize Pool = Buy-ins − Club Rake.

// TournamentEconomics is the money breakdown for a tournament at a given entry
// count. Every field is derived; nothing here is stored.
type TournamentEconomics struct {
	// GrossMinor is entrants × buy-in — what players paid in total.
	GrossMinor int64 `json:"gross_minor"`
	// RakeMinor is the club's total take: the flat fee plus the admin
	// percentage, per entrant.
	RakeMinor int64 `json:"rake_minor"`
	// PoolMinor is what is actually paid out — gross minus rake, raised to the
	// guarantee when there is one.
	PoolMinor int64 `json:"pool_minor"`
	// OverlayMinor is the shortfall the club covers to meet a guarantee (0 when
	// the field covers it on its own). This is a real cost to the operator, so
	// it is reported rather than folded silently into the pool.
	OverlayMinor int64 `json:"overlay_minor"`
}

// TournamentMoney computes the pool/rake breakdown for `entrants` entries.
//
// Per entrant the club takes `fee_minor + buy_in × admin_fee_bps / 10000`,
// clamped so it can never exceed the buy-in (a misconfigured 100% admin fee
// must not produce a negative prize pool).
func TournamentMoney(t *models.TournamentBracket, entrants int) TournamentEconomics {
	if t == nil || entrants < 0 {
		entrants = 0
	}
	var e TournamentEconomics
	if t == nil {
		return e
	}
	buyIn := t.BuyInMinor
	if buyIn < 0 {
		buyIn = 0
	}
	perEntryRake := t.FeeMinor + buyIn*int64(t.AdminFeeBps)/10000
	if perEntryRake < 0 {
		perEntryRake = 0
	}
	if perEntryRake > buyIn {
		perEntryRake = buyIn
	}

	e.GrossMinor = int64(entrants) * buyIn
	e.RakeMinor = int64(entrants) * perEntryRake
	e.PoolMinor = e.GrossMinor - e.RakeMinor

	// A guarantee raises the pool; the club funds the difference.
	if t.GuaranteeMinor > e.PoolMinor {
		e.OverlayMinor = t.GuaranteeMinor - e.PoolMinor
		e.PoolMinor = t.GuaranteeMinor
	}
	return e
}

// RegistrationOpen reports whether registration is currently open, and why not
// when it is closed. It enforces two things the schema stored but nothing
// checked: the late-registration window, and the operating-hours window.
//
// `now` is passed in rather than read from the clock so this is testable and so
// callers can share a single timestamp across checks.
func RegistrationOpen(t *models.TournamentBracket, now time.Time) (bool, string) {
	if t == nil {
		return false, "tournament not found"
	}
	switch t.Status {
	case "finished":
		return false, "this tournament has finished"
	case "draft":
		return false, "this tournament has not been published yet"
	}

	// Late registration: open until scheduled start + LateRegSecs. A zero window
	// closes registration the moment the tournament is due to start.
	if t.Status == "running" || now.After(t.ScheduledAt) {
		deadline := t.ScheduledAt.Add(time.Duration(t.LateRegSecs) * time.Second)
		if now.After(deadline) {
			if t.LateRegSecs <= 0 {
				return false, "registration closed at the scheduled start time"
			}
			return false, "late registration has closed"
		}
	}

	if ok, why := withinOperatingHours(t, now); !ok {
		return false, why
	}
	return true, ""
}

// withinOperatingHours checks the daily UTC window. Equal start/end = no window.
//
// The arithmetic (including the midnight wrap) is shared with the cash-table
// sit-down gate — see daily_window.go. Both surfaces expose the same control to
// operators, so they must not drift on what "18:00–02:00" means.
func withinOperatingHours(t *models.TournamentBracket, now time.Time) (bool, string) {
	start, end := int(t.OperatingStartMin), int(t.OperatingEndMin)
	if WithinDailyWindow(start, end, now) {
		return true, ""
	}
	return false, "this tournament is outside its operating hours (" +
		DailyWindowLabel(start, end) + ")"
}
