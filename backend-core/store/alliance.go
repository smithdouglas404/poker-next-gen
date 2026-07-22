package store

import (
	"context"
	"database/sql"
	"time"
)

// Alliance is a federation of clubs founded by one club. Other clubs join it;
// a club belongs to at most one alliance.
type Alliance struct {
	ID             string    `json:"id"`
	Name           string    `json:"name"`
	FoundingClubID string    `json:"founding_club_id"`
	CreatedAt      time.Time `json:"created_at"`
}

// AllianceMember is a club's membership row in an alliance.
type AllianceMember struct {
	AllianceID string    `json:"alliance_id"`
	ClubID     string    `json:"club_id"`
	JoinedAt   time.Time `json:"joined_at"`
}

type AllianceStore struct{ db *sql.DB }

func NewAllianceStore(db *sql.DB) *AllianceStore { return &AllianceStore{db: db} }

// Create inserts an alliance and enrolls the founding club as its first member.
func (s *AllianceStore) Create(ctx context.Context, a *Alliance) error {
	if a.ID == "" {
		a.ID = NewID("alli")
	}
	a.CreatedAt = time.Now().UTC()
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if _, err := tx.ExecContext(ctx, `
		INSERT INTO poker_alliance (id, name, founding_club_id, created_at)
		VALUES ($1,$2,$3,$4)`, a.ID, a.Name, a.FoundingClubID, a.CreatedAt); err != nil {
		return err
	}
	if a.FoundingClubID != "" {
		if _, err := tx.ExecContext(ctx, `
			INSERT INTO poker_alliance_member (alliance_id, club_id, joined_at)
			VALUES ($1,$2,NOW()) ON CONFLICT (club_id) DO NOTHING`, a.ID, a.FoundingClubID); err != nil {
			return err
		}
	}
	return tx.Commit()
}

// GetByID returns an alliance, or (nil, nil) if missing.
func (s *AllianceStore) GetByID(ctx context.Context, id string) (*Alliance, error) {
	var a Alliance
	err := s.db.QueryRowContext(ctx, `
		SELECT id, name, founding_club_id, created_at FROM poker_alliance WHERE id=$1`, id).
		Scan(&a.ID, &a.Name, &a.FoundingClubID, &a.CreatedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &a, nil
}

// List returns all alliances, newest first.
func (s *AllianceStore) List(ctx context.Context) ([]Alliance, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT id, name, founding_club_id, created_at FROM poker_alliance ORDER BY created_at DESC LIMIT 200`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Alliance{}
	for rows.Next() {
		var a Alliance
		if err := rows.Scan(&a.ID, &a.Name, &a.FoundingClubID, &a.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, a)
	}
	return out, rows.Err()
}

// UpdateName renames an alliance.
func (s *AllianceStore) UpdateName(ctx context.Context, id, name string) error {
	_, err := s.db.ExecContext(ctx, `UPDATE poker_alliance SET name=$2 WHERE id=$1`, id, name)
	return err
}

// Delete removes an alliance (members cascade).
func (s *AllianceStore) Delete(ctx context.Context, id string) error {
	_, err := s.db.ExecContext(ctx, `DELETE FROM poker_alliance WHERE id=$1`, id)
	return err
}

// AddMember enrolls a club in an alliance. A club may only be in one alliance;
// the UNIQUE(club_id) constraint enforces this.
func (s *AllianceStore) AddMember(ctx context.Context, allianceID, clubID string) error {
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO poker_alliance_member (alliance_id, club_id, joined_at)
		VALUES ($1,$2,NOW()) ON CONFLICT (club_id) DO NOTHING`, allianceID, clubID)
	return err
}

// RemoveMember removes a club from an alliance.
func (s *AllianceStore) RemoveMember(ctx context.Context, allianceID, clubID string) error {
	_, err := s.db.ExecContext(ctx, `
		DELETE FROM poker_alliance_member WHERE alliance_id=$1 AND club_id=$2`, allianceID, clubID)
	return err
}

// ListMembers returns the clubs in an alliance.
func (s *AllianceStore) ListMembers(ctx context.Context, allianceID string) ([]AllianceMember, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT alliance_id, club_id, joined_at FROM poker_alliance_member
		WHERE alliance_id=$1 ORDER BY joined_at ASC`, allianceID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []AllianceMember{}
	for rows.Next() {
		var m AllianceMember
		if err := rows.Scan(&m.AllianceID, &m.ClubID, &m.JoinedAt); err != nil {
			return nil, err
		}
		out = append(out, m)
	}
	return out, rows.Err()
}

// ForClub returns the alliance a club belongs to, or (nil, nil) if none.
func (s *AllianceStore) ForClub(ctx context.Context, clubID string) (*Alliance, error) {
	var a Alliance
	err := s.db.QueryRowContext(ctx, `
		SELECT a.id, a.name, a.founding_club_id, a.created_at
		FROM poker_alliance_member m JOIN poker_alliance a ON a.id=m.alliance_id
		WHERE m.club_id=$1`, clubID).
		Scan(&a.ID, &a.Name, &a.FoundingClubID, &a.CreatedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &a, nil
}
