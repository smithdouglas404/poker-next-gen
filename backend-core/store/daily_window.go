package store

import "time"

// A daily operating window — "this table/tournament is open 18:00–02:00".
//
// Both the tournament brackets and cash tables carry one, and they must agree on
// what the numbers mean, so the arithmetic lives here once rather than being
// re-derived per caller. The tournament path (RegistrationOpen) and the table
// sit-down gate both call WithinDailyWindow.
//
// The representation is minutes past midnight UTC, 0–1439. UTC and not the
// club's timezone deliberately: a match runs on one server clock and the window
// has to mean the same instant for every player at the table regardless of where
// they are sitting. The composing UI is responsible for showing the operator
// their local equivalent.

// NoDailyWindow reports whether a start/end pair means "always open".
//
// Equal values are the open case, and that is load-bearing: every table created
// before the window existed sends 0/0, so equal-means-open is what keeps them
// seatable. It also gives the UI a natural "off" state — the operator turns the
// window off by collapsing it rather than by a separate flag that could
// disagree with the numbers.
func NoDailyWindow(startMin, endMin int) bool {
	return startMin == endMin
}

// ValidDailyMinute reports whether a value is a legal minutes-past-midnight.
func ValidDailyMinute(v int) bool {
	return v >= 0 && v <= 1439
}

// WithinDailyWindow reports whether `now` falls inside [startMin, endMin) UTC.
//
// The window may wrap midnight (18:00–02:00 is six hours of evening play, not a
// twenty-two-hour window with a gap), which is why this is not a plain
// comparison. A window with no width is always open — see NoDailyWindow.
func WithinDailyWindow(startMin, endMin int, now time.Time) bool {
	if NoDailyWindow(startMin, endMin) {
		return true
	}
	utc := now.UTC()
	minute := utc.Hour()*60 + utc.Minute()
	if startMin < endMin {
		return minute >= startMin && minute < endMin
	}
	return minute >= startMin || minute < endMin
}

// DailyWindowLabel renders a window as "18:00–02:00 UTC" for an error message.
func DailyWindowLabel(startMin, endMin int) string {
	return ClockLabel(startMin) + "–" + ClockLabel(endMin) + " UTC"
}

// ClockLabel renders minutes-past-midnight as "HH:MM".
func ClockLabel(minutes int) string {
	if minutes < 0 || minutes > 1439 {
		return "--:--"
	}
	h, m := minutes/60, minutes%60
	return twoDigit(h) + ":" + twoDigit(m)
}

func twoDigit(v int) string {
	return string(rune('0' + v/10)) + string(rune('0' + v%10))
}
