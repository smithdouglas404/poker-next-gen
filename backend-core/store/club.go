package store

import (
	"context"
	"database/sql"
	"fmt"
	"time"

	"github.com/smithdouglas404/poker-next-gen/backend-core/models"
)

type ClubStore struct{ db *sql.DB }

func NewClubStore(db *sql.DB) *ClubStore { return &ClubStore{db: db} }

func (s *ClubStore) Create(ctx context.Context, club *models.Club) error {
	club.ID = NewID("club")
	now := time.Now().UTC()
	club.CreatedAt, club.UpdatedAt = now, now
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO poker_club (id,name,slug,description,currency,is_active,created_at,updated_at)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
		club.ID, club.Name, club.Slug, club.Description, club.Currency, club.IsActive, club.CreatedAt, club.UpdatedAt)
	return err
}

func (s *ClubStore) List(ctx context.Context) ([]models.Club, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT id,name,slug,description,currency,is_active,created_at,updated_at FROM poker_club WHERE is_active ORDER BY created_at DESC LIMIT 100`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []models.Club
	for rows.Next() {
		var c models.Club
		if err := rows.Scan(&c.ID, &c.Name, &c.Slug, &c.Description, &c.Currency, &c.IsActive, &c.CreatedAt, &c.UpdatedAt); err != nil {
			return nil, err
		}
		out = append(out, c)
	}
	return out, rows.Err()
}

func (s *ClubStore) GetByID(ctx context.Context, id string) (*models.Club, error) {
	var c models.Club
	err := s.db.QueryRowContext(ctx, `SELECT id,name,slug,description,currency,is_active,created_at,updated_at FROM poker_club WHERE id=$1`, id).
		Scan(&c.ID, &c.Name, &c.Slug, &c.Description, &c.Currency, &c.IsActive, &c.CreatedAt, &c.UpdatedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &c, nil
}

func (s *ClubStore) AddOwner(ctx context.Context, o *models.Owner) error {
	o.ID = NewID("owner")
	now := time.Now().UTC()
	o.CreatedAt, o.UpdatedAt = now, now
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO poker_owner (id,club_id,user_id,role,equity_bps,can_configure,created_at,updated_at)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (club_id,user_id) DO UPDATE SET role=$4,equity_bps=$5,can_configure=$6,updated_at=$8`,
		o.ID, o.ClubID, o.UserID, o.Role, o.EquityBps, o.CanConfigure, o.CreatedAt, o.UpdatedAt)
	return err
}

// CountOwnedClubs returns how many active clubs the user owns (role='owner').
// Used to enforce the tier's club-create limit.
func (s *ClubStore) CountOwnedClubs(ctx context.Context, userID string) (int, error) {
	var n int
	err := s.db.QueryRowContext(ctx, `
		SELECT COUNT(*) FROM poker_owner o
		JOIN poker_club c ON c.id=o.club_id AND c.is_active
		WHERE o.user_id=$1 AND o.role='owner'`, userID).Scan(&n)
	return n, err
}

// CountMembers returns the number of owner/manager rows in a club (the current
// membership model). Used to enforce the tier's member limit on add.
func (s *ClubStore) CountMembers(ctx context.Context, clubID string) (int, error) {
	var n int
	err := s.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM poker_owner WHERE club_id=$1`, clubID).Scan(&n)
	return n, err
}

func (s *ClubStore) ListOwners(ctx context.Context, clubID string) ([]models.Owner, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT id,club_id,user_id,role,equity_bps,can_configure,created_at,updated_at FROM poker_owner WHERE club_id=$1`, clubID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []models.Owner
	for rows.Next() {
		var o models.Owner
		if err := rows.Scan(&o.ID, &o.ClubID, &o.UserID, &o.Role, &o.EquityBps, &o.CanConfigure, &o.CreatedAt, &o.UpdatedAt); err != nil {
			return nil, err
		}
		out = append(out, o)
	}
	return out, rows.Err()
}

func (s *ClubStore) SetRake(ctx context.Context, r *models.CustomRakeConfiguration) error {
	r.ID = NewID("rake")
	now := time.Now().UTC()
	r.CreatedAt, r.UpdatedAt = now, now
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO poker_rake_config (id,club_id,name,percent_bps,cap_minor,no_flop_no_drop,min_pot_minor,is_active,created_at,updated_at)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
		r.ID, r.ClubID, r.Name, r.PercentBps, r.CapMinor, r.NoFlopNoDrop, r.MinPotMinor, r.IsActive, r.CreatedAt, r.UpdatedAt)
	return err
}

func (s *ClubStore) GetRake(ctx context.Context, clubID string) (*models.CustomRakeConfiguration, error) {
	var r models.CustomRakeConfiguration
	err := s.db.QueryRowContext(ctx, `
		SELECT id,club_id,name,percent_bps,cap_minor,no_flop_no_drop,min_pot_minor,is_active,created_at,updated_at
		FROM poker_rake_config WHERE club_id=$1 AND is_active ORDER BY created_at DESC LIMIT 1`, clubID).
		Scan(&r.ID, &r.ClubID, &r.Name, &r.PercentBps, &r.CapMinor, &r.NoFlopNoDrop, &r.MinPotMinor, &r.IsActive, &r.CreatedAt, &r.UpdatedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &r, nil
}

func (s *ClubStore) AllocateBalance(ctx context.Context, b *models.PlayerAllocatedBalance) error {
	b.ID = NewID("bal")
	now := time.Now().UTC()
	b.CreatedAt, b.UpdatedAt = now, now
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO poker_player_balance (id,club_id,user_id,balance,locked_amount,currency,created_at,updated_at)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
		ON CONFLICT (club_id,user_id) DO UPDATE SET balance=poker_player_balance.balance+$4, updated_at=$8`,
		b.ID, b.ClubID, b.UserID, b.Balance, b.LockedAmount, b.Currency, b.CreatedAt, b.UpdatedAt)
	return err
}

func (s *ClubStore) GetBalance(ctx context.Context, clubID, userID string) (*models.PlayerAllocatedBalance, error) {
	var b models.PlayerAllocatedBalance
	err := s.db.QueryRowContext(ctx, `
		SELECT id,club_id,user_id,balance,locked_amount,currency,created_at,updated_at
		FROM poker_player_balance WHERE club_id=$1 AND user_id=$2`, clubID, userID).
		Scan(&b.ID, &b.ClubID, &b.UserID, &b.Balance, &b.LockedAmount, &b.Currency, &b.CreatedAt, &b.UpdatedAt)
	if err == sql.ErrNoRows {
		return &models.PlayerAllocatedBalance{ClubID: clubID, UserID: userID, Currency: "USD"}, nil
	}
	if err != nil {
		return nil, err
	}
	return &b, nil
}

func (s *ClubStore) LockBalance(ctx context.Context, clubID, userID string, amount int64) error {
	if amount <= 0 {
		return nil
	}
	bal, err := s.GetBalance(ctx, clubID, userID)
	if err != nil {
		return err
	}
	if bal.Balance < amount {
		return fmt.Errorf("insufficient club balance")
	}
	res, err := s.db.ExecContext(ctx, `
		UPDATE poker_player_balance SET locked_amount=locked_amount+$3, balance=balance-$3, updated_at=NOW()
		WHERE club_id=$1 AND user_id=$2 AND balance>=$3`, clubID, userID, amount)
	if err != nil {
		return err
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return fmt.Errorf("insufficient club balance")
	}
	return nil
}

func (s *ClubStore) UnlockBalance(ctx context.Context, clubID, userID string, amount int64) error {
	_, err := s.db.ExecContext(ctx, `
		UPDATE poker_player_balance SET locked_amount=GREATEST(0,locked_amount-$3), balance=balance+$3, updated_at=NOW()
		WHERE club_id=$1 AND user_id=$2`, clubID, userID, amount)
	return err
}
