package rpc

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"os"
	"strconv"
	"time"

	"github.com/heroiclabs/nakama-common/runtime"

	"github.com/smithdouglas404/poker-next-gen/backend-core/store"
)

// ---------------------------------------------------------------------------
// Reward configuration (env-overridable, mirrors character.go's fee pattern)
// ---------------------------------------------------------------------------

func missionsEnvCents(key string, def int64) int64 {
	if v := os.Getenv(key); v != "" {
		if n, err := strconv.ParseInt(v, 10, 64); err == nil && n >= 0 {
			return n
		}
	}
	return def
}

// referrerRewardCents is credited to the referrer per qualified referral claim.
func missionsReferrerRewardCents() int64 { return missionsEnvCents("REFERRAL_REFERRER_CENTS", 500) }

// referredRewardCents is the welcome bonus credited to a newly-referred player.
func missionsReferredRewardCents() int64 { return missionsEnvCents("REFERRAL_REFERRED_CENTS", 250) }

// ---------------------------------------------------------------------------
// Missions
// ---------------------------------------------------------------------------

// MissionsList returns the caller's active daily/weekly missions with progress.
func MissionsList(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	userID, err := callerID(ctx)
	if err != nil {
		return "", err
	}
	missions, err := store.NewMissionStore(db).ListForUser(ctx, userID)
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	out, _ := json.Marshal(map[string]interface{}{"missions": missions})
	return string(out), nil
}

// MissionClaim credits the wallet reward for a completed, unclaimed mission and
// awards its battle-pass XP to the active season (exactly once).
func MissionClaim(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	userID, err := callerID(ctx)
	if err != nil {
		return "", err
	}
	var req struct {
		MissionID string `json:"mission_id"`
	}
	if err := json.Unmarshal([]byte(payload), &req); err != nil || req.MissionID == "" {
		return "", runtime.NewError("mission_id required", 3)
	}
	ms := store.NewMissionStore(db)
	m, err := ms.GetByID(ctx, req.MissionID)
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	if m == nil {
		return "", runtime.NewError("mission not found", 5)
	}
	progress, claimed, err := ms.Progress(ctx, userID, req.MissionID)
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	if claimed {
		return "", runtime.NewError("mission already claimed", 9)
	}
	if progress < m.Goal {
		return "", runtime.NewError("mission not complete yet", 9)
	}
	// Flip claimed atomically first — this is the guard against double-credit.
	ok, err := ms.Claim(ctx, userID, req.MissionID, m.Goal)
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	if !ok {
		return "", runtime.NewError("mission already claimed", 9)
	}
	if m.RewardCents > 0 {
		if err := store.NewWalletStore(db).Credit(ctx, userID, m.RewardCents, "mission_reward:"+m.Code); err != nil {
			logger.Error("mission reward credit: %v", err)
			return "", runtime.NewError("reward credit failed", 13)
		}
	}
	// Feed the active battle-pass season with this mission's XP (best-effort).
	var xpTotal int64
	if m.XP > 0 {
		if season, serr := store.NewBattlePassStore(db).ActiveSeason(ctx); serr == nil && season != nil {
			xpTotal, _ = store.NewBattlePassStore(db).AddXP(ctx, userID, season.ID, m.XP)
		}
	}
	out, _ := json.Marshal(map[string]interface{}{
		"ok":            true,
		"reward_cents":  m.RewardCents,
		"reward":        dollars(m.RewardCents),
		"xp_awarded":    m.XP,
		"battlepass_xp": xpTotal,
	})
	return string(out), nil
}

// missionTemplate is a seedable mission definition.
type missionTemplate struct {
	Code        string
	Title       string
	Description string
	Metric      string
	Goal        int64
	RewardCents int64
	XP          int64
}

var missionsDailyTemplates = []missionTemplate{
	{"daily_play_20", "Grinder", "Play 20 hands today.", "hands_played", 20, 100, 100},
	{"daily_win_5", "Winner's Circle", "Win 5 hands today.", "hands_won", 5, 150, 150},
	{"daily_showdown_3", "Showdown Specialist", "Win 3 hands at showdown today.", "showdowns_won", 3, 200, 200},
}

var missionsWeeklyTemplates = []missionTemplate{
	{"weekly_play_200", "Marathon", "Play 200 hands this week.", "hands_played", 200, 750, 600},
	{"weekly_win_50", "Dominator", "Win 50 hands this week.", "hands_won", 50, 1000, 800},
}

// MissionsGenerateDaily (admin/seed) upserts the daily and weekly mission sets for
// the current period. Idempotent per (code, period_key).
func MissionsGenerateDaily(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	if _, err := requireAdmin(ctx); err != nil {
		return "", err
	}
	var req struct {
		Kind string `json:"kind"` // "" | daily | weekly (empty = both)
	}
	if payload != "" {
		_ = json.Unmarshal([]byte(payload), &req)
	}
	ms := store.NewMissionStore(db)
	now := time.Now().UTC()
	created := 0

	if req.Kind == "" || req.Kind == "daily" {
		dayKey := now.Format("2006-01-02")
		dayEnd := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.UTC).Add(24 * time.Hour)
		for _, t := range missionsDailyTemplates {
			if err := missionsSeedOne(ctx, ms, t, "daily", dayKey, dayEnd); err != nil {
				return "", runtime.NewError(err.Error(), 13)
			}
			created++
		}
	}
	if req.Kind == "" || req.Kind == "weekly" {
		isoYear, isoWeek := now.ISOWeek()
		weekKey := fmt.Sprintf("%04d-W%02d", isoYear, isoWeek)
		// Expire at the end of the current ISO week (Monday-based).
		offset := (int(now.Weekday()) + 6) % 7 // days since Monday
		weekStart := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.UTC).AddDate(0, 0, -offset)
		weekEnd := weekStart.AddDate(0, 0, 7)
		for _, t := range missionsWeeklyTemplates {
			if err := missionsSeedOne(ctx, ms, t, "weekly", weekKey, weekEnd); err != nil {
				return "", runtime.NewError(err.Error(), 13)
			}
			created++
		}
	}
	out, _ := json.Marshal(map[string]interface{}{"ok": true, "seeded": created})
	return string(out), nil
}

func missionsSeedOne(ctx context.Context, ms *store.MissionStore, t missionTemplate, kind, periodKey string, expires time.Time) error {
	_, err := ms.Upsert(ctx, &store.Mission{
		Code:        t.Code,
		Title:       t.Title,
		Description: t.Description,
		Kind:        kind,
		Metric:      t.Metric,
		Goal:        t.Goal,
		RewardCents: t.RewardCents,
		XP:          t.XP,
		PeriodKey:   periodKey,
		ExpiresAt:   expires,
	})
	return err
}

// ---------------------------------------------------------------------------
// Battle pass
// ---------------------------------------------------------------------------

// battlePassTier is one row of a season's reward table.
type battlePassTier struct {
	Tier         int   `json:"tier"`
	FreeCents    int64 `json:"free_cents"`
	PremiumCents int64 `json:"premium_cents"`
}

func missionsParseTiers(tiersJSON string) []battlePassTier {
	var tiers []battlePassTier
	if tiersJSON != "" {
		_ = json.Unmarshal([]byte(tiersJSON), &tiers)
	}
	return tiers
}

func missionsParseClaimed(arr string) map[int]bool {
	out := map[int]bool{}
	var ints []int
	if arr != "" {
		_ = json.Unmarshal([]byte(arr), &ints)
	}
	for _, i := range ints {
		out[i] = true
	}
	return out
}

func missionsSerializeClaimed(set map[int]bool) string {
	ints := []int{}
	for k := range set {
		ints = append(ints, k)
	}
	b, _ := json.Marshal(ints)
	return string(b)
}

// missionsUnlockedTier returns the highest tier a given XP total has unlocked.
func missionsUnlockedTier(xp, xpPerTier int64, maxTier int) int {
	if xpPerTier <= 0 {
		return 0
	}
	t := int(xp / xpPerTier)
	if t > maxTier {
		t = maxTier
	}
	return t
}

// BattlePassStatus returns the active season, the caller's XP / tier, and which
// tiers remain claimable on each track.
func BattlePassStatus(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	userID, err := callerID(ctx)
	if err != nil {
		return "", err
	}
	bp := store.NewBattlePassStore(db)
	season, err := bp.ActiveSeason(ctx)
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	if season == nil {
		out, _ := json.Marshal(map[string]interface{}{"active": false})
		return string(out), nil
	}
	prog, err := bp.GetProgress(ctx, userID, season.ID)
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	unlocked := missionsUnlockedTier(prog.XP, season.XPPerTier, season.MaxTier)
	out, _ := json.Marshal(map[string]interface{}{
		"active":          true,
		"season":          season,
		"tiers":           missionsParseTiers(season.TiersJSON),
		"xp":              prog.XP,
		"premium":         prog.Premium,
		"unlocked_tier":   unlocked,
		"claimed_free":    missionsParseClaimed(prog.ClaimedFree),
		"claimed_premium": missionsParseClaimed(prog.ClaimedPremium),
	})
	return string(out), nil
}

// BattlePassClaim credits the reward for one unlocked, unclaimed tier on a track.
func BattlePassClaim(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	userID, err := callerID(ctx)
	if err != nil {
		return "", err
	}
	var req struct {
		Tier  int    `json:"tier"`
		Track string `json:"track"` // free | premium
	}
	if err := json.Unmarshal([]byte(payload), &req); err != nil {
		return "", runtime.NewError("invalid payload", 3)
	}
	if req.Track != "free" && req.Track != "premium" {
		return "", runtime.NewError("track must be free or premium", 3)
	}
	bp := store.NewBattlePassStore(db)
	season, err := bp.ActiveSeason(ctx)
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	if season == nil {
		return "", runtime.NewError("no active battle pass", 5)
	}
	prog, err := bp.GetProgress(ctx, userID, season.ID)
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	if req.Track == "premium" && !prog.Premium {
		return "", runtime.NewError("premium pass required — purchase it first", 7)
	}
	if req.Tier > missionsUnlockedTier(prog.XP, season.XPPerTier, season.MaxTier) {
		return "", runtime.NewError("tier not unlocked yet", 9)
	}

	// Locate the reward row for the requested tier.
	var reward int64
	found := false
	for _, t := range missionsParseTiers(season.TiersJSON) {
		if t.Tier == req.Tier {
			found = true
			if req.Track == "premium" {
				reward = t.PremiumCents
			} else {
				reward = t.FreeCents
			}
			break
		}
	}
	if !found {
		return "", runtime.NewError("unknown tier", 5)
	}

	claimedFree := missionsParseClaimed(prog.ClaimedFree)
	claimedPremium := missionsParseClaimed(prog.ClaimedPremium)
	target := claimedFree
	if req.Track == "premium" {
		target = claimedPremium
	}
	if target[req.Tier] {
		return "", runtime.NewError("tier already claimed", 9)
	}
	target[req.Tier] = true

	// Persist the claim BEFORE crediting so a retry can't double-pay.
	if err := bp.SetClaimed(ctx, userID, season.ID,
		missionsSerializeClaimed(claimedFree), missionsSerializeClaimed(claimedPremium)); err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	if reward > 0 {
		if err := store.NewWalletStore(db).Credit(ctx, userID, reward,
			fmt.Sprintf("battlepass_reward:%s:%s:%d", season.ID, req.Track, req.Tier)); err != nil {
			logger.Error("battlepass reward credit: %v", err)
			return "", runtime.NewError("reward credit failed", 13)
		}
	}
	out, _ := json.Marshal(map[string]interface{}{
		"ok":           true,
		"tier":         req.Tier,
		"track":        req.Track,
		"reward_cents": reward,
		"reward":       dollars(reward),
	})
	return string(out), nil
}

// BattlePassPurchasePremium debits the premium price from the wallet and unlocks
// the premium reward track for the active season.
func BattlePassPurchasePremium(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	userID, err := callerID(ctx)
	if err != nil {
		return "", err
	}
	bp := store.NewBattlePassStore(db)
	season, err := bp.ActiveSeason(ctx)
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	if season == nil {
		return "", runtime.NewError("no active battle pass", 5)
	}
	prog, err := bp.GetProgress(ctx, userID, season.ID)
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	if prog.Premium {
		return "", runtime.NewError("premium pass already owned", 9)
	}
	if season.PremiumCents > 0 {
		if err := store.NewWalletStore(db).Debit(ctx, userID, season.PremiumCents, "battlepass_premium:"+season.ID); err != nil {
			return "", runtime.NewError("premium pass costs "+dollars(season.PremiumCents)+" — add funds", 9)
		}
	}
	if err := bp.SetPremium(ctx, userID, season.ID); err != nil {
		// Refund on persistence failure so the player never loses the debit.
		if season.PremiumCents > 0 {
			_ = store.NewWalletStore(db).Credit(ctx, userID, season.PremiumCents, "battlepass_premium_refund:"+season.ID)
		}
		return "", runtime.NewError(err.Error(), 13)
	}
	out, _ := json.Marshal(map[string]interface{}{
		"ok":         true,
		"premium":    true,
		"paid_cents": season.PremiumCents,
	})
	return string(out), nil
}

// ---------------------------------------------------------------------------
// Referrals
// ---------------------------------------------------------------------------

// ReferralCode returns (minting on first call) the caller's personal invite code.
func ReferralCode(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	userID, err := callerID(ctx)
	if err != nil {
		return "", err
	}
	code, err := store.NewReferralStore(db).EnsureCode(ctx, userID)
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	out, _ := json.Marshal(map[string]interface{}{"code": code})
	return string(out), nil
}

// ReferralApply attributes the caller (a new player) to a referrer's code and
// credits the caller's welcome bonus. One referral per user, no self-referral.
func ReferralApply(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	userID, err := callerID(ctx)
	if err != nil {
		return "", err
	}
	var req struct {
		Code string `json:"code"`
	}
	if err := json.Unmarshal([]byte(payload), &req); err != nil || req.Code == "" {
		return "", runtime.NewError("code required", 3)
	}
	rs := store.NewReferralStore(db)
	referrer, err := rs.ReferrerForCode(ctx, req.Code)
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	if referrer == "" {
		return "", runtime.NewError("invalid referral code", 5)
	}
	if referrer == userID {
		return "", runtime.NewError("you can't refer yourself", 3)
	}
	already, err := rs.WasReferred(ctx, userID)
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	if already {
		return "", runtime.NewError("you've already used a referral code", 9)
	}
	referredReward := missionsReferredRewardCents()
	if _, err := rs.Apply(ctx, referrer, req.Code, userID, missionsReferrerRewardCents(), referredReward); err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	if referredReward > 0 {
		if err := store.NewWalletStore(db).Credit(ctx, userID, referredReward, "referral_welcome"); err != nil {
			logger.Error("referral welcome credit: %v", err)
		}
	}
	out, _ := json.Marshal(map[string]interface{}{
		"ok":           true,
		"reward_cents": referredReward,
		"reward":       dollars(referredReward),
	})
	return string(out), nil
}

// ReferralStatus returns the caller's invite code, their referrals, and pending
// (unclaimed) referrer rewards.
func ReferralStatus(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	userID, err := callerID(ctx)
	if err != nil {
		return "", err
	}
	rs := store.NewReferralStore(db)
	code, err := rs.EnsureCode(ctx, userID)
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	referrals, err := rs.ListReferrals(ctx, userID)
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	var pendingCents, earnedCents int64
	pending := 0
	for _, r := range referrals {
		switch r.Status {
		case "applied":
			pendingCents += r.RewardCents
			pending++
		case "claimed":
			earnedCents += r.RewardCents
		}
	}
	wasReferred, _ := rs.WasReferred(ctx, userID)
	out, _ := json.Marshal(map[string]interface{}{
		"code":              code,
		"referrals":         referrals,
		"total_referrals":   len(referrals),
		"pending_count":     pending,
		"pending_cents":     pendingCents,
		"pending":           dollars(pendingCents),
		"earned_cents":      earnedCents,
		"earned":            dollars(earnedCents),
		"was_referred":      wasReferred,
	})
	return string(out), nil
}

// ReferralClaim credits the referrer for every qualified (applied) referral and
// marks them claimed.
func ReferralClaim(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	userID, err := callerID(ctx)
	if err != nil {
		return "", err
	}
	rs := store.NewReferralStore(db)
	claimed, err := rs.ClaimAll(ctx, userID)
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	var total int64
	ws := store.NewWalletStore(db)
	for _, r := range claimed {
		if r.RewardCents > 0 {
			if err := ws.Credit(ctx, userID, r.RewardCents, "referral_reward:"+r.ID); err != nil {
				logger.Error("referral reward credit: %v", err)
				continue
			}
			total += r.RewardCents
		}
	}
	out, _ := json.Marshal(map[string]interface{}{
		"ok":           true,
		"claimed_count": len(claimed),
		"total_cents":  total,
		"total":        dollars(total),
	})
	return string(out), nil
}
