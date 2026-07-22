package rpc

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"os"
	"strings"
	"time"

	"github.com/heroiclabs/nakama-common/runtime"

	"github.com/smithdouglas404/poker-next-gen/backend-core/antibot"
	"github.com/smithdouglas404/poker-next-gen/backend-core/poker/enginemath"
	"github.com/smithdouglas404/poker-next-gen/backend-core/store"
)

// aiprocRequireAdmin returns the caller id only if they are a platform admin
// (ADMIN_USER_IDS), mirroring the gate used by kyc_verify_admin /
// withdrawal_approve_admin.
func aiprocRequireAdmin(ctx context.Context) (string, error) {
	userID, _ := ctx.Value(runtime.RUNTIME_CTX_USER_ID).(string)
	if !isAdmin(userID) {
		return "", runtime.NewError("forbidden", 7)
	}
	return userID, nil
}

// =========================================================================
// Anti-bot (admin)
// =========================================================================

// AntibotScanAll evaluates any submitted action batches, persists the scores,
// and returns every stored bot-likelihood score (highest risk first). Admin
// only. Supplying {"batches":[{user_id,actions:[...]}]} scores + upserts those
// users before returning the full ranked list.
func AntibotScanAll(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	if _, err := aiprocRequireAdmin(ctx); err != nil {
		return "", err
	}
	var req struct {
		Batches []antibot.ScoreRequest `json:"batches"`
		Limit   int                    `json:"limit"`
	}
	if payload != "" {
		_ = json.Unmarshal([]byte(payload), &req)
	}
	as := store.NewAiprocStore(db)
	scanned := 0
	for _, b := range req.Batches {
		if b.UserID == "" {
			continue
		}
		res := antibot.AnalyzeBettingPatterns(b)
		if err := as.UpsertAntibotScore(ctx, res.UserID, res.Score, res.Risk, res.Flags, res.SampleSize); err != nil {
			return "", runtime.NewError(err.Error(), 13)
		}
		scanned++
	}
	scores, err := as.ListAntibotScores(ctx, false, req.Limit)
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	out, _ := json.Marshal(map[string]interface{}{"scanned": scanned, "scores": scores})
	return string(out), nil
}

// AntibotFlagsList returns the persisted scores above the "low" risk band — the
// review queue of suspected bots. Admin only.
func AntibotFlagsList(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	if _, err := aiprocRequireAdmin(ctx); err != nil {
		return "", err
	}
	var req struct {
		Limit int `json:"limit"`
	}
	if payload != "" {
		_ = json.Unmarshal([]byte(payload), &req)
	}
	scores, err := store.NewAiprocStore(db).ListAntibotScores(ctx, true, req.Limit)
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	out, _ := json.Marshal(map[string]interface{}{"flagged": scores})
	return string(out), nil
}

// AntibotBan flags a user as a banned bot with a reason. Admin only.
func AntibotBan(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	adminID, err := aiprocRequireAdmin(ctx)
	if err != nil {
		return "", err
	}
	var req struct {
		UserID string `json:"user_id"`
		Reason string `json:"reason"`
	}
	if err := json.Unmarshal([]byte(payload), &req); err != nil || req.UserID == "" {
		return "", runtime.NewError("user_id required", 3)
	}
	reason := strings.TrimSpace(req.Reason)
	if reason == "" {
		reason = "bot activity"
	}
	if err := store.NewAiprocStore(db).BanAntibotUser(ctx, req.UserID, reason); err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	logger.Info("antibot ban user=%s by=%s reason=%s", req.UserID, adminID, reason)
	return `{"ok":true}`, nil
}

// =========================================================================
// Collusion review (admin)
// =========================================================================

// CollusionList returns queued collusion flags, optionally filtered by ?status.
// Admin only.
func CollusionList(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	if _, err := aiprocRequireAdmin(ctx); err != nil {
		return "", err
	}
	var req struct {
		Status string `json:"status"`
		Limit  int    `json:"limit"`
	}
	if payload != "" {
		_ = json.Unmarshal([]byte(payload), &req)
	}
	flags, err := store.NewAiprocStore(db).ListCollusion(ctx, req.Status, req.Limit)
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	out, _ := json.Marshal(map[string]interface{}{"flags": flags})
	return string(out), nil
}

// CollusionFlagReview resolves a collusion flag (status confirmed|dismissed)
// with an optional note. Admin only.
func CollusionFlagReview(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	adminID, err := aiprocRequireAdmin(ctx)
	if err != nil {
		return "", err
	}
	var req struct {
		FlagID string `json:"flag_id"`
		Status string `json:"status"`
		Note   string `json:"note"`
	}
	if err := json.Unmarshal([]byte(payload), &req); err != nil || req.FlagID == "" {
		return "", runtime.NewError("flag_id required", 3)
	}
	if req.Status != "confirmed" && req.Status != "dismissed" {
		return "", runtime.NewError("status must be confirmed or dismissed", 3)
	}
	if err := store.NewAiprocStore(db).ReviewCollusion(ctx, req.FlagID, adminID, req.Status, req.Note); err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	return `{"ok":true}`, nil
}

// =========================================================================
// Announcements
// =========================================================================

// AnnouncementCreate publishes a platform MOTD / breaking-news banner and pushes
// a Nakama notification to all sessions. Admin only.
func AnnouncementCreate(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	adminID, err := aiprocRequireAdmin(ctx)
	if err != nil {
		return "", err
	}
	var req struct {
		Title      string `json:"title"`
		Body       string `json:"body"`
		Severity   string `json:"severity"`
		Audience   string `json:"audience"`
		StartsAt   string `json:"starts_at"`
		EndsAt     string `json:"ends_at"`
		DurationHr int    `json:"duration_hours"`
	}
	if err := json.Unmarshal([]byte(payload), &req); err != nil {
		return "", runtime.NewError("invalid payload", 3)
	}
	req.Title = strings.TrimSpace(req.Title)
	if req.Title == "" {
		return "", runtime.NewError("title required", 3)
	}
	ann := &store.AiprocAnnouncement{
		Title:     req.Title,
		Body:      req.Body,
		Severity:  req.Severity,
		Audience:  req.Audience,
		CreatedBy: adminID,
	}
	if t, ok := aiprocParseTime(req.StartsAt); ok {
		ann.StartsAt = t
	}
	if t, ok := aiprocParseTime(req.EndsAt); ok {
		ann.EndsAt = sql.NullTime{Time: t, Valid: true}
	} else if req.DurationHr > 0 {
		base := ann.StartsAt
		if base.IsZero() {
			base = time.Now().UTC()
		}
		ann.EndsAt = sql.NullTime{Time: base.Add(time.Duration(req.DurationHr) * time.Hour), Valid: true}
	}
	id, err := store.NewAiprocStore(db).CreateAnnouncement(ctx, ann)
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	// Best-effort broadcast so open clients pop the breaking-news modal.
	_ = nk.NotificationSendAll(ctx, req.Title, map[string]interface{}{
		"kind":     "announcement",
		"id":       id,
		"body":     req.Body,
		"severity": ann.Severity,
	}, 555, false)
	out, _ := json.Marshal(map[string]interface{}{"id": id})
	return string(out), nil
}

// AnnouncementDelete removes a MOTD by id. Admin only.
func AnnouncementDelete(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	if _, err := aiprocRequireAdmin(ctx); err != nil {
		return "", err
	}
	var req struct {
		ID string `json:"id"`
	}
	if err := json.Unmarshal([]byte(payload), &req); err != nil || req.ID == "" {
		return "", runtime.NewError("id required", 3)
	}
	if err := store.NewAiprocStore(db).DeleteAnnouncement(ctx, req.ID); err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	return `{"ok":true}`, nil
}

// AnnouncementList returns the active announcements for the caller. Members see
// audience "all" + "members"; admins can pass {"all":true} for the full
// management list including scheduled/expired rows.
func AnnouncementList(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	userID, err := callerID(ctx)
	if err != nil {
		return "", err
	}
	var req struct {
		All bool `json:"all"`
	}
	if payload != "" {
		_ = json.Unmarshal([]byte(payload), &req)
	}
	audience := "members"
	includeAll := false
	if req.All && isAdmin(userID) {
		includeAll = true
	}
	items, err := store.NewAiprocStore(db).ListAnnouncements(ctx, audience, includeAll)
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	out, _ := json.Marshal(map[string]interface{}{"announcements": items})
	return string(out), nil
}

// =========================================================================
// Support tickets
// =========================================================================

// SupportTicketCreate opens a support ticket for the caller, seeded with their
// first message.
func SupportTicketCreate(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	userID, err := callerID(ctx)
	if err != nil {
		return "", err
	}
	var req struct {
		Subject  string `json:"subject"`
		Body     string `json:"body"`
		Category string `json:"category"`
		Priority string `json:"priority"`
		Email    string `json:"email"`
	}
	if err := json.Unmarshal([]byte(payload), &req); err != nil {
		return "", runtime.NewError("invalid payload", 3)
	}
	req.Subject = strings.TrimSpace(req.Subject)
	req.Body = strings.TrimSpace(req.Body)
	if req.Subject == "" || req.Body == "" {
		return "", runtime.NewError("subject and body required", 3)
	}
	t := &store.AiprocSupportTicket{
		UserID:   userID,
		Email:    strings.TrimSpace(req.Email),
		Subject:  req.Subject,
		Category: req.Category,
		Priority: req.Priority,
		Messages: []store.AiprocTicketMessage{{
			Author: userID,
			Role:   "user",
			Body:   req.Body,
			At:     time.Now().UTC(),
		}},
	}
	id, err := store.NewAiprocStore(db).CreateTicket(ctx, t)
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	out, _ := json.Marshal(map[string]interface{}{"id": id})
	return string(out), nil
}

// SupportTicketList returns the caller's tickets (or all tickets when an admin
// passes {"all":true}, optionally filtered by ?status).
func SupportTicketList(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	userID, err := callerID(ctx)
	if err != nil {
		return "", err
	}
	var req struct {
		All    bool   `json:"all"`
		Status string `json:"status"`
		Limit  int    `json:"limit"`
	}
	if payload != "" {
		_ = json.Unmarshal([]byte(payload), &req)
	}
	as := store.NewAiprocStore(db)
	var tickets []store.AiprocSupportTicket
	if req.All && isAdmin(userID) {
		tickets, err = as.ListAllTickets(ctx, req.Status, req.Limit)
	} else {
		tickets, err = as.ListTickets(ctx, userID, req.Limit)
	}
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	out, _ := json.Marshal(map[string]interface{}{"tickets": tickets})
	return string(out), nil
}

// SupportTicketGet returns one ticket with its full thread. The caller must own
// the ticket or be an admin.
func SupportTicketGet(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	userID, err := callerID(ctx)
	if err != nil {
		return "", err
	}
	var req struct {
		ID string `json:"id"`
	}
	if err := json.Unmarshal([]byte(payload), &req); err != nil || req.ID == "" {
		return "", runtime.NewError("id required", 3)
	}
	t, err := store.NewAiprocStore(db).GetTicket(ctx, req.ID)
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	if t == nil {
		return "", runtime.NewError("ticket not found", 5)
	}
	if t.UserID != userID && !isAdmin(userID) {
		return "", runtime.NewError("forbidden", 7)
	}
	out, _ := json.Marshal(map[string]interface{}{"ticket": t})
	return string(out), nil
}

// SupportTicketReply appends the caller's reply to their own ticket and reopens
// it (status → "open").
func SupportTicketReply(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	userID, err := callerID(ctx)
	if err != nil {
		return "", err
	}
	var req struct {
		ID   string `json:"id"`
		Body string `json:"body"`
	}
	if err := json.Unmarshal([]byte(payload), &req); err != nil || req.ID == "" {
		return "", runtime.NewError("id required", 3)
	}
	req.Body = strings.TrimSpace(req.Body)
	if req.Body == "" {
		return "", runtime.NewError("body required", 3)
	}
	as := store.NewAiprocStore(db)
	t, err := as.GetTicket(ctx, req.ID)
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	if t == nil {
		return "", runtime.NewError("ticket not found", 5)
	}
	if t.UserID != userID {
		return "", runtime.NewError("forbidden", 7)
	}
	msg := store.AiprocTicketMessage{Author: userID, Role: "user", Body: req.Body, At: time.Now().UTC()}
	if err := as.AddTicketMessage(ctx, req.ID, msg, "open"); err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	return `{"ok":true}`, nil
}

// SupportTicketAdminRespond appends an admin reply to any ticket and sets its
// status (default "pending"). Admin only. Notifies the ticket owner.
func SupportTicketAdminRespond(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	adminID, err := aiprocRequireAdmin(ctx)
	if err != nil {
		return "", err
	}
	var req struct {
		ID     string `json:"id"`
		Body   string `json:"body"`
		Status string `json:"status"`
	}
	if err := json.Unmarshal([]byte(payload), &req); err != nil || req.ID == "" {
		return "", runtime.NewError("id required", 3)
	}
	req.Body = strings.TrimSpace(req.Body)
	if req.Body == "" {
		return "", runtime.NewError("body required", 3)
	}
	status := req.Status
	if status == "" {
		status = "pending"
	}
	as := store.NewAiprocStore(db)
	t, err := as.GetTicket(ctx, req.ID)
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	if t == nil {
		return "", runtime.NewError("ticket not found", 5)
	}
	msg := store.AiprocTicketMessage{Author: adminID, Role: "admin", Body: req.Body, At: time.Now().UTC()}
	if err := as.AddTicketMessage(ctx, req.ID, msg, status); err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	if t.UserID != "" {
		_ = nk.NotificationSend(ctx, t.UserID, "Support replied to your ticket", map[string]interface{}{
			"kind":      "support_reply",
			"ticket_id": req.ID,
		}, 556, "", false)
	}
	return `{"ok":true}`, nil
}

// SupportContact is the PUBLIC (unauthenticated) contact form. It opens a ticket
// with the supplied email; if a Nakama session is present the ticket is also
// linked to that user.
func SupportContact(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	var req struct {
		Email    string `json:"email"`
		Subject  string `json:"subject"`
		Body     string `json:"body"`
		Category string `json:"category"`
	}
	if err := json.Unmarshal([]byte(payload), &req); err != nil {
		return "", runtime.NewError("invalid payload", 3)
	}
	req.Email = strings.TrimSpace(req.Email)
	req.Subject = strings.TrimSpace(req.Subject)
	req.Body = strings.TrimSpace(req.Body)
	if req.Email == "" || req.Subject == "" || req.Body == "" {
		return "", runtime.NewError("email, subject and body required", 3)
	}
	userID, _ := ctx.Value(runtime.RUNTIME_CTX_USER_ID).(string)
	author := req.Email
	if userID != "" {
		author = userID
	}
	t := &store.AiprocSupportTicket{
		UserID:   userID,
		Email:    req.Email,
		Subject:  req.Subject,
		Category: req.Category,
		Messages: []store.AiprocTicketMessage{{
			Author: author,
			Role:   "user",
			Body:   req.Body,
			At:     time.Now().UTC(),
		}},
	}
	id, err := store.NewAiprocStore(db).CreateTicket(ctx, t)
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	out, _ := json.Marshal(map[string]interface{}{"id": id, "ok": true})
	return string(out), nil
}

// =========================================================================
// Device fingerprints
// =========================================================================

// DeviceRegister records the caller's device fingerprint (for multi-account /
// shared-device detection).
func DeviceRegister(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	userID, err := callerID(ctx)
	if err != nil {
		return "", err
	}
	var req struct {
		Fingerprint string `json:"fingerprint"`
		UserAgent   string `json:"user_agent"`
		IP          string `json:"ip"`
	}
	if err := json.Unmarshal([]byte(payload), &req); err != nil || strings.TrimSpace(req.Fingerprint) == "" {
		return "", runtime.NewError("fingerprint required", 3)
	}
	ip := strings.TrimSpace(req.IP)
	if ip == "" {
		if v, ok := ctx.Value(runtime.RUNTIME_CTX_CLIENT_IP).(string); ok {
			ip = v
		}
	}
	if err := store.NewAiprocStore(db).RegisterDevice(ctx, userID, strings.TrimSpace(req.Fingerprint), ip, req.UserAgent); err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	return `{"ok":true}`, nil
}

// DeviceMultiAccountList returns fingerprints shared across two or more accounts
// — the shared-device signal. Admin only.
func DeviceMultiAccountList(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	if _, err := aiprocRequireAdmin(ctx); err != nil {
		return "", err
	}
	var req struct {
		Limit int `json:"limit"`
	}
	if payload != "" {
		_ = json.Unmarshal([]byte(payload), &req)
	}
	groups, err := store.NewAiprocStore(db).MultiAccountFingerprints(ctx, req.Limit)
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	out, _ := json.Marshal(map[string]interface{}{"multi_accounts": groups})
	return string(out), nil
}

// =========================================================================
// Commentary (structured play-by-play text — no TTS/audio)
// =========================================================================

// CommentaryGenerate turns a spot (board + hole cards + pot geometry) into
// structured play-by-play commentary lines. The equity/GTO read always goes
// through engine-math (rs_poker) per Golden rule 4 — there is no local fallback
// and it emits NO TTS/audio, only text.
func CommentaryGenerate(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	if _, err := callerID(ctx); err != nil {
		return "", err
	}
	var req struct {
		MatchID      string   `json:"match_id"`
		HandNo       int      `json:"hand_no"`
		Street       string   `json:"street"`
		Board        string   `json:"board"`
		HeroHole     string   `json:"hero_hole"`
		VillainHoles []string `json:"villain_holes"`
		Holes        []string `json:"holes"`
		Pot          float64  `json:"pot"`
		ToCall       float64  `json:"to_call"`
		Iterations   int      `json:"iterations"`
	}
	if err := json.Unmarshal([]byte(payload), &req); err != nil {
		return "", runtime.NewError("invalid payload", 3)
	}
	board := strings.TrimSpace(req.Board)
	iters := req.Iterations
	if iters <= 0 {
		iters = 2000
	}
	street := req.Street
	if street == "" {
		street = aiprocStreetForBoard(board)
	}

	lines := []string{fmt.Sprintf("We're on the %s.", street)}
	if board != "" {
		lines = append(lines, fmt.Sprintf("Board comes %s.", aiprocSpaceCards(board)))
	}

	// Multiway equity read (needs 2+ hole hands).
	holes := req.Holes
	if len(holes) < 2 && req.HeroHole != "" {
		holes = append([]string{req.HeroHole}, req.VillainHoles...)
	}
	if len(holes) >= 2 {
		eq, err := enginemath.EstimateEquity(holes, board, iters)
		if err != nil {
			return "", runtime.NewError("equity engine unavailable", 13)
		}
		for i, e := range eq {
			who := "Hero"
			if i > 0 {
				who = fmt.Sprintf("Villain %d", i)
			}
			lines = append(lines, fmt.Sprintf("%s holds %s and is %.1f%% to win.", who, aiprocSpaceCards(holes[i]), float64(e)*100))
		}
	}

	// Hero decision read via the GTO/equity heuristic when we have a hero + a
	// price to pay.
	if req.HeroHole != "" && req.ToCall > 0 {
		advice, err := enginemath.GtoAdvise(req.HeroHole, req.VillainHoles, board, req.Pot, req.ToCall, iters)
		if err != nil {
			return "", runtime.NewError("gto engine unavailable", 13)
		}
		lines = append(lines,
			fmt.Sprintf("Facing a bet of %.0f into %.0f, the solver leans toward a %s.", req.ToCall, req.Pot, strings.ToUpper(advice.SuggestedAction)))
		if advice.Rationale != "" {
			lines = append(lines, advice.Rationale)
		}
	}

	text := strings.Join(lines, " ")
	out, _ := json.Marshal(map[string]interface{}{
		"match_id": req.MatchID,
		"hand_no":  req.HandNo,
		"street":   street,
		"lines":    lines,
		"text":     text,
		"engine":   "rs_poker",
	})
	return string(out), nil
}

// =========================================================================
// Rakeback batch (admin)
// =========================================================================

// RakebackProcessAll sweeps every user's accrued rakeback balance into their
// wallet in one admin batch, reusing the same atomic per-user claim path as
// rakeback_claim. Admin only.
func RakebackProcessAll(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	if _, err := aiprocRequireAdmin(ctx); err != nil {
		return "", err
	}
	as := store.NewAiprocStore(db)
	users, err := as.PendingRakebackUsers(ctx)
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	rs := store.NewRakebackStore(db)
	var totalCents int64
	paid := 0
	for _, uid := range users {
		amount, cerr := rs.Claim(ctx, uid)
		if cerr != nil {
			logger.Error("rakeback_process_all claim user=%s: %v", uid, cerr)
			continue
		}
		if amount > 0 {
			totalCents += amount
			paid++
		}
	}
	out, _ := json.Marshal(map[string]interface{}{
		"users_paid":     paid,
		"total_cents":    totalCents,
		"total_dollars":  dollars(totalCents),
		"candidates":     len(users),
	})
	return string(out), nil
}

// =========================================================================
// Public marketing / status
// =========================================================================

// StatsGlobal returns public network-wide counters (hands, players, clubs, pot,
// rake). No auth required — powers the landing page.
func StatsGlobal(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	g, err := store.NewAiprocStore(db).GlobalStats(ctx)
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	out, _ := json.Marshal(g)
	return string(out), nil
}

// PresenceOnline reports how many players are currently connected. It counts the
// global status stream (Nakama's online-session presence) and, best-effort, the
// players seated at live tables. No auth required.
func PresenceOnline(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	// Mode 1 is Nakama's global status stream — one presence per online session.
	online, err := nk.StreamCount(1, "", "", "")
	if err != nil {
		online = 0
	}
	atTables := 0
	if matches, merr := nk.MatchList(ctx, 100, true, "", nil, nil, ""); merr == nil {
		for _, m := range matches {
			atTables += int(m.Size)
		}
	}
	if online < atTables {
		online = atTables
	}
	out, _ := json.Marshal(map[string]interface{}{
		"online":          online,
		"players_at_tables": atTables,
	})
	return string(out), nil
}

// SiteSettingsGet returns public site configuration (branding + which features
// are live) derived from environment configuration. No auth required.
func SiteSettingsGet(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	settings := map[string]interface{}{
		"site_name":          aiprocEnvOr("SITE_NAME", "Poker Next-Gen"),
		"support_email":      aiprocEnvOr("SUPPORT_EMAIL", "support@poker-next-gen.gg"),
		"discord_url":        os.Getenv("DISCORD_URL"),
		"twitter_url":        os.Getenv("TWITTER_URL"),
		"deposits_enabled":   os.Getenv("NOWPAYMENTS_API_KEY") != "",
		"subscriptions_live": os.Getenv("STRIPE_SECRET_KEY") != "",
		"kyc_enabled":        os.Getenv("DIDIT_API_KEY") != "",
		"character_gen":      os.Getenv("TRIPO_API_KEY") != "",
	}
	out, _ := json.Marshal(map[string]interface{}{"settings": settings})
	return string(out), nil
}

// =========================================================================
// Helpers (domain-prefixed)
// =========================================================================

func aiprocEnvOr(key, fallback string) string {
	if v := strings.TrimSpace(os.Getenv(key)); v != "" {
		return v
	}
	return fallback
}

func aiprocParseTime(s string) (time.Time, bool) {
	s = strings.TrimSpace(s)
	if s == "" {
		return time.Time{}, false
	}
	if t, err := time.Parse(time.RFC3339, s); err == nil {
		return t.UTC(), true
	}
	return time.Time{}, false
}

// aiprocStreetForBoard infers the betting street from the number of board cards
// (2 chars per card).
func aiprocStreetForBoard(board string) string {
	switch len(strings.ReplaceAll(board, " ", "")) / 2 {
	case 0:
		return "preflop"
	case 3:
		return "flop"
	case 4:
		return "turn"
	case 5:
		return "river"
	default:
		return "street"
	}
}

// aiprocSpaceCards turns a packed card string like "AsKd" into "As Kd" for
// readable commentary.
func aiprocSpaceCards(cards string) string {
	cards = strings.ReplaceAll(cards, " ", "")
	if len(cards)%2 != 0 {
		return cards
	}
	parts := make([]string, 0, len(cards)/2)
	for i := 0; i+1 < len(cards); i += 2 {
		parts = append(parts, cards[i:i+2])
	}
	return strings.Join(parts, " ")
}
