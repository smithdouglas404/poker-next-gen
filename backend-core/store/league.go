package store

import (
	"context"
	"database/sql"
	"time"
)

// League is a competitive season across clubs.
type League struct {
	ID        string    `json:"id"`
	Name      string    `json:"name"`
	StartsAt  time.Time `json:"starts_at"`
	EndsAt    time.Time `json:"ends_at"`
	Status    string    `json:"status"` // registering | active | completed
	CreatedAt time.Time `json:"created_at"`
}

// LeagueStanding is a club's line in a league table.
type LeagueStanding struct {
	LeagueID string `json:"league_id"`
	ClubID   string `json:"club_id"`
	Points   int    `json:"points"`
	Wins     int    `json:"wins"`
	Losses   int    `json:"losses"`
}

type LeagueStore struct{ db *sql.DB }

func NewLeagueStore(db *sql.DB) *LeagueStore { return &LeagueStore{db: db} }

// Create inserts a league.
func (s *LeagueStore) Create(ctx context.Context, l *League) error {
	if l.ID == "" {
		l.ID = NewID("lg")
	}
	if l.Status == "" {
		l.Status = "registering"
	}
	l.CreatedAt = time.Now().UTC()
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO poker_league (id, name, starts_at, ends_at, status, created_at)
		VALUES ($1,$2,$3,$4,$5,$6)`,
		l.ID, l.Name, l.StartsAt, l.EndsAt, l.Status, l.CreatedAt)
	return err
}

// GetByID returns a league, or (nil, nil) if missing.
func (s *LeagueStore) GetByID(ctx context.Context, id string) (*League, error) {
	var l League
	err := s.db.QueryRowContext(ctx, `
		SELECT id, name, starts_at, ends_at, status, created_at FROM poker_league WHERE id=$1`, id).
		Scan(&l.ID, &l.Name, &l.StartsAt, &l.EndsAt, &l.Status, &l.CreatedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &l, nil
}

// List returns all leagues, newest first.
func (s *LeagueStore) List(ctx context.Context) ([]League, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT id, name, starts_at, ends_at, status, created_at FROM poker_league ORDER BY created_at DESC LIMIT 200`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []League{}
	for rows.Next() {
		var l League
		if err := rows.Scan(&l.ID, &l.Name, &l.StartsAt, &l.EndsAt, &l.Status, &l.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, l)
	}
	return out, rows.Err()
}

// Update patches a league's name, window, and status.
func (s *LeagueStore) Update(ctx context.Context, l *League) error {
	_, err := s.db.ExecContext(ctx, `
		UPDATE poker_league SET name=$2, starts_at=$3, ends_at=$4, status=$5 WHERE id=$1`,
		l.ID, l.Name, l.StartsAt, l.EndsAt, l.Status)
	return err
}

// SetStatus flips a league's status.
func (s *LeagueStore) SetStatus(ctx context.Context, id, status string) error {
	_, err := s.db.ExecContext(ctx, `UPDATE poker_league SET status=$2 WHERE id=$1`, id, status)
	return err
}

// Delete removes a league (standings cascade).
func (s *LeagueStore) Delete(ctx context.Context, id string) error {
	_, err := s.db.ExecContext(ctx, `DELETE FROM poker_league WHERE id=$1`, id)
	return err
}

// Join enrolls a club into a league standings table (idempotent, zeroed).
func (s *LeagueStore) Join(ctx context.Context, leagueID, clubID string) error {
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO poker_league_standing (league_id, club_id, points, wins, losses)
		VALUES ($1,$2,0,0,0) ON CONFLICT (league_id, club_id) DO NOTHING`, leagueID, clubID)
	return err
}

// SetStanding upserts a club's absolute standing (admin override).
func (s *LeagueStore) SetStanding(ctx context.Context, st *LeagueStanding) error {
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO poker_league_standing (league_id, club_id, points, wins, losses)
		VALUES ($1,$2,$3,$4,$5)
		ON CONFLICT (league_id, club_id) DO UPDATE SET points=$3, wins=$4, losses=$5`,
		st.LeagueID, st.ClubID, st.Points, st.Wins, st.Losses)
	return err
}

// AccrueStanding adds to a club's standing (used by the match-loop accrual hook).
func (s *LeagueStore) AccrueStanding(ctx context.Context, leagueID, clubID string, points, wins, losses int) error {
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO poker_league_standing (league_id, club_id, points, wins, losses)
		VALUES ($1,$2,$3,$4,$5)
		ON CONFLICT (league_id, club_id) DO UPDATE SET
			points = poker_league_standing.points + $3,
			wins   = poker_league_standing.wins + $4,
			losses = poker_league_standing.losses + $5`,
		leagueID, clubID, points, wins, losses)
	return err
}

// Standings returns a league's table, ranked by points desc.
func (s *LeagueStore) Standings(ctx context.Context, leagueID string) ([]LeagueStanding, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT league_id, club_id, points, wins, losses FROM poker_league_standing
		WHERE league_id=$1 ORDER BY points DESC, wins DESC`, leagueID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []LeagueStanding{}
	for rows.Next() {
		var st LeagueStanding
		if err := rows.Scan(&st.LeagueID, &st.ClubID, &st.Points, &st.Wins, &st.Losses); err != nil {
			return nil, err
		}
		out = append(out, st)
	}
	return out, rows.Err()
}
