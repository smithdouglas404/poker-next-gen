package store

import (
	"context"
	"database/sql"
	"fmt"
	"strings"
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
		INSERT INTO poker_club (id,name,slug,description,currency,accepts_global_wallet,timezone,primary_language,twofa_required,is_active,created_at,updated_at)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
		club.ID, club.Name, club.Slug, club.Description, club.Currency, club.AcceptsGlobalWallet,
		club.Timezone, club.PrimaryLanguage, club.TwoFARequired, club.IsActive, club.CreatedAt, club.UpdatedAt)
	return err
}

func (s *ClubStore) List(ctx context.Context) ([]models.Club, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT id,name,slug,description,currency,accepts_global_wallet,COALESCE(timezone,'UTC'),COALESCE(primary_language,'en'),COALESCE(twofa_required,FALSE),is_active,created_at,updated_at FROM poker_club WHERE is_active ORDER BY created_at DESC LIMIT 100`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []models.Club
	for rows.Next() {
		var c models.Club
		if err := rows.Scan(&c.ID, &c.Name, &c.Slug, &c.Description, &c.Currency, &c.AcceptsGlobalWallet, &c.Timezone, &c.PrimaryLanguage, &c.TwoFARequired, &c.IsActive, &c.CreatedAt, &c.UpdatedAt); err != nil {
			return nil, err
		}
		out = append(out, c)
	}
	return out, rows.Err()
}

func (s *ClubStore) GetByID(ctx context.Context, id string) (*models.Club, error) {
	var c models.Club
	err := s.db.QueryRowContext(ctx, `SELECT id,name,slug,description,currency,accepts_global_wallet,COALESCE(timezone,'UTC'),COALESCE(primary_language,'en'),COALESCE(twofa_required,FALSE),is_active,created_at,updated_at FROM poker_club WHERE id=$1`, id).
		Scan(&c.ID, &c.Name, &c.Slug, &c.Description, &c.Currency, &c.AcceptsGlobalWallet, &c.Timezone, &c.PrimaryLanguage, &c.TwoFARequired, &c.IsActive, &c.CreatedAt, &c.UpdatedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &c, nil
}

// GetBySlug resolves a club by its slug (the shareable join code). Case- and
// space-insensitive on the caller side; slugs are stored normalized.
func (s *ClubStore) GetBySlug(ctx context.Context, slug string) (*models.Club, error) {
	var c models.Club
	err := s.db.QueryRowContext(ctx, `SELECT id,name,slug,description,currency,accepts_global_wallet,COALESCE(timezone,'UTC'),COALESCE(primary_language,'en'),COALESCE(twofa_required,FALSE),is_active,created_at,updated_at FROM poker_club WHERE slug=$1 AND is_active`, slug).
		Scan(&c.ID, &c.Name, &c.Slug, &c.Description, &c.Currency, &c.AcceptsGlobalWallet, &c.Timezone, &c.PrimaryLanguage, &c.TwoFARequired, &c.IsActive, &c.CreatedAt, &c.UpdatedAt)
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
		INSERT INTO poker_owner (id,club_id,user_id,role,equity_bps,can_configure,permissions,created_at,updated_at)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
		ON CONFLICT (club_id,user_id) DO UPDATE SET role=$4,equity_bps=$5,can_configure=$6,permissions=$7,updated_at=$9`,
		o.ID, o.ClubID, o.UserID, o.Role, o.EquityBps, o.CanConfigure, o.Permissions, o.CreatedAt, o.UpdatedAt)
	return err
}

// RemoveOwner revokes an operator seat (owner/manager/agent). Reports whether a
// row was actually removed, so the caller can tell "removed" from "already
// wasn't there" — the latter must not be reported as success.
//
// AddOwner had no inverse: seats could be granted and never revoked, so a
// departed partner kept their equity and operator access permanently, and
// there was no way to correct a seat added in error.
func (s *ClubStore) RemoveOwner(ctx context.Context, clubID, userID string) (bool, error) {
	res, err := s.db.ExecContext(ctx,
		`DELETE FROM poker_owner WHERE club_id=$1 AND user_id=$2`, clubID, userID)
	if err != nil {
		return false, err
	}
	n, err := res.RowsAffected()
	return n > 0, err
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
	// Permissions is the seat's granted capability slugs. Empty means the seat
	// predates the permission grid and still has full access — the UI must render
	// that as "full access", NOT as "no permissions". Advisory only: the server
	// re-checks in requireClubPermission.
	Permissions []string `json:"permissions"`
}

// RolesFor returns the caller's fine role in every active club they belong to.
// Owner-seat (poker_owner) beats a plain membership row when both exist.
func (s *ClubStore) RolesFor(ctx context.Context, userID string) ([]ClubRole, error) {
	byClub := map[string]ClubRole{}

	// Owner seats (operators): owner | manager | agent + can_configure.
	oRows, err := s.db.QueryContext(ctx, `
		SELECT o.club_id, o.role, (o.can_configure OR o.role='owner'), COALESCE(o.permissions,'')
		FROM poker_owner o
		JOIN poker_club c ON c.id=o.club_id AND c.is_active
		WHERE o.user_id=$1`, userID)
	if err != nil {
		return nil, err
	}
	for oRows.Next() {
		var r ClubRole
		var perms string
		if err := oRows.Scan(&r.ClubID, &r.Role, &r.CanConfigure, &perms); err != nil {
			oRows.Close()
			return nil, err
		}
		r.Operator = true
		r.Permissions = SplitPermissions(perms)
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
	rows, err := s.db.QueryContext(ctx, `SELECT id,club_id,user_id,role,equity_bps,can_configure,COALESCE(permissions,''),created_at,updated_at FROM poker_owner WHERE club_id=$1`, clubID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []models.Owner
	for rows.Next() {
		var o models.Owner
		if err := rows.Scan(&o.ID, &o.ClubID, &o.UserID, &o.Role, &o.EquityBps, &o.CanConfigure, &o.Permissions, &o.CreatedAt, &o.UpdatedAt); err != nil {
			return nil, err
		}
		out = append(out, o)
	}
	return out, rows.Err()
}

// SetOwnerPermissions updates one operator seat's role and capability grid.
// Scoped by (club_id, user_id) so it can never touch a seat at another club.
func (s *ClubStore) SetOwnerPermissions(ctx context.Context, clubID, userID, role, permissions string) error {
	res, err := s.db.ExecContext(ctx, `
		UPDATE poker_owner SET role=$3, permissions=$4, updated_at=NOW()
		WHERE club_id=$1 AND user_id=$2`, clubID, userID, role, permissions)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return fmt.Errorf("no operator seat for that user at this club")
	}
	return nil
}

// SetClubPreferences persists the club settings the server itself interprets:
// the timezone schedules resolve in, the public-profile language label, and
// whether operators must have 2FA enrolled.
func (s *ClubStore) SetClubPreferences(ctx context.Context, clubID, timezone, language string, twofaRequired bool) error {
	_, err := s.db.ExecContext(ctx, `
		UPDATE poker_club SET timezone=$2, primary_language=$3, twofa_required=$4, updated_at=NOW()
		WHERE id=$1`, clubID, timezone, language, twofaRequired)
	return err
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

// AllocateBalance moves club-issued chips to a member. `b.Balance` is a DELTA,
// not an absolute: it is added to whatever the member already holds.
//
// `reason` is required and ends up in the ledger. Club chips used to move with
// no record whatsoever — no audit row, no ledger posting, no table anywhere that
// said who allocated what — so a member's balance could change and nobody, the
// member least of all, could find out why.
func (s *ClubStore) AllocateBalance(ctx context.Context, b *models.PlayerAllocatedBalance, reason string) error {
	if b.Balance == 0 {
		return fmt.Errorf("allocation amount cannot be zero")
	}
	if strings.TrimSpace(reason) == "" {
		return fmt.Errorf("an allocation reason is required")
	}
	b.ID = NewID("bal")
	now := time.Now().UTC()
	b.CreatedAt, b.UpdatedAt = now, now

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	// The balance guard is what makes a negative delta safe. Clawing back more
	// than a member holds would leave them owing chips they never had, and the
	// seating code reads this balance as spendable — a negative would be treated
	// as a very large unsigned budget by any comparison that forgets the sign.
	var after int64
	err = tx.QueryRowContext(ctx, `
		INSERT INTO poker_player_balance (id,club_id,user_id,balance,locked_amount,currency,created_at,updated_at)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
		ON CONFLICT (club_id,user_id) DO UPDATE
			SET balance=poker_player_balance.balance+$4, updated_at=$8
			WHERE poker_player_balance.balance + $4 >= 0
		RETURNING balance`,
		b.ID, b.ClubID, b.UserID, b.Balance, b.LockedAmount, b.Currency, b.CreatedAt, b.UpdatedAt,
	).Scan(&after)
	if err == sql.ErrNoRows {
		return fmt.Errorf("that would take the member's club balance below zero")
	}
	if err != nil {
		return err
	}

	// Double-entry: chips issued by a club are a debt the club takes on, so the
	// club's own account is debited as the member's is credited. The club account
	// running negative is the point — it is exactly how much credit the club has
	// extended, a figure nobody was tracking before.
	if err := postLedgerKind(ctx, tx, "club_allocation",
		ClubIssuanceAcct(b.ClubID), ClubMemberAcct(b.ClubID, b.UserID), b.Balance, reason); err != nil {
		return err
	}
	return tx.Commit()
}

// EquityBpsExcluding totals the equity already allocated to a club's owner
// seats, ignoring one user (the seat being added or edited).
//
// Equity was accepted verbatim from the request with no arithmetic anywhere, so
// a club could be 150% owned — the creator holds 10000 bps and every seat added
// afterwards adds more on top. The figure is shown to operators as their
// ownership split; a split that does not add up is not a split.
func (s *ClubStore) EquityBpsExcluding(ctx context.Context, clubID, exceptUserID string) (int, error) {
	var total int
	err := s.db.QueryRowContext(ctx,
		`SELECT COALESCE(SUM(equity_bps), 0) FROM poker_owner WHERE club_id=$1 AND user_id <> $2`,
		clubID, exceptUserID).Scan(&total)
	return total, err
}

// OutstandingChips reports how much a club still owes its members in club
// chips, and to how many of them (spendable + locked, because chips in a live
// pot are still owed).
//
// Closing a club is not a display change: whatever it holds on behalf of its
// members has to be settled first, or the balance simply becomes unreachable.
func (s *ClubStore) OutstandingChips(ctx context.Context, clubID string) (total int64, holders int, err error) {
	err = s.db.QueryRowContext(ctx, `
		SELECT COALESCE(SUM(balance + locked_amount), 0),
		       COUNT(*) FILTER (WHERE balance + locked_amount > 0)
		FROM poker_player_balance WHERE club_id=$1`, clubID).Scan(&total, &holders)
	return total, holders, err
}

// OpenSeatCount is how many players are currently seated at this club's tables.
func (s *ClubStore) OpenSeatCount(ctx context.Context, clubID string) (int, error) {
	var n int
	err := s.db.QueryRowContext(ctx,
		`SELECT COUNT(*) FROM poker_seat_session WHERE club_id=$1 AND status='open'`, clubID).Scan(&n)
	return n, err
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
	return s.LockBalanceForTable(ctx, clubID, userID, amount, "")
}

// LockBalanceForTable reserves club chips for a seat at `matchID`.
//
// The matchID is what lets the chips be followed. Reserving without it recorded
// that a member's balance moved into "locked" but not where it went, so a pot
// redistributing chips between members left no trace at all — the ledger knew
// how much a club had issued and nothing about what happened next.
func (s *ClubStore) LockBalanceForTable(ctx context.Context, clubID, userID string, amount int64, matchID string) error {
	if amount <= 0 {
		return nil
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	res, err := tx.ExecContext(ctx, `
		UPDATE poker_player_balance SET locked_amount=locked_amount+$3, balance=balance-$3, updated_at=NOW()
		WHERE club_id=$1 AND user_id=$2 AND balance>=$3`, clubID, userID, amount)
	if err != nil {
		return err
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return fmt.Errorf("insufficient club balance")
	}
	if matchID != "" {
		if err := postLedgerKind(ctx, tx, "table_buyin",
			ClubMemberAcct(clubID, userID), TableAcct(matchID), amount, "table_buyin:"+matchID); err != nil {
			return err
		}
	}
	if err := tx.Commit(); err != nil {
		return err
	}
	return nil
}

func (s *ClubStore) UnlockBalance(ctx context.Context, clubID, userID string, amount int64) error {
	return s.SettleSeat(ctx, clubID, userID, amount, amount)
}

// SettleSeat releases a seat funded by club chips: `locked` is what was reserved
// at sit-down, `returned` is the stack actually leaving the table.
//
// These differ every time a player wins or loses, and conflating them was a live
// leak. The old UnlockBalance took ONE amount — the caller passed the final
// stack — and unlocked it with GREATEST(0, locked_amount - stack). A player who
// bought in for 1000 and left with 400 therefore had 400 returned to their
// balance and 600 left pinned in locked_amount forever: not destroyed, but
// unspendable and invisible, and it grew with every losing session. Their
// balance read low while locked_amount claimed they were sitting in a pot they
// had left.
//
// Releasing the ORIGINAL reservation and crediting the ACTUAL stack keeps
// locked_amount a true measure of chips currently in play.
func (s *ClubStore) SettleSeat(ctx context.Context, clubID, userID string, locked, returned int64) error {
	return s.SettleSeatAtTable(ctx, clubID, userID, locked, returned, "")
}

// SettleSeatAtTable is SettleSeat with the table the chips are coming back from,
// so the return posts against that table's ledger account. The difference
// between what a player took to the table and what they carried off is exactly
// what they won or lost, and the table account is where it comes from or goes.
func (s *ClubStore) SettleSeatAtTable(ctx context.Context, clubID, userID string, locked, returned int64, matchID string) error {
	if locked < 0 {
		locked = 0
	}
	if returned < 0 {
		returned = 0
	}
	if locked == 0 && returned == 0 {
		return nil
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if _, err := tx.ExecContext(ctx, `
		UPDATE poker_player_balance
		SET locked_amount=GREATEST(0,locked_amount-$3), balance=balance+$4, updated_at=NOW()
		WHERE club_id=$1 AND user_id=$2`, clubID, userID, locked, returned); err != nil {
		return err
	}
	if matchID != "" && returned > 0 {
		if err := postLedgerKind(ctx, tx, "table_cashout",
			TableAcct(matchID), ClubMemberAcct(clubID, userID), returned, "table_cashout:"+matchID); err != nil {
			return err
		}
	}
	return tx.Commit()
}
