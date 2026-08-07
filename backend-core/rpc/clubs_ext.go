package rpc

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"strings"
	"sync"
	"time"

	"github.com/heroiclabs/nakama-common/runtime"

	"github.com/smithdouglas404/poker-next-gen/backend-core/billing"
	"github.com/smithdouglas404/poker-next-gen/backend-core/models"
	"github.com/smithdouglas404/poker-next-gen/backend-core/store"
)

// clubsextRequireOwner authorizes the caller as the primary owner (role='owner')
// of a club — a stricter gate than requireClubConfigurer, used for destructive
// actions (delete, ownership transfer). Configuring managers are not sufficient.
func clubsextRequireOwner(ctx context.Context, db *sql.DB, clubID string) (string, error) {
	userID, err := callerID(ctx)
	if err != nil {
		return "", err
	}
	if clubID == "" {
		return "", runtime.NewError("club_id required", 3)
	}
	owners, err := store.NewClubStore(db).ListOwners(ctx, clubID)
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	for _, o := range owners {
		if o.UserID == userID && o.Role == "owner" {
			return userID, nil
		}
	}
	return "", runtime.NewError("forbidden: not the club owner", 7)
}

func clubsextUsername(ctx context.Context) string {
	u, _ := ctx.Value(runtime.RUNTIME_CTX_USERNAME).(string)
	return u
}

// ClubUpdate patches a club's metadata, visibility, branding, and settings.
// Configurer-gated (owner or can_configure operator).
func ClubUpdate(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	var req struct {
		ClubID          string          `json:"club_id"`
		Name            *string         `json:"name"`
		Description     *string         `json:"description"`
		Tag             *string         `json:"tag"`
		IsPublic        *bool           `json:"is_public"`
		RequireApproval *bool           `json:"require_approval"`
		AvatarRef       *string         `json:"avatar_ref"`
		BannerRef       *string         `json:"banner_ref"`
		Settings        json.RawMessage `json:"settings_json"`
		// Preferences the SERVER interprets, so they are real columns rather than
		// settings_json keys: the zone club-night schedules resolve in, the public
		// listing's language label, and whether operators must hold 2FA.
		Timezone        *string `json:"timezone"`
		PrimaryLanguage *string `json:"primary_language"`
		TwoFARequired   *bool   `json:"twofa_required"`
	}
	if err := json.Unmarshal([]byte(payload), &req); err != nil || req.ClubID == "" {
		return "", runtime.NewError("club_id required", 3)
	}
	callerUserID, err := requireClubPermission(ctx, db, req.ClubID, store.PermSettings)
	if err != nil {
		return "", err
	}
	es := store.NewClubExtStore(db)
	if err := es.UpdateExt(ctx, req.ClubID, store.ClubExtPatch{
		Name:            req.Name,
		Description:     req.Description,
		Tag:             req.Tag,
		IsPublic:        req.IsPublic,
		RequireApproval: req.RequireApproval,
		AvatarRef:       req.AvatarRef,
		BannerRef:       req.BannerRef,
		SettingsJSON:    req.Settings,
	}); err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	// Preference columns, when any were sent. Read-modify-write against the
	// current row so a patch that carries only one of the three does not blank
	// the other two.
	if req.Timezone != nil || req.PrimaryLanguage != nil || req.TwoFARequired != nil {
		cs := store.NewClubStore(db)
		cur, cerr := cs.GetByID(ctx, req.ClubID)
		if cerr != nil || cur == nil {
			return "", runtime.NewError("club not found", 5)
		}
		tz, lang, twofa := cur.Timezone, cur.PrimaryLanguage, cur.TwoFARequired
		if req.Timezone != nil {
			// Reject an unloadable zone here rather than silently falling back to
			// UTC at schedule time — a club night firing an hour off is worse than
			// a rejected save.
			if _, lerr := time.LoadLocation(*req.Timezone); lerr != nil {
				return "", runtime.NewError("unknown timezone — use an IANA name such as America/New_York", 3)
			}
			tz = *req.Timezone
		}
		if req.PrimaryLanguage != nil {
			lang = strings.TrimSpace(*req.PrimaryLanguage)
			if lang == "" {
				lang = "en"
			}
		}
		if req.TwoFARequired != nil {
			// An owner who turns this on without 2FA of their own would lock
			// themselves out of their club at the very next operator action.
			if *req.TwoFARequired && !callerHas2FA(ctx, db, callerUserID) {
				return "", runtime.NewError(
					"enable 2FA on your own account before requiring it of this club's operators", 9)
			}
			twofa = *req.TwoFARequired
		}
		if serr := cs.SetClubPreferences(ctx, req.ClubID, tz, lang, twofa); serr != nil {
			return "", runtime.NewError(serr.Error(), 13)
		}
	}
	_ = es.LogActivity(ctx, req.ClubID, callerUserID, "club_update", "settings updated")
	club, err := es.GetExt(ctx, req.ClubID)
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	out, _ := json.Marshal(map[string]interface{}{"club": club})
	return string(out), nil
}

// ClubDelete soft-deletes a club (clears is_active). Owner-only.
func ClubDelete(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	var req struct {
		ClubID string `json:"club_id"`
	}
	if err := json.Unmarshal([]byte(payload), &req); err != nil || req.ClubID == "" {
		return "", runtime.NewError("club_id required", 3)
	}
	ownerID, err := clubsextRequireOwner(ctx, db, req.ClubID)
	if err != nil {
		return "", err
	}

	// Closing a club was a one-line flag flip. It ignored everything the club was
	// holding at the time: members with club chips lost access to them (the club
	// is the only place those chips are spendable or cashable), and players
	// mid-hand had the club closed out from under them.
	//
	// Both are refusals with a number attached, not silent cleanups — the chips
	// are the members' money, and what happens to them is a decision for the
	// operator to make deliberately, the same standard club_leave already holds
	// an individual member to.
	cs := store.NewClubStore(db)
	if seated, serr := cs.OpenSeatCount(ctx, req.ClubID); serr == nil && seated > 0 {
		return "", runtime.NewError(fmt.Sprintf(
			"%d player(s) are still seated at this club's tables — close the tables first", seated), 9)
	}
	if total, holders, cerr := cs.OutstandingChips(ctx, req.ClubID); cerr == nil && total > 0 {
		return "", runtime.NewError(fmt.Sprintf(
			"this club still holds %d.%02d in chips for %d member(s) — settle those balances before closing",
			total/100, total%100, holders), 9)
	}

	if err := store.NewClubExtStore(db).Deactivate(ctx, req.ClubID); err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	_ = store.NewClubExtStore(db).LogActivity(ctx, req.ClubID, ownerID, "club_closed", "club closed by owner")
	return `{"ok":true}`, nil
}

// ClubTransferOwnership hands primary ownership to another member. Owner-only;
// the recipient must already be a member of the club.
func ClubTransferOwnership(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	var req struct {
		ClubID string `json:"club_id"`
		UserID string `json:"user_id"`
	}
	if err := json.Unmarshal([]byte(payload), &req); err != nil || req.ClubID == "" || req.UserID == "" {
		return "", runtime.NewError("club_id and user_id required", 3)
	}
	ownerID, err := clubsextRequireOwner(ctx, db, req.ClubID)
	if err != nil {
		return "", err
	}
	if req.UserID == ownerID {
		return "", runtime.NewError("you already own this club", 9)
	}
	clubStore := store.NewClubStore(db)
	target, err := clubStore.GetMembership(ctx, req.ClubID, req.UserID)
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	if target == nil {
		return "", runtime.NewError("the new owner must be a club member", 9)
	}

	// The licence travels with the owner, not the club. Transfer promotes the
	// recipient and DEMOTES the outgoing owner to manager, and a manager carries
	// no licence — so handing the club to an unqualified member silently revokes
	// its authority to run cash games. Nothing said so; the tables just began
	// refusing sit-downs later, for no reason anyone was shown.
	//
	// A club that is already unlicensed cannot be made worse, so this only blocks
	// a transfer that would DESTROY a licence the club currently has. The way
	// through is stated rather than implied: the recipient qualifies, or a second
	// qualified owner is added first (one qualified owner licenses the club).
	if store.LicenceFor(ctx, db, req.ClubID).CanHostCash &&
		!store.LicenceAfterTransfer(ctx, db, req.ClubID, ownerID, req.UserID).CanHostCash {
		_, missing := store.QualifiesAsLicensee(ctx, db, req.UserID)
		return "", runtime.NewError(
			"this club runs cash games on your licence, and "+missing+
				" — add another qualified owner first, or have them complete it, then transfer", 9)
	}

	es := store.NewClubExtStore(db)
	if err := es.TransferOwnership(ctx, req.ClubID, ownerID, req.UserID, target.Username); err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	_ = es.LogActivity(ctx, req.ClubID, ownerID, "ownership_transfer", "ownership transferred to "+req.UserID)
	return `{"ok":true,"new_owner":"` + req.UserID + `"}`, nil
}

// ClubBrowse returns public, active clubs for discovery (member_count,
// is_public, created_at), with optional tag filter and name search.
func ClubBrowse(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	var req struct {
		Tag    string `json:"tag"`
		Search string `json:"search"`
		Limit  int    `json:"limit"`
		Offset int    `json:"offset"`
	}
	if payload != "" {
		_ = json.Unmarshal([]byte(payload), &req)
	}
	clubs, err := store.NewClubExtStore(db).Browse(ctx, req.Tag, req.Search, req.Limit, req.Offset)
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	out, _ := json.Marshal(map[string]interface{}{"clubs": clubs})
	return string(out), nil
}

// ClubRoster returns a club's members enriched with balance, owner flags, and
// activity counts.
func ClubRoster(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	var req struct {
		ClubID string `json:"club_id"`
	}
	if err := json.Unmarshal([]byte(payload), &req); err != nil || req.ClubID == "" {
		return "", runtime.NewError("club_id required", 3)
	}
	// Every other member's balance/locked_amount/can_configure flag is
	// operator-facing financial data, not something a fellow member (let alone
	// an unauthenticated caller) should be able to pull for any club_id —
	// this had no auth check at all.
	if _, err := requireClubConfigurer(ctx, db, req.ClubID); err != nil {
		return "", err
	}
	roster, err := store.NewClubExtStore(db).Roster(ctx, req.ClubID)
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	out, _ := json.Marshal(map[string]interface{}{"roster": roster})
	return string(out), nil
}

// ClubRankings returns clubs ranked over poker_club_stats by the given metric.
func ClubRankings(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	var req struct {
		Metric string `json:"metric"`
		Limit  int    `json:"limit"`
	}
	if payload != "" {
		_ = json.Unmarshal([]byte(payload), &req)
	}
	rankings, err := store.NewClubExtStore(db).Rankings(ctx, req.Metric, req.Limit)
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	out, _ := json.Marshal(map[string]interface{}{"rankings": rankings})
	return string(out), nil
}

// clubsextInterval maps a report period to a fixed Postgres interval literal
// (never user-supplied SQL). Empty result means all-time.
func clubsextInterval(period string) string {
	switch strings.ToLower(period) {
	case "day", "24h", "today":
		return "1 day"
	case "week", "7d":
		return "7 days"
	case "month", "30d":
		return "30 days"
	case "quarter", "90d":
		return "90 days"
	case "year", "365d":
		return "365 days"
	default:
		return ""
	}
}

// ClubRakeReport aggregates a club's rake ledger over {period} (day|week|month|
// quarter|year|all). Configurer-gated (house-revenue data).
func ClubRakeReport(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	var req struct {
		ClubID string `json:"club_id"`
		Period string `json:"period"`
	}
	if err := json.Unmarshal([]byte(payload), &req); err != nil || req.ClubID == "" {
		return "", runtime.NewError("club_id required", 3)
	}
	if _, err := requireClubPermission(ctx, db, req.ClubID, store.PermMoney); err != nil {
		return "", err
	}
	report, err := store.NewClubExtStore(db).RakeReport(ctx, req.ClubID, clubsextInterval(req.Period))
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	report["period"] = req.Period
	out, _ := json.Marshal(report)
	return string(out), nil
}

// ClubTournamentFees returns the club's real tournament-fee revenue over {period}
// — the entry fee (fee_minor) charged per registration, summed across every
// tournament the club owns, plus the buy-in throughput and a per-tournament
// breakdown. This is the authoritative source for the Revenue Reports
// "Tournament Fees" figure (previously a client-modeled 25%-of-rake guess).
// Configurer-gated (house-revenue data).
func ClubTournamentFees(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	var req struct {
		ClubID string `json:"club_id"`
		Period string `json:"period"`
	}
	if err := json.Unmarshal([]byte(payload), &req); err != nil || req.ClubID == "" {
		return "", runtime.NewError("club_id required", 3)
	}
	if _, err := requireClubConfigurer(ctx, db, req.ClubID); err != nil {
		return "", err
	}
	feeTotal, buyInTotal, entries, breakdown, err := store.NewTournamentExtStore(db).
		ClubTournamentFees(ctx, req.ClubID, clubsextInterval(req.Period))
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	out, _ := json.Marshal(map[string]interface{}{
		"club_id":           req.ClubID,
		"period":            req.Period,
		"fee_total_minor":   feeTotal,
		"buyin_total_minor": buyInTotal,
		"entries":           entries,
		"tournaments":       breakdown,
	})
	return string(out), nil
}

// ClubMemberStats returns the club roster as per-member analytics rows
// (balance, activity count, role). Configurer-gated.
func ClubMemberStats(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	var req struct {
		ClubID string `json:"club_id"`
	}
	if err := json.Unmarshal([]byte(payload), &req); err != nil || req.ClubID == "" {
		return "", runtime.NewError("club_id required", 3)
	}
	if _, err := requireClubConfigurer(ctx, db, req.ClubID); err != nil {
		return "", err
	}
	es := store.NewClubExtStore(db)
	roster, err := es.Roster(ctx, req.ClubID)
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	stats, _ := es.GetClubStats(ctx, req.ClubID)
	out, _ := json.Marshal(map[string]interface{}{"members": roster, "club_stats": stats})
	return string(out), nil
}

// ClubQuickStats returns a club overview: rollup stats, live member count, and
// the recent activity feed.
func ClubQuickStats(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	var req struct {
		ClubID string `json:"club_id"`
	}
	if err := json.Unmarshal([]byte(payload), &req); err != nil || req.ClubID == "" {
		return "", runtime.NewError("club_id required", 3)
	}
	// The activity feed's detail strings include exact chip-allocation amounts
	// and target user ids (see BalanceAllocate) — operator-only, like ClubRoster.
	// This had no auth check at all.
	if _, err := requireClubConfigurer(ctx, db, req.ClubID); err != nil {
		return "", err
	}
	es := store.NewClubExtStore(db)
	stats, err := es.GetClubStats(ctx, req.ClubID)
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	memberCount, _ := store.NewClubStore(db).CountMembers(ctx, req.ClubID)
	activity, _ := es.ListActivity(ctx, req.ClubID, 20)
	out, _ := json.Marshal(map[string]interface{}{
		"stats":        stats,
		"member_count": memberCount,
		"activity":     activity,
	})
	return string(out), nil
}

// ClubAnalyticsSeries returns a real per-day engagement / retention / revenue
// series for a club (active members, event volume, new-vs-returning, running
// member total, and rake per day) over the trailing window. Backs the Member
// Analytics charts and the Club Overview sparklines with stored data — no demo.
// Configurer-gated (owner analytics).
func ClubAnalyticsSeries(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	var req struct {
		ClubID string `json:"club_id"`
		Days   int    `json:"days"`
	}
	if err := json.Unmarshal([]byte(payload), &req); err != nil || req.ClubID == "" {
		return "", runtime.NewError("club_id required", 3)
	}
	if _, err := requireClubConfigurer(ctx, db, req.ClubID); err != nil {
		return "", err
	}
	if req.Days <= 0 {
		req.Days = 30
	}
	series, newTotal, retTotal, err := store.NewClubExtStore(db).AnalyticsSeries(ctx, req.ClubID, req.Days)
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	out, _ := json.Marshal(map[string]interface{}{
		"club_id":         req.ClubID,
		"days":            len(series),
		"series":          series,
		"new_total":       newTotal,
		"returning_total": retTotal,
	})
	return string(out), nil
}

// ClubInvite creates an invitation (club → user). Configurer-gated.
func ClubInvite(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	var req struct {
		ClubID           string `json:"club_id"`
		UserID           string `json:"user_id"`
		Username         string `json:"username"`
		Role             string `json:"role"`
		CreditLimitCents int64  `json:"credit_limit_cents"`
		Message          string `json:"message"`
		// ExpiresInDays bounds how long the invite stays acceptable. Omitted =>
		// the default window; explicit 0 => never expires, for the rare standing
		// invitation an operator genuinely wants open-ended.
		ExpiresInDays *int `json:"expires_in_days"`
	}
	if err := json.Unmarshal([]byte(payload), &req); err != nil || req.ClubID == "" || req.UserID == "" {
		return "", runtime.NewError("club_id and user_id required", 3)
	}
	inviter, err := requireClubPermission(ctx, db, req.ClubID, store.PermMembers)
	if err != nil {
		return "", err
	}
	if req.Role == "" {
		req.Role = "member"
	}
	if req.CreditLimitCents < 0 {
		return "", runtime.NewError("credit limit cannot be negative", 3)
	}
	// An invitation carries a credit line that is allocated the moment it is
	// accepted, so an invite that never expires is a standing grant against the
	// club's balance. Default to a bounded window.
	days := defaultInviteExpiryDays
	if req.ExpiresInDays != nil {
		days = *req.ExpiresInDays
	}
	if days < 0 || days > maxInviteExpiryDays {
		return "", runtime.NewError(
			fmt.Sprintf("invite expiry must be between 0 (never) and %d days", maxInviteExpiryDays), 3)
	}
	var expiresAt *time.Time
	if days > 0 {
		t := time.Now().UTC().AddDate(0, 0, days)
		expiresAt = &t
	}
	es := store.NewClubExtStore(db)
	id, err := es.CreateInvitation(ctx, &store.ClubInvitation{
		ClubID:           req.ClubID,
		UserID:           req.UserID,
		Username:         req.Username,
		Inviter:          inviter,
		Type:             "invite",
		Role:             req.Role,
		CreditLimitCents: req.CreditLimitCents,
		Message:          req.Message,
		ExpiresAt:        expiresAt,
	})
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	_ = es.LogActivity(ctx, req.ClubID, inviter, "invite", "invited "+req.UserID)

	// Tell the invited player. Without this the invite was write-only: a row in
	// poker_club_invitation that the recipient had no way to learn about, while
	// the operator's composer showed them a "Welcome Card" preview of something
	// nobody would ever receive. The card is what the invitee now actually gets.
	//
	// Best-effort: a failed notification must not roll back an invitation that is
	// already stored and acceptable — the invitee can still find it in their
	// invitations list.
	clubName := req.ClubID
	if c, cerr := store.NewClubStore(db).GetByID(ctx, req.ClubID); cerr == nil && c != nil && c.Name != "" {
		clubName = c.Name
	}
	content := map[string]interface{}{
		"kind":               "club_invite",
		"invitation_id":      id,
		"club_id":            req.ClubID,
		"club_name":          clubName,
		"role":               req.Role,
		"credit_limit_cents": req.CreditLimitCents,
		"message":            req.Message,
	}
	if expiresAt != nil {
		content["expires_at"] = expiresAt.Format(time.RFC3339)
	}
	if nerr := nk.NotificationsSend(ctx, []*runtime.NotificationSend{{
		UserID:     req.UserID,
		Subject:    "You're invited to " + clubName,
		Content:    content,
		Code:       clubInviteCode,
		Persistent: true,
	}}); nerr != nil {
		logger.Warn("club invite stored but notification failed: %v", nerr)
	}

	out, _ := json.Marshal(map[string]interface{}{
		"ok": true, "invitation_id": id, "expires_at": expiresAt,
	})
	return string(out), nil
}

// Invitation expiry bounds. The default is deliberately short: an accepted
// invite immediately allocates its credit line against the club, so a pending
// one is an outstanding commitment, not just a message.
const (
	defaultInviteExpiryDays = 14
	maxInviteExpiryDays     = 365
)

// ClubInviteRevoke cancels a pending club-issued invitation. Configurer-gated —
// only an operator who can configure the club may pull back an invite it sent.
// Requests (user→club) are resolved via ClubRequestReview, not here.
func ClubInviteRevoke(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	var req struct {
		InvitationID string `json:"invitation_id"`
	}
	if err := json.Unmarshal([]byte(payload), &req); err != nil || req.InvitationID == "" {
		return "", runtime.NewError("invitation_id required", 3)
	}
	es := store.NewClubExtStore(db)
	inv, err := es.GetInvitation(ctx, req.InvitationID)
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	if inv == nil {
		return "", runtime.NewError("invitation not found", 5)
	}
	if inv.Type != "invite" {
		return "", runtime.NewError("not an invitation", 3)
	}
	caller, err := requireClubPermission(ctx, db, inv.ClubID, store.PermMembers)
	if err != nil {
		return "", err
	}
	if inv.Status != "pending" {
		return "", runtime.NewError("invitation already resolved", 9)
	}
	if err := es.SetInvitationStatus(ctx, inv.ID, "revoked", caller); err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	_ = es.LogActivity(ctx, inv.ClubID, caller, "invite_revoke", "revoked invite to "+inv.UserID)
	return `{"ok":true}`, nil
}

// ClubJoinRequest creates a join-request (user → club) from the caller.
func ClubJoinRequest(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	userID, err := callerID(ctx)
	if err != nil {
		return "", err
	}
	var req struct {
		ClubID  string `json:"club_id"`
		Message string `json:"message"`
	}
	if err := json.Unmarshal([]byte(payload), &req); err != nil || req.ClubID == "" {
		return "", runtime.NewError("club_id required", 3)
	}
	clubStore := store.NewClubStore(db)
	club, err := clubStore.GetByID(ctx, req.ClubID)
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	if club == nil {
		return "", runtime.NewError("club not found", 5)
	}
	if m, _ := clubStore.GetMembership(ctx, req.ClubID, userID); m != nil {
		return "", runtime.NewError("you are already a member of this club", 9)
	}
	es := store.NewClubExtStore(db)
	id, err := es.CreateInvitation(ctx, &store.ClubInvitation{
		ClubID:   req.ClubID,
		UserID:   userID,
		Username: clubsextUsername(ctx),
		Inviter:  userID,
		Type:     "request",
		Role:     "member",
		Message:  req.Message,
	})
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	return `{"ok":true,"request_id":"` + id + `"}`, nil
}

// ClubRequestsList lists a club's pending join-requests. Configurer-gated.
func ClubRequestsList(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	var req struct {
		ClubID string `json:"club_id"`
		Status string `json:"status"`
	}
	if err := json.Unmarshal([]byte(payload), &req); err != nil || req.ClubID == "" {
		return "", runtime.NewError("club_id required", 3)
	}
	if _, err := requireClubConfigurer(ctx, db, req.ClubID); err != nil {
		return "", err
	}
	if req.Status == "" {
		req.Status = "pending"
	}
	reqs, err := store.NewClubExtStore(db).ListInvitationsForClub(ctx, req.ClubID, "request", req.Status)
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	out, _ := json.Marshal(map[string]interface{}{"requests": reqs})
	return string(out), nil
}

// ClubRequestReview resolves an invitation or join-request. A configurer
// approves/denies a join-request; the invited user accepts/declines an invite.
// On approval/acceptance the target is added to the roster.
func ClubRequestReview(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	callerUserID, err := callerID(ctx)
	if err != nil {
		return "", err
	}
	var req struct {
		InvitationID string `json:"invitation_id"`
		Action       string `json:"action"` // approve | deny | accept | decline
	}
	if err := json.Unmarshal([]byte(payload), &req); err != nil || req.InvitationID == "" {
		return "", runtime.NewError("invitation_id required", 3)
	}
	es := store.NewClubExtStore(db)
	inv, err := es.GetInvitation(ctx, req.InvitationID)
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	if inv == nil {
		return "", runtime.NewError("invitation not found", 5)
	}
	if inv.Status != "pending" {
		return "", runtime.NewError("invitation already resolved", 9)
	}

	// Authorize + normalize the action per invitation type.
	var approve bool
	var finalStatus string
	switch inv.Type {
	case "request":
		// Club-side review: caller must be a configurer of the club.
		if _, err := requireClubPermission(ctx, db, inv.ClubID, store.PermMembers); err != nil {
			return "", err
		}
		switch req.Action {
		case "approve":
			approve, finalStatus = true, "approved"
		case "deny", "decline":
			approve, finalStatus = false, "denied"
		default:
			return "", runtime.NewError("action must be approve or deny", 3)
		}
	case "invite":
		// Invitee-side decision: caller must be the invited user.
		if callerUserID != inv.UserID {
			return "", runtime.NewError("forbidden: not your invitation", 7)
		}
		// Expiry is enforced here rather than only being displayed, because
		// accepting is what allocates the invitation's credit line against the
		// club. A stale invite must not still be able to draw on it.
		if inv.Expired(time.Now().UTC()) {
			_ = es.SetInvitationStatus(ctx, inv.ID, "expired", callerUserID)
			return "", runtime.NewError("this invitation has expired — ask the club to send a new one", 9)
		}
		switch req.Action {
		case "accept", "approve":
			approve, finalStatus = true, "accepted"
		case "decline", "deny":
			approve, finalStatus = false, "declined"
		default:
			return "", runtime.NewError("action must be accept or decline", 3)
		}
	default:
		return "", runtime.NewError("unknown invitation type", 13)
	}

	if approve {
		username := inv.Username
		if inv.Type == "invite" && callerUserID == inv.UserID {
			if u := clubsextUsername(ctx); u != "" {
				username = u
			}
		}
		// The club's member cap, from the OWNER's plan. ClubJoin enforced this and
		// this path did not, so invitations were the way around a limit the owner
		// is paying for — and it is the operator's own path, so it is the one that
		// would actually get used. An existing member re-accepting is not a new
		// seat and must not be blocked by a full club.
		cs := store.NewClubStore(db)
		if existing, _ := cs.GetMembership(ctx, inv.ClubID, inv.UserID); existing == nil {
			cap := billing.ClubMemberCap(clubOwnerTier(ctx, db, inv.ClubID))
			count, cerr := cs.CountMembers(ctx, inv.ClubID)
			if cerr != nil {
				return "", runtime.NewError(cerr.Error(), 13)
			}
			if int64(count) >= cap {
				return "", runtime.NewError(
					"this club has reached its member limit — the owner needs to upgrade their plan", 9)
			}
		}
		if err := cs.AddMember(ctx, inv.ClubID, inv.UserID, username, inv.Role); err != nil {
			return "", runtime.NewError(err.Error(), 13)
		}
		if inv.CreditLimitCents > 0 {
			// Seed the member's club-allocated balance with the granted credit line.
			_ = store.NewClubStore(db).AllocateBalance(ctx, &models.PlayerAllocatedBalance{
				ClubID: inv.ClubID, UserID: inv.UserID, Balance: inv.CreditLimitCents, Currency: "USD",
			}, "invitation "+inv.ID+" accepted")
		}
		_ = es.LogActivity(ctx, inv.ClubID, callerUserID, "member_join", inv.UserID+" joined")
	}
	if err := es.SetInvitationStatus(ctx, inv.ID, finalStatus, callerUserID); err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	return `{"ok":true,"status":"` + finalStatus + `"}`, nil
}

// ClubInvitationsList lists the caller's pending invitations (club → user).
func ClubInvitationsList(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	userID, err := callerID(ctx)
	if err != nil {
		return "", err
	}
	var req struct {
		Status string `json:"status"`
	}
	if payload != "" {
		_ = json.Unmarshal([]byte(payload), &req)
	}
	if req.Status == "" {
		req.Status = "pending"
	}
	invs, err := store.NewClubExtStore(db).ListInvitationsForUser(ctx, userID, "invite", req.Status)
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	// Resolve club names. The row carries only club_id, and an invitation that
	// greets its recipient by UUID is not an invitation. Cached per club so a
	// player invited to the same club twice costs one lookup.
	cs := store.NewClubStore(db)
	names := map[string]string{}
	for i := range invs {
		id := invs[i].ClubID
		if _, seen := names[id]; !seen {
			if c, cerr := cs.GetByID(ctx, id); cerr == nil && c != nil {
				names[id] = c.Name
			} else {
				names[id] = ""
			}
		}
		invs[i].ClubName = names[id]
	}
	out, _ := json.Marshal(map[string]interface{}{"invitations": invs})
	return string(out), nil
}

// ClubAnnouncementList returns a club's announcements, newest first.
func ClubAnnouncementList(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	var req struct {
		ClubID string `json:"club_id"`
		Limit  int    `json:"limit"`
	}
	if err := json.Unmarshal([]byte(payload), &req); err != nil || req.ClubID == "" {
		return "", runtime.NewError("club_id required", 3)
	}
	// This used to be completely ungated — any authenticated account could read
	// any club's announcement history, including private-table and tournament
	// notices it was never targeted with. Membership (or an operator seat) now
	// required, matching the rest of the club reads.
	if err := requireClubReader(ctx, db, req.ClubID); err != nil {
		return "", err
	}
	anns, err := store.NewClubExtStore(db).ListAnnouncements(ctx, req.ClubID, req.Limit)
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	out, _ := json.Marshal(map[string]interface{}{"announcements": anns})
	return string(out), nil
}

// ClubAnnouncementCreate posts a club announcement. Configurer-gated.
func ClubAnnouncementCreate(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	var req struct {
		ClubID   string `json:"club_id"`
		Title    string `json:"title"`
		Body     string `json:"body"`
		Severity string `json:"severity"`
		Audience string `json:"audience"`
		Channel  string `json:"channel"`
	}
	if err := json.Unmarshal([]byte(payload), &req); err != nil || req.ClubID == "" || req.Title == "" {
		return "", runtime.NewError("club_id and title required", 3)
	}
	author, err := requireClubPermission(ctx, db, req.ClubID, store.PermMembers)
	if err != nil {
		return "", err
	}
	// Whitelist the targeting params so a bad value can't be stored.
	audience := announceAudience(req.Audience)
	channel := announceChannel(req.Channel)
	severity := announceSeverity(req.Severity)

	// Rate limit, per club. This now fans out to every member of a club rather
	// than writing a row nobody reads, so it inherits the reasoning already
	// applied to platform broadcasts (see aiproc.go): a compromised or careless
	// operator account must not be able to spam a whole membership.
	if wait, ok := clubAnnounceAllowed(req.ClubID); !ok {
		return "", runtime.NewError(
			fmt.Sprintf("you just broadcast to this club — wait %d seconds before sending another", wait), 9)
	}

	es := store.NewClubExtStore(db)
	id, err := es.CreateAnnouncement(ctx, &store.ClubAnnouncement{
		ClubID: req.ClubID, Title: req.Title, Body: req.Body, Severity: severity,
		Audience: audience, Channel: channel, CreatedBy: author,
	})
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	_ = es.LogActivity(ctx, req.ClubID, author, "announcement", req.Title)

	// DELIVERY. Everything above this line is what the RPC used to be: one row
	// and one activity-log entry. "Broadcast Now" broadcast to nobody, and the
	// delivery-style chips were an inert tag. The announcement is now actually
	// sent to the audience it was addressed to.
	delivered := 0
	if recipients, rerr := es.AnnouncementRecipients(ctx, req.ClubID, audience); rerr == nil && len(recipients) > 0 {
		clubName := req.ClubID
		if c, cerr := store.NewClubStore(db).GetByID(ctx, req.ClubID); cerr == nil && c != nil {
			clubName = c.Name
		}
		content := map[string]interface{}{
			"kind":      "club_announcement",
			"id":        id,
			"club_id":   req.ClubID,
			"club_name": clubName,
			"body":      req.Body,
			"severity":  severity,
			"channel":   channel,
			"audience":  audience,
		}
		sends := make([]*runtime.NotificationSend, 0, len(recipients))
		for _, uid := range recipients {
			sends = append(sends, &runtime.NotificationSend{
				UserID:     uid,
				Subject:    req.Title,
				Content:    content,
				Code:       clubAnnouncementCode,
				Persistent: true,
			})
		}
		// Best-effort: the announcement is already stored, so a delivery failure
		// must not make the operator think nothing was posted. It is logged and
		// reflected in the response count instead.
		if serr := nk.NotificationsSend(ctx, sends); serr != nil {
			logger.Warn("club announcement %s stored but delivery failed: %v", id, serr)
		} else {
			delivered = len(sends)
		}
	}

	out, _ := json.Marshal(map[string]interface{}{
		"ok": true, "id": id, "audience": audience, "channel": channel,
		"severity": severity, "delivered": delivered,
	})
	return string(out), nil
}

// clubAnnouncementCode is the Nakama notification code for a club broadcast.
// 555 is already taken by the platform-wide announcement (aiproc.go), so clients
// can tell the two apart by code alone.
const clubAnnouncementCode = 556

// clubInviteCode is the notification code for a club invitation. Distinct from
// the broadcast code because the client renders it differently: an invitation is
// actionable (accept / decline) where an announcement is only read.
const clubInviteCode = 557

// Per-club broadcast cooldown — see the rationale at the call site.
const clubAnnounceCooldown = 20 * time.Second

var (
	clubAnnounceMu   sync.Mutex
	clubAnnounceLast = map[string]time.Time{}
)

// clubAnnounceAllowed reports whether this club may broadcast now, and if not,
// how many seconds remain.
func clubAnnounceAllowed(clubID string) (int, bool) {
	clubAnnounceMu.Lock()
	defer clubAnnounceMu.Unlock()
	now := time.Now()
	if last, ok := clubAnnounceLast[clubID]; ok {
		if elapsed := now.Sub(last); elapsed < clubAnnounceCooldown {
			remaining := int((clubAnnounceCooldown - elapsed).Seconds()) + 1
			return remaining, false
		}
	}
	clubAnnounceLast[clubID] = now
	return 0, true
}

// announceSeverity clamps severity to what the clients actually render. It was
// an unvalidated passthrough, which is how "high" (written by the in-table
// composer) ended up stored — a value no severity switch recognises, so it
// silently rendered as the default.
func announceSeverity(v string) string {
	switch v {
	case "warning", "critical":
		return v
	default:
		return "info"
	}
}

// announceAudience clamps the target-audience param to a known value.
func announceAudience(v string) string {
	switch v {
	case "private", "tournament":
		return v
	default:
		return "all"
	}
}

// announceChannel clamps the delivery-channel param to a known value.
func announceChannel(v string) string {
	switch v {
	case "modal", "chat":
		return v
	default:
		return "overlay"
	}
}

// ClubEventList returns a club's scheduled events (soonest first).
func ClubEventList(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	var req struct {
		ClubID string `json:"club_id"`
		Limit  int    `json:"limit"`
	}
	if err := json.Unmarshal([]byte(payload), &req); err != nil || req.ClubID == "" {
		return "", runtime.NewError("club_id required", 3)
	}
	events, err := store.NewClubExtStore(db).ListEvents(ctx, req.ClubID, req.Limit)
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	out, _ := json.Marshal(map[string]interface{}{"events": events})
	return string(out), nil
}

// ClubEventCreate schedules a club event. Configurer-gated.
func ClubEventCreate(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	var req store.ClubEvent
	if err := json.Unmarshal([]byte(payload), &req); err != nil || req.ClubID == "" || req.Name == "" {
		return "", runtime.NewError("club_id and name required", 3)
	}
	author, err := requireClubConfigurer(ctx, db, req.ClubID)
	if err != nil {
		return "", err
	}
	req.CreatedBy = author
	es := store.NewClubExtStore(db)
	id, err := es.CreateEvent(ctx, &req)
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	_ = es.LogActivity(ctx, req.ClubID, author, "event", req.Name)
	out, _ := json.Marshal(map[string]interface{}{"ok": true, "id": id, "event": req})
	return string(out), nil
}

// ClubChatSend is RETIRED. It refuses, loudly, and says what to do instead.
//
// Club chat moved to a Nakama channel. This RPC still writes to
// poker_club_chat, which NO live surface reads any more — so a caller that kept
// using it would appear to succeed, the row would land in the database, and the
// message would reach nobody. A write that silently goes nowhere is worse than
// an error, because nothing about it looks wrong.
//
// It stays REGISTERED rather than being deleted from main.go on purpose: an
// unregistered id returns a generic "RPC function not found", which tells a
// caller nothing about where the messages went. This says it.
//
// The caller is logged at WARN with its user id, so a straggler shows up in the
// server log rather than only in whatever client swallowed the error.
//
// Reading is unaffected — ClubChatList below still serves the pre-move history,
// which is exactly why poker_club_chat is still populated and still read.
func ClubChatSend(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	userID, _ := callerID(ctx)
	logger.WithField("user_id", userID).
		Warn("club_chat_send called after retirement — caller must post to the club's Nakama channel")
	// 12 = UNIMPLEMENTED: the endpoint is gone, not the argument wrong.
	return "", runtime.NewError(
		"club_chat_send is retired: club chat is a Nakama channel now. Join the club's "+
			"channel and use writeChatMessage (see frontend-table/src/features/chat/clubChannel.ts). "+
			"Writes here reach nobody.", 12)
}

// ClubChatList returns a club's recent chat. Members only.
//
// STILL LIVE, and deliberately so. Everything written before the move to Nakama
// channels lives in poker_club_chat and only there; clubChannel.ts reads this
// once per join and merges it with the channel's own history, so a club's
// existing conversation does not vanish on cutover. Read-only from here on —
// its companion ClubChatSend is retired above.
func ClubChatList(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	userID, err := callerID(ctx)
	if err != nil {
		return "", err
	}
	var req struct {
		ClubID string `json:"club_id"`
		Limit  int    `json:"limit"`
	}
	if err := json.Unmarshal([]byte(payload), &req); err != nil || req.ClubID == "" {
		return "", runtime.NewError("club_id required", 3)
	}
	m, err := store.NewClubStore(db).GetMembership(ctx, req.ClubID, userID)
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	if m == nil {
		return "", runtime.NewError("only club members can read club chat", 7)
	}
	msgs, err := store.NewClubExtStore(db).ListChat(ctx, req.ClubID, req.Limit)
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	out, _ := json.Marshal(map[string]interface{}{"messages": msgs})
	return string(out), nil
}
