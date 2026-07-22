package store

import (
	"context"
	"database/sql"
	"strings"
	"time"
)

// ---------------------------------------------------------------------------
// Missions / quests
// ---------------------------------------------------------------------------

// Mission is a daily/weekly quest with a numeric goal and a wallet + battle-pass
// XP reward. Missions are keyed by (code, period_key) so a daily "win 3 hands"
// mission is a distinct row each day.
type Mission struct {
	ID          string    `json:"id"`
	Code        string    `json:"code"`
	Title       string    `json:"title"`
	Description string    `json:"description"`
	Kind        string    `json:"kind"`   // daily | weekly
	Metric      string    `json:"metric"` // hands_played | hands_won | showdowns_won | vpip_hands | ...
	Goal        int64     `json:"goal"`
	RewardCents int64     `json:"reward_cents"`
	XP          int64     `json:"xp"`
	PeriodKey   string    `json:"period_key"`
	Active      bool      `json:"active"`
	ExpiresAt   time.Time `json:"expires_at"`
	CreatedAt   time.Time `json:"created_at"`
}

// MissionWithProgress joins a mission with the caller's progress toward it.
type MissionWithProgress struct {
	Mission
	Progress  int64 `json:"progress"`
	Claimed   bool  `json:"claimed"`
	Completed bool  `json:"completed"`
}

type MissionStore struct{ db *sql.DB }

func NewMissionStore(db *sql.DB) *MissionStore { return &MissionStore{db: db} }

// Upsert inserts (or refreshes) a mission for its (code, period_key). Idempotent
// — used by the daily/weekly seed so re-running never duplicates a mission.
func (s *MissionStore) Upsert(ctx context.Context, m *Mission) (string, error) {
	if m.ID == "" {
		m.ID = NewID("msn")
	}
	if m.Kind == "" {
		m.Kind = "daily"
	}
	err := s.db.QueryRowContext(ctx, `
		INSERT INTO poker_mission (id, code, title, description, kind, metric, goal, reward_cents, xp, period_key, active, expires_at, created_at)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,TRUE,$11,NOW())
		ON CONFLICT (code, period_key) DO UPDATE SET
			title=EXCLUDED.title,
			description=EXCLUDED.description,
			kind=EXCLUDED.kind,
			metric=EXCLUDED.metric,
			goal=EXCLUDED.goal,
			reward_cents=EXCLUDED.reward_cents,
			xp=EXCLUDED.xp,
			active=TRUE,
			expires_at=EXCLUDED.expires_at
		RETURNING id`,
		m.ID, m.Code, m.Title, m.Description, m.Kind, m.Metric, m.Goal, m.RewardCents, m.XP, m.PeriodKey, m.ExpiresAt).
		Scan(&m.ID)
	return m.ID, err
}

// GetByID returns a mission, or (nil, nil) if missing.
func (s *MissionStore) GetByID(ctx context.Context, id string) (*Mission, error) {
	var m Mission
	err := s.db.QueryRowContext(ctx, `
		SELECT id, code, title, description, kind, metric, goal, reward_cents, xp, period_key, active, expires_at, created_at
		FROM poker_mission WHERE id=$1`, id).
		Scan(&m.ID, &m.Code, &m.Title, &m.Description, &m.Kind, &m.Metric, &m.Goal, &m.RewardCents, &m.XP, &m.PeriodKey, &m.Active, &m.ExpiresAt, &m.CreatedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &m, nil
}

// ListForUser returns the currently-active (non-expired) missions joined with the
// caller's progress, newest first.
func (s *MissionStore) ListForUser(ctx context.Context, userID string) ([]MissionWithProgress, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT m.id, m.code, m.title, m.description, m.kind, m.metric, m.goal, m.reward_cents, m.xp,
		       m.period_key, m.active, m.expires_at, m.created_at,
		       COALESCE(p.progress, 0), COALESCE(p.claimed, FALSE)
		FROM poker_mission m
		LEFT JOIN poker_mission_progress p ON p.mission_id = m.id AND p.user_id = $1
		WHERE m.active AND m.expires_at > NOW()
		ORDER BY m.kind ASC, m.created_at DESC
		LIMIT 200`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []MissionWithProgress{}
	for rows.Next() {
		var mp MissionWithProgress
		if err := rows.Scan(&mp.ID, &mp.Code, &mp.Title, &mp.Description, &mp.Kind, &mp.Metric, &mp.Goal,
			&mp.RewardCents, &mp.XP, &mp.PeriodKey, &mp.Active, &mp.ExpiresAt, &mp.CreatedAt,
			&mp.Progress, &mp.Claimed); err != nil {
			return nil, err
		}
		mp.Completed = mp.Progress >= mp.Goal
		out = append(out, mp)
	}
	return out, rows.Err()
}

// Progress returns (progress, claimed) for one mission, defaulting to (0,false).
func (s *MissionStore) Progress(ctx context.Context, userID, missionID string) (int64, bool, error) {
	var progress int64
	var claimed bool
	err := s.db.QueryRowContext(ctx,
		`SELECT progress, claimed FROM poker_mission_progress WHERE user_id=$1 AND mission_id=$2`,
		userID, missionID).Scan(&progress, &claimed)
	if err == sql.ErrNoRows {
		return 0, false, nil
	}
	if err != nil {
		return 0, false, err
	}
	return progress, claimed, nil
}

// Increment adds to a user's progress on a single mission (upsert).
func (s *MissionStore) Increment(ctx context.Context, userID, missionID string, delta int64) error {
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO poker_mission_progress (user_id, mission_id, progress, claimed, updated_at)
		VALUES ($1,$2,$3,FALSE,NOW())
		ON CONFLICT (user_id, mission_id) DO UPDATE SET
			progress = poker_mission_progress.progress + $3,
			updated_at = NOW()`,
		userID, missionID, delta)
	return err
}

// AccrueByMetric advances every active mission that tracks the given metric for a
// user (the match-loop settlement hook fans out through this — one row per active
// metric-matching mission). Idempotent-safe; safe to call with delta 0.
func (s *MissionStore) AccrueByMetric(ctx context.Context, userID, metric string, delta int64) error {
	if delta == 0 {
		return nil
	}
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO poker_mission_progress (user_id, mission_id, progress, claimed, updated_at)
		SELECT $1, m.id, $3, FALSE, NOW()
		FROM poker_mission m
		WHERE m.active AND m.expires_at > NOW() AND m.metric = $2
		ON CONFLICT (user_id, mission_id) DO UPDATE SET
			progress = poker_mission_progress.progress + $3,
			updated_at = NOW()`,
		userID, metric, delta)
	return err
}

// Claim atomically marks a mission claimed for a user IF it is completed and not
// already claimed. Returns true when this call performed the claim (so the caller
// credits the reward exactly once); false when already claimed or not completed.
func (s *MissionStore) Claim(ctx context.Context, userID, missionID string, goal int64) (bool, error) {
	// Ensure a progress row exists so the UPDATE can flip claimed even if the user
	// reached the goal purely via metric accrual on an as-yet-uninserted row.
	res, err := s.db.ExecContext(ctx, `
		UPDATE poker_mission_progress
		SET claimed = TRUE, claimed_at = NOW(), updated_at = NOW()
		WHERE user_id=$1 AND mission_id=$2 AND NOT claimed AND progress >= $3`,
		userID, missionID, goal)
	if err != nil {
		return false, err
	}
	n, _ := res.RowsAffected()
	return n > 0, nil
}

// ---------------------------------------------------------------------------
// Battle pass
// ---------------------------------------------------------------------------

// BattlePassSeason is a time-boxed progression track. TiersJSON holds the reward
// table as a JSON array of {tier, free_cents, premium_cents} objects; the rpc
// layer owns its shape.
type BattlePassSeason struct {
	ID           string    `json:"id"`
	Name         string    `json:"name"`
	StartsAt     time.Time `json:"starts_at"`
	EndsAt       time.Time `json:"ends_at"`
	Status       string    `json:"status"` // upcoming | active | completed
	XPPerTier    int64     `json:"xp_per_tier"`
	MaxTier      int       `json:"max_tier"`
	PremiumCents int64     `json:"premium_cents"`
	TiersJSON    string    `json:"tiers_json"`
	CreatedAt    time.Time `json:"created_at"`
}

// BattlePassProgress is a user's standing in a season. ClaimedFree / ClaimedPremium
// hold JSON int arrays of the tiers already claimed on each track.
type BattlePassProgress struct {
	UserID         string    `json:"user_id"`
	SeasonID       string    `json:"season_id"`
	XP             int64     `json:"xp"`
	Premium        bool      `json:"premium"`
	ClaimedFree    string    `json:"claimed_free"`
	ClaimedPremium string    `json:"claimed_premium"`
	UpdatedAt      time.Time `json:"updated_at"`
}

type BattlePassStore struct{ db *sql.DB }

func NewBattlePassStore(db *sql.DB) *BattlePassStore { return &BattlePassStore{db: db} }

// CreateSeason inserts a season.
func (s *BattlePassStore) CreateSeason(ctx context.Context, season *BattlePassSeason) error {
	if season.ID == "" {
		season.ID = NewID("bps")
	}
	if season.Status == "" {
		season.Status = "active"
	}
	if season.TiersJSON == "" {
		season.TiersJSON = "[]"
	}
	season.CreatedAt = time.Now().UTC()
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO poker_battlepass_season (id, name, starts_at, ends_at, status, xp_per_tier, max_tier, premium_cents, tiers_json, created_at)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
		season.ID, season.Name, season.StartsAt, season.EndsAt, season.Status,
		season.XPPerTier, season.MaxTier, season.PremiumCents, season.TiersJSON, season.CreatedAt)
	return err
}

// ActiveSeason returns the current active season, or (nil, nil) if none.
func (s *BattlePassStore) ActiveSeason(ctx context.Context) (*BattlePassSeason, error) {
	var b BattlePassSeason
	err := s.db.QueryRowContext(ctx, `
		SELECT id, name, starts_at, ends_at, status, xp_per_tier, max_tier, premium_cents, tiers_json, created_at
		FROM poker_battlepass_season
		WHERE status='active' AND starts_at <= NOW() AND ends_at > NOW()
		ORDER BY starts_at DESC LIMIT 1`).
		Scan(&b.ID, &b.Name, &b.StartsAt, &b.EndsAt, &b.Status, &b.XPPerTier, &b.MaxTier, &b.PremiumCents, &b.TiersJSON, &b.CreatedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &b, nil
}

// GetSeasonByID returns a season, or (nil, nil) if missing.
func (s *BattlePassStore) GetSeasonByID(ctx context.Context, id string) (*BattlePassSeason, error) {
	var b BattlePassSeason
	err := s.db.QueryRowContext(ctx, `
		SELECT id, name, starts_at, ends_at, status, xp_per_tier, max_tier, premium_cents, tiers_json, created_at
		FROM poker_battlepass_season WHERE id=$1`, id).
		Scan(&b.ID, &b.Name, &b.StartsAt, &b.EndsAt, &b.Status, &b.XPPerTier, &b.MaxTier, &b.PremiumCents, &b.TiersJSON, &b.CreatedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &b, nil
}

// GetProgress returns a user's progress in a season, defaulting to a zeroed row.
func (s *BattlePassStore) GetProgress(ctx context.Context, userID, seasonID string) (*BattlePassProgress, error) {
	p := BattlePassProgress{UserID: userID, SeasonID: seasonID, ClaimedFree: "[]", ClaimedPremium: "[]"}
	err := s.db.QueryRowContext(ctx, `
		SELECT xp, premium, claimed_free, claimed_premium, updated_at
		FROM poker_battlepass_progress WHERE user_id=$1 AND season_id=$2`, userID, seasonID).
		Scan(&p.XP, &p.Premium, &p.ClaimedFree, &p.ClaimedPremium, &p.UpdatedAt)
	if err == sql.ErrNoRows {
		return &p, nil
	}
	if err != nil {
		return nil, err
	}
	return &p, nil
}

// AddXP adds battle-pass XP to a user's season progress (upsert), returning the
// new total. Called when a mission is claimed and by the match-loop hook.
func (s *BattlePassStore) AddXP(ctx context.Context, userID, seasonID string, xp int64) (int64, error) {
	var total int64
	err := s.db.QueryRowContext(ctx, `
		INSERT INTO poker_battlepass_progress (user_id, season_id, xp, premium, claimed_free, claimed_premium, updated_at)
		VALUES ($1,$2,$3,FALSE,'[]','[]',NOW())
		ON CONFLICT (user_id, season_id) DO UPDATE SET
			xp = poker_battlepass_progress.xp + $3,
			updated_at = NOW()
		RETURNING xp`, userID, seasonID, xp).Scan(&total)
	return total, err
}

// SetPremium flips the premium flag on a user's season progress (upsert).
func (s *BattlePassStore) SetPremium(ctx context.Context, userID, seasonID string) error {
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO poker_battlepass_progress (user_id, season_id, xp, premium, claimed_free, claimed_premium, updated_at)
		VALUES ($1,$2,0,TRUE,'[]','[]',NOW())
		ON CONFLICT (user_id, season_id) DO UPDATE SET premium=TRUE, updated_at=NOW()`,
		userID, seasonID)
	return err
}

// SetClaimed persists the (already-computed) claimed-tier JSON arrays for a track.
func (s *BattlePassStore) SetClaimed(ctx context.Context, userID, seasonID, claimedFree, claimedPremium string) error {
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO poker_battlepass_progress (user_id, season_id, xp, premium, claimed_free, claimed_premium, updated_at)
		VALUES ($1,$2,0,FALSE,$3,$4,NOW())
		ON CONFLICT (user_id, season_id) DO UPDATE SET
			claimed_free=$3, claimed_premium=$4, updated_at=NOW()`,
		userID, seasonID, claimedFree, claimedPremium)
	return err
}

// ---------------------------------------------------------------------------
// Referrals
// ---------------------------------------------------------------------------

// Referral is either an anchor row (ReferredUserID == "") holding a user's own
// invite code, or an attribution row linking a referrer to a referred user.
type Referral struct {
	ID                  string    `json:"id"`
	ReferrerUserID      string    `json:"referrer_user_id"`
	Code                string    `json:"code"`
	ReferredUserID      string    `json:"referred_user_id,omitempty"`
	Status              string    `json:"status"` // issued | applied | claimed
	RewardCents         int64     `json:"reward_cents"`
	ReferredRewardCents int64     `json:"referred_reward_cents"`
	CreatedAt           time.Time `json:"created_at"`
	AppliedAt           time.Time `json:"applied_at,omitempty"`
	ClaimedAt           time.Time `json:"claimed_at,omitempty"`
}

type ReferralStore struct{ db *sql.DB }

func NewReferralStore(db *sql.DB) *ReferralStore { return &ReferralStore{db: db} }

// EnsureCode returns the caller's personal invite code, minting the anchor row on
// first call. Idempotent — one anchor per referrer.
func (s *ReferralStore) EnsureCode(ctx context.Context, userID string) (string, error) {
	var code string
	err := s.db.QueryRowContext(ctx,
		`SELECT code FROM poker_referral WHERE referrer_user_id=$1 AND referred_user_id=''`, userID).Scan(&code)
	if err == nil {
		return code, nil
	}
	if err != sql.ErrNoRows {
		return "", err
	}
	code = missionsReferralCode(userID)
	_, err = s.db.ExecContext(ctx, `
		INSERT INTO poker_referral (id, referrer_user_id, code, referred_user_id, status, reward_cents, referred_reward_cents, created_at)
		VALUES ($1,$2,$3,'','issued',0,0,NOW())
		ON CONFLICT (referrer_user_id, referred_user_id) DO NOTHING`,
		NewID("ref"), userID, code)
	if err != nil {
		return "", err
	}
	// Re-read in case of a concurrent insert winning the ON CONFLICT.
	err = s.db.QueryRowContext(ctx,
		`SELECT code FROM poker_referral WHERE referrer_user_id=$1 AND referred_user_id=''`, userID).Scan(&code)
	return code, err
}

// ReferrerForCode returns the anchor owner of an invite code, or "" if unknown.
func (s *ReferralStore) ReferrerForCode(ctx context.Context, code string) (string, error) {
	var referrer string
	err := s.db.QueryRowContext(ctx,
		`SELECT referrer_user_id FROM poker_referral WHERE code=$1 AND referred_user_id='' LIMIT 1`, code).Scan(&referrer)
	if err == sql.ErrNoRows {
		return "", nil
	}
	return referrer, err
}

// WasReferred reports whether a user has already been attributed to a referrer.
func (s *ReferralStore) WasReferred(ctx context.Context, userID string) (bool, error) {
	var one int
	err := s.db.QueryRowContext(ctx,
		`SELECT 1 FROM poker_referral WHERE referred_user_id=$1 LIMIT 1`, userID).Scan(&one)
	if err == sql.ErrNoRows {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	return true, nil
}

// Apply records an attribution row (referrer → referredUser). The caller has
// already verified referredUser is new and not self-referring.
func (s *ReferralStore) Apply(ctx context.Context, referrer, code, referredUser string, rewardCents, referredRewardCents int64) (string, error) {
	id := NewID("ref")
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO poker_referral (id, referrer_user_id, code, referred_user_id, status, reward_cents, referred_reward_cents, created_at, applied_at)
		VALUES ($1,$2,$3,$4,'applied',$5,$6,NOW(),NOW())`,
		id, referrer, code, referredUser, rewardCents, referredRewardCents)
	return id, err
}

// ListReferrals returns a referrer's attribution rows (excludes the anchor).
func (s *ReferralStore) ListReferrals(ctx context.Context, referrer string) ([]Referral, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT id, referrer_user_id, code, referred_user_id, status, reward_cents, referred_reward_cents, created_at
		FROM poker_referral
		WHERE referrer_user_id=$1 AND referred_user_id<>''
		ORDER BY created_at DESC LIMIT 500`, referrer)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Referral{}
	for rows.Next() {
		var r Referral
		if err := rows.Scan(&r.ID, &r.ReferrerUserID, &r.Code, &r.ReferredUserID, &r.Status,
			&r.RewardCents, &r.ReferredRewardCents, &r.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

// ClaimAll marks every 'applied' attribution row for a referrer as 'claimed' and
// returns the rows that transitioned (so the caller credits each reward once).
func (s *ReferralStore) ClaimAll(ctx context.Context, referrer string) ([]Referral, error) {
	rows, err := s.db.QueryContext(ctx, `
		UPDATE poker_referral
		SET status='claimed', claimed_at=NOW()
		WHERE referrer_user_id=$1 AND referred_user_id<>'' AND status='applied'
		RETURNING id, referrer_user_id, code, referred_user_id, status, reward_cents, referred_reward_cents, created_at`,
		referrer)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Referral{}
	for rows.Next() {
		var r Referral
		if err := rows.Scan(&r.ID, &r.ReferrerUserID, &r.Code, &r.ReferredUserID, &r.Status,
			&r.RewardCents, &r.ReferredRewardCents, &r.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

// missionsReferralCode derives a short, stable, human-friendly invite code from a
// user id. Domain-prefixed to avoid colliding with other store helpers.
func missionsReferralCode(userID string) string {
	raw := strings.ToUpper(strings.ReplaceAll(NewID("x"), "-", ""))
	// Fold in a couple of characters of the user id for extra entropy/stability.
	seed := strings.ToUpper(strings.ReplaceAll(userID, "-", ""))
	if len(seed) > 2 {
		raw = seed[:2] + raw
	}
	raw = strings.Map(func(r rune) rune {
		if (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9') {
			return r
		}
		return -1
	}, raw)
	if len(raw) > 8 {
		raw = raw[:8]
	}
	return raw
}
