package store

import (
	"context"
	"database/sql"
	"fmt"
	"strings"
	"time"
)

// ClubScheduleStore holds an operator's recurring "club night" templates — a
// saved table config (blinds, buy-in, variant) plus a weekday/time the operator
// intends to run it. Auto-firing at the scheduled time is a deliberate follow-up
// (needs a match-loop poller / external cron); today the operator launches a
// scheduled night on demand (club_night_launch_now), mirroring how tournaments
// carry scheduled_at but start via a manual RPC.
type ClubScheduleStore struct{ db *sql.DB }

func NewClubScheduleStore(db *sql.DB) *ClubScheduleStore { return &ClubScheduleStore{db: db} }

// ClubSchedule is one recurring club-night template.
type ClubSchedule struct {
	ID         string    `json:"id"`
	ClubID     string    `json:"club_id"`
	Name       string    `json:"name"`
	SmallBlind int64     `json:"small_blind"`
	BigBlind   int64     `json:"big_blind"`
	BuyIn      int64     `json:"buy_in"`
	MaxSeats   int       `json:"max_seats"`
	Variant    string    `json:"variant"`
	Weekday    int       `json:"weekday"`     // 0=Sun … 6=Sat
	TimeOfDay  string    `json:"time_of_day"` // "HH:MM" in the CLUB's timezone
	Enabled    bool      `json:"enabled"`
	CreatedBy  string    `json:"created_by"`
	CreatedAt  time.Time `json:"created_at"`
	// NextRunAt is derived, not stored: the next moment this template comes due,
	// resolved in the owning club's timezone. Weekday+TimeOfDay alone name no
	// actual instant — before the club gained a timezone this template described
	// a time that could not be computed, only displayed.
	NextRunAt *time.Time `json:"next_run_at,omitempty"`
}

// NextRun returns the next occurrence of this template's weekday/time in `loc`,
// strictly after `now`. Returns nil for a disabled template or an unparseable
// time-of-day rather than guessing an instant.
func (c *ClubSchedule) NextRun(now time.Time, loc *time.Location) *time.Time {
	if !c.Enabled || loc == nil {
		return nil
	}
	var hh, mm int
	if n, err := fmt.Sscanf(strings.TrimSpace(c.TimeOfDay), "%d:%d", &hh, &mm); n != 2 || err != nil {
		return nil
	}
	if hh < 0 || hh > 23 || mm < 0 || mm > 59 {
		return nil
	}
	local := now.In(loc)
	// Days until the target weekday; today counts only if the time has not passed.
	delta := (c.Weekday - int(local.Weekday()) + 7) % 7
	candidate := time.Date(local.Year(), local.Month(), local.Day(), hh, mm, 0, 0, loc).AddDate(0, 0, delta)
	if !candidate.After(local) {
		candidate = candidate.AddDate(0, 0, 7)
	}
	return &candidate
}

// AttachNextRuns fills NextRunAt on every template using the club's timezone.
// An unknown zone falls back to UTC rather than dropping the field, so the
// operator always sees a concrete time.
func AttachNextRuns(schedules []ClubSchedule, timezone string, now time.Time) {
	loc, err := time.LoadLocation(timezone)
	if err != nil || loc == nil {
		loc = time.UTC
	}
	for i := range schedules {
		schedules[i].NextRunAt = schedules[i].NextRun(now, loc)
	}
}

// Create inserts a schedule template and returns its id.
func (s *ClubScheduleStore) Create(ctx context.Context, c *ClubSchedule) (string, error) {
	if c.ID == "" {
		c.ID = NewID("sch")
	}
	if c.MaxSeats <= 0 {
		c.MaxSeats = 6
	}
	if c.Variant == "" {
		c.Variant = "holdem"
	}
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO poker_club_schedule
			(id, club_id, name, small_blind, big_blind, buy_in, max_seats, variant, weekday, time_of_day, enabled, created_by)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
		c.ID, c.ClubID, c.Name, c.SmallBlind, c.BigBlind, c.BuyIn, c.MaxSeats, c.Variant,
		c.Weekday, c.TimeOfDay, c.Enabled, c.CreatedBy)
	return c.ID, err
}

// ListForClub returns a club's schedule templates (newest first).
func (s *ClubScheduleStore) ListForClub(ctx context.Context, clubID string) ([]ClubSchedule, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT id, club_id, name, small_blind, big_blind, buy_in, max_seats, variant, weekday, time_of_day, enabled, created_by, created_at
		FROM poker_club_schedule WHERE club_id=$1 ORDER BY created_at DESC`, clubID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []ClubSchedule{}
	for rows.Next() {
		var c ClubSchedule
		if err := rows.Scan(&c.ID, &c.ClubID, &c.Name, &c.SmallBlind, &c.BigBlind, &c.BuyIn, &c.MaxSeats, &c.Variant, &c.Weekday, &c.TimeOfDay, &c.Enabled, &c.CreatedBy, &c.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, c)
	}
	return out, rows.Err()
}

// Get returns a schedule by id (nil if missing).
func (s *ClubScheduleStore) Get(ctx context.Context, id string) (*ClubSchedule, error) {
	var c ClubSchedule
	err := s.db.QueryRowContext(ctx, `
		SELECT id, club_id, name, small_blind, big_blind, buy_in, max_seats, variant, weekday, time_of_day, enabled, created_by, created_at
		FROM poker_club_schedule WHERE id=$1`, id).
		Scan(&c.ID, &c.ClubID, &c.Name, &c.SmallBlind, &c.BigBlind, &c.BuyIn, &c.MaxSeats, &c.Variant, &c.Weekday, &c.TimeOfDay, &c.Enabled, &c.CreatedBy, &c.CreatedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &c, nil
}

// SetEnabled toggles a schedule on/off.
func (s *ClubScheduleStore) SetEnabled(ctx context.Context, id string, enabled bool) error {
	_, err := s.db.ExecContext(ctx, `UPDATE poker_club_schedule SET enabled=$2 WHERE id=$1`, id, enabled)
	return err
}

// Delete removes a schedule template.
func (s *ClubScheduleStore) Delete(ctx context.Context, id string) error {
	_, err := s.db.ExecContext(ctx, `DELETE FROM poker_club_schedule WHERE id=$1`, id)
	return err
}
