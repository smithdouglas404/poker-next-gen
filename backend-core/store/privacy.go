package store

import (
	"context"
	"database/sql"
	"strings"
)

// Privacy mode: the player asked not to be looked up.
//
// The Security & Privacy screen has had a "Privacy Mode" toggle since the
// profile shipped. It wrote a value into account metadata and nothing on the
// server ever read it — the toggle moved, the state persisted, and the player
// stayed exactly as visible as before. Worse, `player_stats` accepted any
// `user_id`, so any authenticated account could pull any other player's full
// statistics on demand. This is the readable flag that makes the promise true.
//
// Scope, stated plainly so it can be checked:
//   - hidden from the public leaderboards
//   - their stats are not readable by other players
//
// It is NOT invisibility. They still appear at the tables they sit at, still
// appear in club rosters, and staff/admin surfaces are unaffected — those exist
// precisely to look at accounts.

// SetPrivacyMode records the caller's privacy preference.
func SetPrivacyMode(ctx context.Context, db *sql.DB, userID string, on bool) error {
	_, err := db.ExecContext(ctx, `
		INSERT INTO poker_user_status (user_id, privacy_mode, updated_at)
		VALUES ($1,$2,NOW())
		ON CONFLICT (user_id) DO UPDATE SET privacy_mode=EXCLUDED.privacy_mode, updated_at=NOW()`,
		userID, on)
	return err
}

// PrivacyMode reports whether a user has asked not to be looked up.
//
// Fails CLOSED on error: an unreadable flag is treated as "private". Guessing
// "public" would leak exactly the data the flag exists to protect, and the cost
// of guessing wrong the other way is a stats panel that says it is unavailable.
func PrivacyMode(ctx context.Context, db *sql.DB, userID string) bool {
	if userID == "" {
		return false
	}
	var on bool
	err := db.QueryRowContext(ctx,
		`SELECT COALESCE(privacy_mode, FALSE) FROM poker_user_status WHERE user_id=$1`, userID).Scan(&on)
	if err == sql.ErrNoRows {
		return false // no row = never toggled anything = public
	}
	if err != nil {
		return true
	}
	return on
}

// PrivateUserIDs returns the subset of `ids` that are in privacy mode, as a set.
// One query instead of one lookup per leaderboard row.
func PrivateUserIDs(ctx context.Context, db *sql.DB, ids []string) (map[string]bool, error) {
	out := map[string]bool{}
	if len(ids) == 0 {
		return out, nil
	}
	// Built positionally rather than with a driver array type — this module has
	// no pq/pgx dependency, only nakama-common (pinned), and the ids come from
	// leaderboard records, never from user input.
	placeholders := make([]string, 0, len(ids))
	args := make([]interface{}, 0, len(ids))
	for i, id := range ids {
		placeholders = append(placeholders, "$"+itoa(i+1))
		args = append(args, id)
	}
	rows, err := db.QueryContext(ctx,
		`SELECT user_id FROM poker_user_status WHERE privacy_mode = TRUE AND user_id IN (`+
			strings.Join(placeholders, ",")+`)`, args...)
	if err != nil {
		return out, err
	}
	defer rows.Close()
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return out, err
		}
		out[id] = true
	}
	return out, rows.Err()
}
