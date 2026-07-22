package rpc

import (
	"context"
	"database/sql"
	"encoding/json"
	"strings"

	"github.com/heroiclabs/nakama-common/runtime"

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
	}
	if err := json.Unmarshal([]byte(payload), &req); err != nil || req.ClubID == "" {
		return "", runtime.NewError("club_id required", 3)
	}
	callerUserID, err := requireClubConfigurer(ctx, db, req.ClubID)
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
	if _, err := clubsextRequireOwner(ctx, db, req.ClubID); err != nil {
		return "", err
	}
	if err := store.NewClubExtStore(db).Deactivate(ctx, req.ClubID); err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
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
	if _, err := requireClubConfigurer(ctx, db, req.ClubID); err != nil {
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

// ClubInvite creates an invitation (club → user). Configurer-gated.
func ClubInvite(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	var req struct {
		ClubID           string `json:"club_id"`
		UserID           string `json:"user_id"`
		Username         string `json:"username"`
		Role             string `json:"role"`
		CreditLimitCents int64  `json:"credit_limit_cents"`
		Message          string `json:"message"`
	}
	if err := json.Unmarshal([]byte(payload), &req); err != nil || req.ClubID == "" || req.UserID == "" {
		return "", runtime.NewError("club_id and user_id required", 3)
	}
	inviter, err := requireClubConfigurer(ctx, db, req.ClubID)
	if err != nil {
		return "", err
	}
	if req.Role == "" {
		req.Role = "member"
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
	})
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	_ = es.LogActivity(ctx, req.ClubID, inviter, "invite", "invited "+req.UserID)
	return `{"ok":true,"invitation_id":"` + id + `"}`, nil
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
		if _, err := requireClubConfigurer(ctx, db, inv.ClubID); err != nil {
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
		if err := store.NewClubStore(db).AddMember(ctx, inv.ClubID, inv.UserID, username, inv.Role); err != nil {
			return "", runtime.NewError(err.Error(), 13)
		}
		if inv.CreditLimitCents > 0 {
			// Seed the member's club-allocated balance with the granted credit line.
			_ = store.NewClubStore(db).AllocateBalance(ctx, &models.PlayerAllocatedBalance{
				ClubID: inv.ClubID, UserID: inv.UserID, Balance: inv.CreditLimitCents, Currency: "USD",
			})
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
	}
	if err := json.Unmarshal([]byte(payload), &req); err != nil || req.ClubID == "" || req.Title == "" {
		return "", runtime.NewError("club_id and title required", 3)
	}
	author, err := requireClubConfigurer(ctx, db, req.ClubID)
	if err != nil {
		return "", err
	}
	es := store.NewClubExtStore(db)
	id, err := es.CreateAnnouncement(ctx, &store.ClubAnnouncement{
		ClubID: req.ClubID, Title: req.Title, Body: req.Body, Severity: req.Severity, CreatedBy: author,
	})
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	_ = es.LogActivity(ctx, req.ClubID, author, "announcement", req.Title)
	return `{"ok":true,"id":"` + id + `"}`, nil
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

// ClubChatSend appends a message to a club's chat. Members only.
func ClubChatSend(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	userID, err := callerID(ctx)
	if err != nil {
		return "", err
	}
	var req struct {
		ClubID string `json:"club_id"`
		Text   string `json:"text"`
	}
	if err := json.Unmarshal([]byte(payload), &req); err != nil || req.ClubID == "" || strings.TrimSpace(req.Text) == "" {
		return "", runtime.NewError("club_id and text required", 3)
	}
	m, err := store.NewClubStore(db).GetMembership(ctx, req.ClubID, userID)
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	if m == nil {
		return "", runtime.NewError("only club members can post to club chat", 7)
	}
	id, err := store.NewClubExtStore(db).SendChat(ctx, &store.ClubChatMessage{
		ClubID: req.ClubID, UserID: userID, Username: m.Username, Text: req.Text,
	})
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	return `{"ok":true,"id":"` + id + `"}`, nil
}

// ClubChatList returns a club's recent chat. Members only.
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
