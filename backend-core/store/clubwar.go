package store

import (
	"context"
	"database/sql"
	"time"
)

// ClubWar is a head-to-head competition between two clubs.
type ClubWar struct {
	ID          string    `json:"id"`
	ClubA       string    `json:"club_a"`
	ClubB       string    `json:"club_b"`
	Status      string    `json:"status"` // pending | active | completed
	WinnerID    string    `json:"winner_id"`
	ScheduledAt time.Time `json:"scheduled_at"`
	ScoreA      int64     `json:"score_a"`
	ScoreB      int64     `json:"score_b"`
	CreatedAt   time.Time `json:"created_at"`
}

// ClubWarHand is a single hand's contribution to a war's score.
type ClubWarHand struct {
	ID        string    `json:"id"`
	WarID     string    `json:"war_id"`
	MatchID   string    `json:"match_id"`
	HandNo    int       `json:"hand_no"`
	ClubID    string    `json:"club_id"`
	Delta     int64     `json:"delta"`
	CreatedAt time.Time `json:"created_at"`
}

type ClubWarStore struct{ db *sql.DB }

func NewClubWarStore(db *sql.DB) *ClubWarStore { return &ClubWarStore{db: db} }

// Create inserts a club war.
func (s *ClubWarStore) Create(ctx context.Context, w *ClubWar) error {
	if w.ID == "" {
		w.ID = NewID("war")
	}
	if w.Status == "" {
		w.Status = "pending"
	}
	w.CreatedAt = time.Now().UTC()
	if w.ScheduledAt.IsZero() {
		w.ScheduledAt = w.CreatedAt
	}
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO poker_club_war (id, club_a, club_b, status, winner_id, scheduled_at, score_a, score_b, created_at)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
		w.ID, w.ClubA, w.ClubB, w.Status, w.WinnerID, w.ScheduledAt, w.ScoreA, w.ScoreB, w.CreatedAt)
	return err
}

// GetByID returns a war, or (nil, nil) if missing.
func (s *ClubWarStore) GetByID(ctx context.Context, id string) (*ClubWar, error) {
	var w ClubWar
	err := s.db.QueryRowContext(ctx, `
		SELECT id, club_a, club_b, status, winner_id, scheduled_at, score_a, score_b, created_at
		FROM poker_club_war WHERE id=$1`, id).
		Scan(&w.ID, &w.ClubA, &w.ClubB, &w.Status, &w.WinnerID, &w.ScheduledAt, &w.ScoreA, &w.ScoreB, &w.CreatedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &w, nil
}

// List returns wars, optionally filtered by club (either side) and/or status.
func (s *ClubWarStore) List(ctx context.Context, clubID, status string) ([]ClubWar, error) {
	q := `SELECT id, club_a, club_b, status, winner_id, scheduled_at, score_a, score_b, created_at
	      FROM poker_club_war WHERE TRUE`
	args := []interface{}{}
	if clubID != "" {
		args = append(args, clubID)
		q += ` AND (club_a=$1 OR club_b=$1)`
	}
	if status != "" {
		args = append(args, status)
		q += ` AND status=$` + itoa(len(args))
	}
	q += ` ORDER BY created_at DESC LIMIT 200`
	rows, err := s.db.QueryContext(ctx, q, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []ClubWar{}
	for rows.Next() {
		var w ClubWar
		if err := rows.Scan(&w.ID, &w.ClubA, &w.ClubB, &w.Status, &w.WinnerID, &w.ScheduledAt, &w.ScoreA, &w.ScoreB, &w.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, w)
	}
	return out, rows.Err()
}

// SetStatus flips a war's status.
func (s *ClubWarStore) SetStatus(ctx context.Context, id, status string) error {
	_, err := s.db.ExecContext(ctx, `UPDATE poker_club_war SET status=$2 WHERE id=$1`, id, status)
	return err
}

// SetSchedule updates a war's scheduled time.
func (s *ClubWarStore) SetSchedule(ctx context.Context, id string, at time.Time) error {
	_, err := s.db.ExecContext(ctx, `UPDATE poker_club_war SET scheduled_at=$2 WHERE id=$1`, id, at)
	return err
}

// Settle records the final scores and winner and marks the war completed.
func (s *ClubWarStore) Settle(ctx context.Context, id, winnerID string, scoreA, scoreB int64) error {
	_, err := s.db.ExecContext(ctx, `
		UPDATE poker_club_war SET status='completed', winner_id=$2, score_a=$3, score_b=$4 WHERE id=$1`,
		id, winnerID, scoreA, scoreB)
	return err
}

// AddHand records a per-hand delta and bumps the war's running score for the
// contributing side.
func (s *ClubWarStore) AddHand(ctx context.Context, h *ClubWarHand) error {
	if h.ID == "" {
		h.ID = NewID("wh")
	}
	h.CreatedAt = time.Now().UTC()
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if _, err := tx.ExecContext(ctx, `
		INSERT INTO poker_club_war_hand (id, war_id, match_id, hand_no, club_id, delta, created_at)
		VALUES ($1,$2,$3,$4,$5,$6,$7)`,
		h.ID, h.WarID, h.MatchID, h.HandNo, h.ClubID, h.Delta, h.CreatedAt); err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, `
		UPDATE poker_club_war
		SET score_a = score_a + CASE WHEN club_a=$2 THEN $3 ELSE 0 END,
		    score_b = score_b + CASE WHEN club_b=$2 THEN $3 ELSE 0 END
		WHERE id=$1`, h.WarID, h.ClubID, h.Delta); err != nil {
		return err
	}
	return tx.Commit()
}

// Hands returns the per-hand deltas recorded for a war.
func (s *ClubWarStore) Hands(ctx context.Context, warID string) ([]ClubWarHand, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT id, war_id, match_id, hand_no, club_id, delta, created_at
		FROM poker_club_war_hand WHERE war_id=$1 ORDER BY created_at ASC`, warID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []ClubWarHand{}
	for rows.Next() {
		var h ClubWarHand
		if err := rows.Scan(&h.ID, &h.WarID, &h.MatchID, &h.HandNo, &h.ClubID, &h.Delta, &h.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, h)
	}
	return out, rows.Err()
}

// ClubELO returns a club's competitive ELO (default 1500 if the club is missing).
func (s *ClubWarStore) ClubELO(ctx context.Context, clubID string) (int, error) {
	var elo int
	err := s.db.QueryRowContext(ctx, `SELECT elo FROM poker_club WHERE id=$1`, clubID).Scan(&elo)
	if err == sql.ErrNoRows {
		return 1500, nil
	}
	if err != nil {
		return 0, err
	}
	return elo, nil
}

// SetClubELO writes a club's ELO.
func (s *ClubWarStore) SetClubELO(ctx context.Context, clubID string, elo int) error {
	_, err := s.db.ExecContext(ctx, `UPDATE poker_club SET elo=$2, updated_at=NOW() WHERE id=$1`, clubID, elo)
	return err
}

// itoa is a tiny helper to build positional parameter placeholders without
// pulling in strconv at call sites in this file.
func itoa(n int) string {
	if n == 0 {
		return "0"
	}
	var b [20]byte
	i := len(b)
	for n > 0 {
		i--
		b[i] = byte('0' + n%10)
		n /= 10
	}
	return string(b[i:])
}
