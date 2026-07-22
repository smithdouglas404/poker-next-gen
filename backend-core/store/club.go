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
		INSERT INTO poker_club (id,name,slug,description,currency,accepts_global_wallet,is_active,created_at,updated_at)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
		club.ID, club.Name, club.Slug, club.Description, club.Currency, club.AcceptsGlobalWallet, club.IsActive, club.CreatedAt, club.UpdatedAt)
	return err
}

func (s *ClubStore) List(ctx context.Context) ([]models.Club, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT id,name,slug,description,currency,accepts_global_wallet,is_active,created_at,updated_at FROM poker_club WHERE is_active ORDER BY created_at DESC LIMIT 100`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []models.Club
	for rows.Next() {
		var c models.Club
		if err := rows.Scan(&c.ID, &c.Name, &c.Slug, &c.Description, &c.Currency, &c.AcceptsGlobalWallet, &c.IsActive, &c.CreatedAt, &c.UpdatedAt); err != nil {
			return nil, err
		}
		out = append(out, c)
	}
	return out, rows.Err()
}

func (s *ClubStore) GetByID(ctx context.Context, id string) (*models.Club, error) {
	var c models.Club
	err := s.db.QueryRowContext(ctx, `SELECT id,name,slug,description,currency,accepts_global_wallet,is_active,created_at,updated_at FROM poker_club WHERE id=$1`, id).
		Scan(&c.ID, &c.Name, &c.Slug, &c.Description, &c.Currency, &c.AcceptsGlobalWallet, &c.IsActive, &c.CreatedAt, &c.UpdatedAt)
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

// ClubsAdministeredBy returns the IDs of active clubs the user can configure
// (owner, or an operator with can_configure) — the set of clubs whose admin
// actions should be surfaced to this user.
func (s *ClubStore) ClubsAdministeredBy(ctx context.Context, userID string) ([]string, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT o.club_id FROM poker_owner o
		JOIN poker_club c ON c.id=o.club_id AND c.is_active
		WHERE o.user_id=$1 AND (o.can_configure OR o.role='owner')
		ORDER BY o.club_id`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []string{}
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		out = append(out, id)
	}
	return out, rows.Err()
}

// ClubRole is the caller's fine-grained standing in one club, used to drive
// role-aware UI. Operator=true means an owner-seat (poker_owner) whose Role is
// owner|manager|agent; Operator=false means a plain roster member whose Role is
// admin|member. CanConfigure mirrors the owner-seat flag (owners always can).
type ClubRole struct {
	ClubID       string `json:"club_id"`
	Role         string `json:"role"`
	CanConfigure bool   `json:"can_configure"`
	Operator     bool   `json:"operator"`
}

// RolesFor returns the caller's fine role in every active club they belong to.
// Owner-seat (poker_owner) beats a plain membership row when both exist.
func (s *ClubStore) RolesFor(ctx context.Context, userID string) ([]ClubRole, error) {
	byClub := map[string]ClubRole{}

	// Owner seats (operators): owner | manager | agent + can_configure.
	oRows, err := s.db.QueryContext(ctx, `
		SELECT o.club_id, o.role, (o.can_configure OR o.role='owner')
		FROM poker_owner o
		JOIN poker_club c ON c.id=o.club_id AND c.is_active
		WHERE o.user_id=$1`, userID)
	if err != nil {
		return nil, err
	}
	for oRows.Next() {
		var r ClubRole
		if err := oRows.Scan(&r.ClubID, &r.Role, &r.CanConfigure); err != nil {
			oRows.Close()
			return nil, err
		}
		r.Operator = true
		byClub[r.ClubID] = r
	}
	oRows.Close()
	if err := oRows.Err(); err != nil {
		return nil, err
	}

	// Plain memberships: admin | member (only when no owner seat already set).
	mRows, err := s.db.QueryContext(ctx, `
		SELECT m.club_id, m.role
		FROM poker_club_member m
		JOIN poker_club c ON c.id=m.club_id AND c.is_active
		WHERE m.user_id=$1`, userID)
	if err != nil {
		return nil, err
	}
	for mRows.Next() {
		var clubID, role string
		if err := mRows.Scan(&clubID, &role); err != nil {
			mRows.Close()
			return nil, err
		}
		if _, ok := byClub[clubID]; ok {
			continue // owner seat wins
		}
		byClub[clubID] = ClubRole{ClubID: clubID, Role: role, CanConfigure: false, Operator: false}
	}
	mRows.Close()
	if err := mRows.Err(); err != nil {
		return nil, err
	}

	out := make([]ClubRole, 0, len(byClub))
	for _, r := range byClub {
		out = append(out, r)
	}
	return out, nil
}

// CountMembers returns the number of members in a club (poker_club_member).
// Used to enforce the tier's member limit on join.
func (s *ClubStore) CountMembers(ctx context.Context, clubID string) (int, error) {
	var n int
	err := s.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM poker_club_member WHERE club_id=$1`, clubID).Scan(&n)
	return n, err
}

// ClubMember is a row in the club roster.
type ClubMember struct {
	ClubID   string `json:"club_id"`
	UserID   string `json:"user_id"`
	Username string `json:"username"`
	Role     string `json:"role"`
	Status   string `json:"status"`
}

// AddMember adds (or reactivates) a club member with the given role.
func (s *ClubStore) AddMember(ctx context.Context, clubID, userID, username, role string) error {
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO poker_club_member (club_id, user_id, username, role, status, joined_at)
		VALUES ($1,$2,$3,$4,'active',NOW())
		ON CONFLICT (club_id, user_id) DO UPDATE SET username=EXCLUDED.username, status='active'`,
		clubID, userID, username, role)
	return err
}

// RemoveMember removes a member from a club.
func (s *ClubStore) RemoveMember(ctx context.Context, clubID, userID string) error {
	_, err := s.db.ExecContext(ctx, `DELETE FROM poker_club_member WHERE club_id=$1 AND user_id=$2`, clubID, userID)
	return err
}

// SetMemberRole updates a member's role.
func (s *ClubStore) SetMemberRole(ctx context.Context, clubID, userID, role string) error {
	_, err := s.db.ExecContext(ctx, `UPDATE poker_club_member SET role=$3 WHERE club_id=$1 AND user_id=$2`, clubID, userID, role)
	return err
}

// GetMembership returns a user's membership row, or (nil, nil) if not a member.
func (s *ClubStore) GetMembership(ctx context.Context, clubID, userID string) (*ClubMember, error) {
	var m ClubMember
	err := s.db.QueryRowContext(ctx, `
		SELECT club_id, user_id, username, role, status FROM poker_club_member
		WHERE club_id=$1 AND user_id=$2`, clubID, userID).
		Scan(&m.ClubID, &m.UserID, &m.Username, &m.Role, &m.Status)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &m, nil
}

// ListMembers returns a club's roster.
func (s *ClubStore) ListMembers(ctx context.Context, clubID string) ([]ClubMember, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT club_id, user_id, username, role, status FROM poker_club_member
		WHERE club_id=$1 ORDER BY joined_at ASC`, clubID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []ClubMember
	for rows.Next() {
		var m ClubMember
		if err := rows.Scan(&m.ClubID, &m.UserID, &m.Username, &m.Role, &m.Status); err != nil {
			return nil, err
		}
		out = append(out, m)
	}
	return out, rows.Err()
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
		INSERT INTO poker_rake_config (id,club_id,name,percent_bps,cap_minor,no_flop_no_drop,min_pot_minor,is_active,is_public,created_at,updated_at)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
		r.ID, r.ClubID, r.Name, r.PercentBps, r.CapMinor, r.NoFlopNoDrop, r.MinPotMinor, r.IsActive, r.Public, r.CreatedAt, r.UpdatedAt)
	return err
}

func (s *ClubStore) GetRake(ctx context.Context, clubID string) (*models.CustomRakeConfiguration, error) {
	var r models.CustomRakeConfiguration
	err := s.db.QueryRowContext(ctx, `
		SELECT id,club_id,name,percent_bps,cap_minor,no_flop_no_drop,min_pot_minor,is_active,is_public,created_at,updated_at
		FROM poker_rake_config WHERE club_id=$1 AND is_active ORDER BY created_at DESC LIMIT 1`, clubID).
		Scan(&r.ID, &r.ClubID, &r.Name, &r.PercentBps, &r.CapMinor, &r.NoFlopNoDrop, &r.MinPotMinor, &r.IsActive, &r.Public, &r.CreatedAt, &r.UpdatedAt)
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
