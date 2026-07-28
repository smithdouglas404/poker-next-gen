package rpc

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"os"
	"strconv"
	"strings"

	"github.com/heroiclabs/nakama-common/runtime"

	"github.com/smithdouglas404/poker-next-gen/backend-core/billing"
	"github.com/smithdouglas404/poker-next-gen/backend-core/models"
	"github.com/smithdouglas404/poker-next-gen/backend-core/protocol"
	"github.com/smithdouglas404/poker-next-gen/backend-core/store"
)

// callerID returns the authenticated user id, or an error if the call is not
// user-authenticated (server-key/HTTP calls have no user context).
func callerID(ctx context.Context) (string, error) {
	userID, _ := ctx.Value(runtime.RUNTIME_CTX_USER_ID).(string)
	if userID == "" {
		return "", runtime.NewError("unauthorized", 16)
	}
	return userID, nil
}

// requireClubConfigurer authorizes the caller as an owner/configurer of the
// club. Without this, any authenticated player could allocate themselves club
// chips, add themselves as an owner, change rake, or read the house ledger.
func requireClubConfigurer(ctx context.Context, db *sql.DB, clubID string) (string, error) {
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
		if o.UserID == userID && (o.CanConfigure || o.Role == "owner") {
			// Club-enforced 2FA. The Global Settings "2FA" toggle used to write a
			// settings_json flag that nothing read; it is now a real column checked
			// here, at the one chokepoint every club operator action already passes
			// through. Deliberately placed AFTER the seat check so the message only
			// ever reaches an actual operator — it must not tell a stranger whether
			// a given club requires 2FA.
			if clubRequires2FA(ctx, db, clubID) && !callerHas2FA(ctx, db, userID) {
				return "", runtime.NewError(
					"this club requires two-factor authentication for operators — enable 2FA on your account first", 7)
			}
			return userID, nil
		}
	}
	return "", runtime.NewError("forbidden: not a club owner/configurer", 7)
}

// requireClubReader authorizes the caller to READ club-internal data: a roster
// member, or an operator seat. Weaker than requireClubConfigurer on purpose —
// ordinary members can see their own club's notices — but it is still a gate.
//
// Factored out because the same membership-or-configurer check was written
// inline in RakeConfigGet and simply missing from ClubAnnouncementList, which
// let any authenticated account read any club's announcement history.
func requireClubReader(ctx context.Context, db *sql.DB, clubID string) error {
	if clubID == "" {
		return runtime.NewError("club_id required", 3)
	}
	userID, err := callerID(ctx)
	if err != nil {
		return err
	}
	if mem, _ := store.NewClubStore(db).GetMembership(ctx, clubID, userID); mem != nil {
		return nil
	}
	if _, cerr := requireClubConfigurer(ctx, db, clubID); cerr != nil {
		return runtime.NewError("this is private to the club's members", 7)
	}
	return nil
}

func ClubCreate(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	var club models.Club
	if payload != "" {
		if err := json.Unmarshal([]byte(payload), &club); err != nil {
			return "", runtime.NewError("invalid payload", 3)
		}
	}
	if club.Name == "" {
		return "", runtime.NewError("name required", 3)
	}
	if club.Slug == "" {
		club.Slug = strings.ToLower(strings.ReplaceAll(club.Name, " ", "-"))
	}
	if club.Currency == "" {
		club.Currency = "USD"
	}
	club.IsActive = true

	userID, err := callerID(ctx)
	if err != nil {
		return "", err
	}
	// Registration gate: unregistered guests can host a game but not create clubs.
	if err := requireVerified(ctx, db, userID, "email", "creating a club"); err != nil {
		return "", err
	}
	clubStore := store.NewClubStore(db)

	// Tier gate: enforce the caller's club-create limit.
	tier := store.SubscriptionTier(ctx, db, userID)
	owned, err := clubStore.CountOwnedClubs(ctx, userID)
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	if !billing.CanCreateClub(tier, owned) {
		def := billing.GetTierDef(tier)
		if def.ClubCreateLimit == 0 {
			return "", runtime.NewError("your plan cannot create clubs — upgrade to create one", 7)
		}
		return "", runtime.NewError("club limit reached for your plan — upgrade for more", 7)
	}

	// Ownership fee: creating a club is not free. Debit the one-time fee from the
	// wallet up front (ledgered); refunded implicitly never — this is revenue.
	fee := clubCreateFeeCents()
	if fee > 0 {
		if err := store.NewWalletStore(db).Debit(ctx, userID, fee, "club_create_fee"); err != nil {
			return "", runtime.NewError("club creation fee requires a balance of "+dollars(fee)+" — add funds or upgrade", 9)
		}
	}

	refundCreateFee := func(why string) {
		if fee <= 0 {
			return
		}
		if rerr := store.NewWalletStore(db).Credit(ctx, userID, fee, "club_create_fee_refund"); rerr != nil {
			logger.Error("REFUND FAILED club_create user=%s amount_cents=%d (%s): %v",
				userID, fee, why, rerr)
		}
	}

	if err := clubStore.Create(ctx, &club); err != nil {
		logger.Error("club create: %v", err)
		refundCreateFee("club row not created")
		return "", runtime.NewError("failed to create club", 13)
	}

	// The owner seat is the club. Both of these were discarded errors, so a
	// failure here left a club with no owner and no members while the creator had
	// already paid the ownership fee: nobody could configure it, nobody could
	// delete it, and the licence check would later report "this club has no owner
	// on record". Undo the whole thing instead.
	if err := clubStore.AddOwner(ctx, &models.Owner{
		ClubID: club.ID, UserID: userID, Role: "owner", EquityBps: 10000, CanConfigure: true,
	}); err != nil {
		logger.Error("club %s created but owner seat failed: %v", club.ID, err)
		if derr := store.NewClubExtStore(db).Deactivate(ctx, club.ID); derr != nil {
			logger.Error("club %s left active with no owner: %v", club.ID, derr)
		}
		refundCreateFee("owner seat not created")
		return "", runtime.NewError("failed to create club", 13)
	}
	username, _ := ctx.Value(runtime.RUNTIME_CTX_USERNAME).(string)
	// AdmitMember, not AddMember: this is the creator's OWN brand-new club, not
	// a self-service join into someone else's — an outstanding kick at an
	// unrelated club must not block founding a club.
	if err := clubStore.AdmitMember(ctx, club.ID, userID, username, "owner"); err != nil {
		// Less severe — the owner seat exists, so the club is governable — but it
		// must not pass silently: the creator would be absent from their own
		// roster, and roster membership is what several club reads gate on.
		logger.Error("club %s: owner missing from roster: %v", club.ID, err)
	}

	out, err := json.Marshal(club)
	if err != nil {
		return "", err
	}
	return string(out), nil
}

// clubCreateFeeCents is the one-time ownership fee to create a club (revenue).
// Configurable via CLUB_CREATE_FEE_CENTS; defaults to $250.
func clubCreateFeeCents() int64 {
	if v := os.Getenv("CLUB_CREATE_FEE_CENTS"); v != "" {
		if n, err := strconv.ParseInt(v, 10, 64); err == nil && n >= 0 {
			return n
		}
	}
	return 25000
}

func dollars(cents int64) string {
	return "$" + strconv.FormatFloat(float64(cents)/100.0, 'f', 2, 64)
}

// ClubJoin adds the caller to a club as a member (enforcing the owner tier's
// member cap and the club's KYC requirement).
// ClubResolveCode resolves a shareable invite code (club slug, or raw id) to a
// club preview for the join-by-code page, including whether the caller is already
// a member. Auth required but no membership needed — this is the pre-join lookup.
func ClubResolveCode(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
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
	code := strings.ToLower(strings.TrimSpace(req.Code))
	cs := store.NewClubStore(db)
	club, _ := cs.GetBySlug(ctx, code)
	if club == nil {
		// Fall back to a raw club id (invite links may carry the id).
		club, _ = cs.GetByID(ctx, strings.TrimSpace(req.Code))
	}
	if club == nil || !club.IsActive {
		return "", runtime.NewError("no club matches that code", 5)
	}
	members, _ := cs.CountMembers(ctx, club.ID)
	member, _ := cs.GetMembership(ctx, club.ID, userID)
	out, _ := json.Marshal(map[string]interface{}{
		"club": map[string]interface{}{
			"id": club.ID, "name": club.Name, "slug": club.Slug,
			"description": club.Description, "members": members,
		},
		"already_member": member != nil,
	})
	return string(out), nil
}

func ClubJoin(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	userID, err := callerID(ctx)
	if err != nil {
		return "", err
	}
	var req struct {
		ClubID string `json:"club_id"`
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
	// Member cap (owner's tier).
	memberCap := billing.ClubMemberCap(clubOwnerTier(ctx, db, req.ClubID))
	count, err := clubStore.CountMembers(ctx, req.ClubID)
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	if existing, _ := clubStore.GetMembership(ctx, req.ClubID, userID); existing == nil && int64(count) >= memberCap {
		return "", runtime.NewError("this club is full", 7)
	}
	username, _ := ctx.Value(runtime.RUNTIME_CTX_USERNAME).(string)
	if err := clubStore.AddMember(ctx, req.ClubID, userID, username, "member"); err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	return `{"ok":true,"role":"member"}`, nil
}

// ClubLeave removes the caller from a club (owners cannot leave their own club).
func ClubLeave(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	userID, err := callerID(ctx)
	if err != nil {
		return "", err
	}
	var req struct {
		ClubID string `json:"club_id"`
	}
	if err := json.Unmarshal([]byte(payload), &req); err != nil || req.ClubID == "" {
		return "", runtime.NewError("club_id required", 3)
	}
	cs := store.NewClubStore(db)
	m, _ := cs.GetMembership(ctx, req.ClubID, userID)
	if m == nil {
		return "", runtime.NewError("you are not a member of this club", 5)
	}
	if m.Role == "owner" {
		return "", runtime.NewError("owners cannot leave their own club", 9)
	}
	// Two loose ends this used to leave behind. RemoveMember deletes the roster
	// row and nothing else, so leaving was silently destructive in both cases:
	//
	//  1. Club-allocated chips live in poker_player_balance keyed by
	//     (club_id, user_id), not on the roster row. Leaving with a balance
	//     orphaned it — the club had extended credit to someone who was no longer
	//     a member, and the player could not spend it because every club gate
	//     checks membership first. Their chips simply vanished from their reach.
	//  2. Leaving mid-session would strand a seat funded by that club's chips.
	//
	// Both are refusals rather than silent cleanups: the money is the player's
	// and what happens to it is their decision, not a side effect of clicking
	// Leave.
	if bal, berr := cs.GetBalance(ctx, req.ClubID, userID); berr == nil && bal != nil {
		if held := bal.Balance + bal.LockedAmount; held > 0 {
			return "", runtime.NewError(fmt.Sprintf(
				"you still hold %d.%02d in club chips — cash out or spend them before leaving",
				held/100, held%100), 9)
		}
	}
	if cnt, cerr := store.NewActiveSeatStore(db).Count(ctx, userID); cerr == nil && cnt > 0 {
		return "", runtime.NewError("leave your table before leaving the club", 9)
	}
	if err := cs.RemoveMember(ctx, req.ClubID, userID); err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	_ = store.NewClubExtStore(db).LogActivity(ctx, req.ClubID, userID, "member_leave", userID+" left the club")
	return `{"ok":true}`, nil
}

// ClubMembers lists a club's roster.
func ClubMembers(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	var req struct {
		ClubID string `json:"club_id"`
	}
	if err := json.Unmarshal([]byte(payload), &req); err != nil || req.ClubID == "" {
		return "", runtime.NewError("club_id required", 3)
	}
	// No auth check at all previously — any authenticated (or unauthenticated,
	// since requireClubReader/callerID is what actually enforces a session)
	// caller could list any club's full membership by club_id alone.
	if err := requireClubReader(ctx, db, req.ClubID); err != nil {
		return "", err
	}
	members, err := store.NewClubStore(db).ListMembers(ctx, req.ClubID)
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	out, _ := json.Marshal(map[string]interface{}{"members": members})
	return string(out), nil
}

// ClubMemberRole lets an owner/configurer set a member's role (member|admin).
func ClubMemberRole(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	var req protocol.ClubMemberRoleRequest
	if err := json.Unmarshal([]byte(payload), &req); err != nil || req.ClubID == "" || req.UserID == "" {
		return "", runtime.NewError("club_id and user_id required", 3)
	}
	if req.Role != "member" && req.Role != "admin" {
		return "", runtime.NewError("role must be member or admin", 3)
	}
	if _, err := requireClubPermission(ctx, db, req.ClubID, store.PermMembers); err != nil {
		return "", err
	}
	if err := store.NewClubStore(db).SetMemberRole(ctx, req.ClubID, req.UserID, req.Role); err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	return `{"ok":true}`, nil
}

// ClubKick removes a member from a club (owner/configurer only; cannot kick an
// owner). This is a status change, not a deletion: the member's row is kept
// with status='kicked', which is what blocks them from self-service rejoining
// THIS club (ClubJoin/invitation-accept both route through
// ClubStore.AddMember, which refuses a 'kicked' row) and from self-service
// joining ANY OTHER club (AddMember also checks HasAnyActiveKick). Getting
// back in — to this club or a different one — requires an owner/configurer to
// explicitly call ClubMemberAdmit; see that function's comment for why a
// delete-based kick couldn't express any of this policy.
func ClubKick(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	var req struct {
		ClubID string `json:"club_id"`
		UserID string `json:"user_id"`
	}
	if err := json.Unmarshal([]byte(payload), &req); err != nil || req.ClubID == "" || req.UserID == "" {
		return "", runtime.NewError("club_id and user_id required", 3)
	}
	if _, err := requireClubPermission(ctx, db, req.ClubID, store.PermMembers); err != nil {
		return "", err
	}
	clubStore := store.NewClubStore(db)
	if m, _ := clubStore.GetMembership(ctx, req.ClubID, req.UserID); m != nil && m.Role == "owner" {
		return "", runtime.NewError("cannot remove an owner", 9)
	}
	if err := clubStore.KickMember(ctx, req.ClubID, req.UserID); err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	_ = store.NewClubExtStore(db).LogActivity(ctx, req.ClubID, req.UserID, "member_kicked", "removed from the club")
	return `{"ok":true}`, nil
}

// ClubMemberAdmit is the owner/configurer action that clears an outstanding
// kick and (re)admits a member — the only way back in once ClubKick has set a
// 'kicked' status, at this club or, for a DIFFERENT club's owner willing to
// vouch for them, elsewhere. A delete-based kick (the old ClubKick behavior)
// couldn't express "requires explicit re-approval" at all: RemoveMember just
// erased the row, so a re-join looked identical to a first-time join and
// ClubStore.AddMember happily reactivated it — nothing ever actually blocked
// anyone kicked from getting straight back in, or, since there was no
// cross-club record either, from hopping to a different club with a clean
// slate. ClubMemberAdmit uses ClubStore.AdmitMember, the one privileged path
// that bypasses both of AddMember's kick checks — deliberately: this IS the
// human decision the policy requires before either check should be waived.
func ClubMemberAdmit(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	var req struct {
		ClubID string `json:"club_id"`
		UserID string `json:"user_id"`
	}
	if err := json.Unmarshal([]byte(payload), &req); err != nil || req.ClubID == "" || req.UserID == "" {
		return "", runtime.NewError("club_id and user_id required", 3)
	}
	if _, err := requireClubPermission(ctx, db, req.ClubID, store.PermMembers); err != nil {
		return "", err
	}
	username := req.UserID
	if acct, aerr := nk.AccountGetId(ctx, req.UserID); aerr == nil && acct.GetUser() != nil && acct.GetUser().GetUsername() != "" {
		username = acct.GetUser().GetUsername()
	}
	if err := store.NewClubStore(db).AdmitMember(ctx, req.ClubID, req.UserID, username, "member"); err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	_ = store.NewClubExtStore(db).LogActivity(ctx, req.ClubID, req.UserID, "member_admitted", "admitted despite an outstanding kick")
	return `{"ok":true}`, nil
}

// ClubBanMember escalates past a kick to a PLATFORM-WIDE lock — the member
// loses access to the entire platform (SetBan / denyIfBanned already enforces
// this on every login path), not just this one club. Deliberately one-way
// from a club owner's side: only the platform administrator can lift it
// (AdminUnban, or approving the HITL queue item this creates), so a club
// cannot both lock a problem account out platform-wide AND be the one that
// lets them back in — reauthorization is centralized, not left to whichever
// club banned them.
func ClubBanMember(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	var req struct {
		ClubID string `json:"club_id"`
		UserID string `json:"user_id"`
		Reason string `json:"reason"`
	}
	if err := json.Unmarshal([]byte(payload), &req); err != nil || req.ClubID == "" || req.UserID == "" {
		return "", runtime.NewError("club_id and user_id required", 3)
	}
	configurerID, err := requireClubPermission(ctx, db, req.ClubID, store.PermMembers)
	if err != nil {
		return "", err
	}
	clubStore := store.NewClubStore(db)
	if m, _ := clubStore.GetMembership(ctx, req.ClubID, req.UserID); m != nil && m.Role == "owner" {
		return "", runtime.NewError("cannot ban an owner", 9)
	}
	reason := strings.TrimSpace(req.Reason)
	if reason == "" {
		reason = "banned by a club operator"
	}
	if err := store.NewAdminStore(db).SetBan(ctx, req.UserID, true, reason, "club:"+req.ClubID+":"+configurerID); err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	if _, err := store.NewAdminStore(db).CreateHitl(ctx, "club_ban_reauth", req.UserID, map[string]interface{}{
		"club_id": req.ClubID, "banned_by": configurerID, "reason": reason,
	}); err != nil {
		// The ban itself already took effect and is the actual security
		// action; a failed queue insert must not un-ban them, but it does mean
		// this ban is invisible to the admin's review queue until someone
		// notices — log loudly so it's findable.
		logger.Error("club ban HITL entry not created club=%s user=%s: %v", req.ClubID, req.UserID, err)
	}
	_ = store.NewClubExtStore(db).LogActivity(ctx, req.ClubID, req.UserID, "member_banned", reason)
	return `{"ok":true}`, nil
}

// ClubGet returns a club, the caller's membership, and the create fee.
func ClubGet(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	userID, _ := ctx.Value(runtime.RUNTIME_CTX_USER_ID).(string)
	var req struct {
		ClubID string `json:"club_id"`
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
	members, _ := clubStore.ListMembers(ctx, req.ClubID)
	var mine *store.ClubMember
	if userID != "" {
		mine, _ = clubStore.GetMembership(ctx, req.ClubID, userID)
	}
	out, _ := json.Marshal(map[string]interface{}{
		"club":             club,
		"members":          members,
		"my_membership":    mine,
		"create_fee_cents": clubCreateFeeCents(),
	})
	return string(out), nil
}

// clubOwnerTier returns the subscription tier of a club's primary owner
// (role='owner'), defaulting to free.
func clubOwnerTier(ctx context.Context, db *sql.DB, clubID string) string {
	owners, err := store.NewClubStore(db).ListOwners(ctx, clubID)
	if err != nil {
		return "free"
	}
	for _, o := range owners {
		if o.Role == "owner" {
			return store.SubscriptionTier(ctx, db, o.UserID)
		}
	}
	return "free"
}

func ClubList(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	clubs, err := store.NewClubStore(db).List(ctx)
	if err != nil {
		return "", runtime.NewError("failed to list clubs", 13)
	}
	out, _ := json.Marshal(map[string]interface{}{"clubs": clubs})
	return string(out), nil
}

func ClubOwnerAdd(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	var req models.Owner
	if err := json.Unmarshal([]byte(payload), &req); err != nil {
		return "", runtime.NewError("invalid payload", 3)
	}
	if req.ClubID == "" || req.UserID == "" {
		return "", runtime.NewError("club_id and user_id required", 3)
	}
	if _, err := requireClubPermission(ctx, db, req.ClubID, store.PermSettings); err != nil {
		return "", err
	}
	if req.Role == "" {
		req.Role = "manager"
	}
	switch req.Role {
	case "owner", "manager", "moderator", "agent":
	default:
		return "", runtime.NewError("role must be one of owner, manager, moderator, agent", 3)
	}
	// A new seat gets its role's preset grid rather than an empty column. Empty
	// means "legacy, full access" (see store.SeatHasPermission), which is right for
	// seats that predate the grid and wrong for one created after it — a fresh
	// moderator must not silently get everything.
	if strings.TrimSpace(req.Permissions) == "" {
		req.Permissions = store.JoinPermissions(store.RolePermissions(req.Role))
	} else {
		for _, p := range store.SplitPermissions(req.Permissions) {
			if !store.IsPermission(p) {
				return "", runtime.NewError("unknown permission in grid", 3)
			}
		}
		req.Permissions = store.JoinPermissions(store.SplitPermissions(req.Permissions))
	}
	clubStore := store.NewClubStore(db)

	// Tier gate: enforce the club owner's member cap.
	ownerTier := clubOwnerTier(ctx, db, req.ClubID)
	memberCap := billing.ClubMemberCap(ownerTier)
	count, err := clubStore.CountMembers(ctx, req.ClubID)
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	if int64(count) >= memberCap {
		return "", runtime.NewError("club member limit reached for the owner's plan — upgrade for more", 7)
	}

	// Equity has to add up. It was taken verbatim from the request and never
	// checked against the rest of the club, so a club whose creator already holds
	// 100% could keep adding owners at any percentage and end up 150% owned —
	// a figure shown to operators as their ownership split.
	if req.EquityBps < 0 || req.EquityBps > 10000 {
		return "", runtime.NewError("equity must be between 0% and 100%", 3)
	}
	allocatedRaw, err := clubStore.EquityBpsExcluding(ctx, req.ClubID, req.UserID)
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	allocated := int32(allocatedRaw)
	if allocated+req.EquityBps > 10000 {
		free := 10000 - allocated
		if free < 0 {
			free = 0
		}
		return "", runtime.NewError(fmt.Sprintf(
			"that would take this club past 100%% ownership — %d.%02d%% is unallocated",
			free/100, free%100), 9)
	}

	if err := clubStore.AddOwner(ctx, &req); err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	out, _ := json.Marshal(map[string]interface{}{
		"id": req.ID, "user_id": req.UserID, "role": req.Role,
		"equity_bps": req.EquityBps, "permissions": req.Permissions,
		// So the caller can render the split without a second round trip.
		"club_equity_allocated_bps": allocated + req.EquityBps,
	})
	return string(out), nil
}

// ClubOwnerRemove revokes an operator seat (owner/manager/agent/moderator).
//
// AddOwner had no inverse: seats could be granted and never revoked, so a
// departed partner kept their equity and operator access permanently, and a
// seat added by mistake could never be corrected.
//
// Removing an owner-role seat is gated stricter than granting one, for the same
// reason club_delete and club_transfer_ownership already are: it can end
// someone's stake in the club and, if they were the licensee, the club's
// authority to run cash games. Removing a manager/agent/moderator seat only
// needs PermSettings, same as granting one.
func ClubOwnerRemove(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	var req struct {
		ClubID string `json:"club_id"`
		UserID string `json:"user_id"`
	}
	if err := json.Unmarshal([]byte(payload), &req); err != nil || req.ClubID == "" || req.UserID == "" {
		return "", runtime.NewError("club_id and user_id required", 3)
	}
	clubStore := store.NewClubStore(db)
	owners, err := clubStore.ListOwners(ctx, req.ClubID)
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	var target *models.Owner
	for i := range owners {
		if owners[i].UserID == req.UserID {
			target = &owners[i]
			break
		}
	}
	if target == nil {
		return "", runtime.NewError("that user does not hold an operator seat here", 5)
	}

	var callerID2 string
	if target.Role == "owner" {
		// Removing a primary owner is as consequential as club_delete or
		// club_transfer_ownership — gated the same way, not by PermSettings, which
		// a configuring manager also holds.
		callerID2, err = clubsextRequireOwner(ctx, db, req.ClubID)
		if err != nil {
			return "", err
		}
		ownerSeats := 0
		for _, o := range owners {
			if o.Role == "owner" {
				ownerSeats++
			}
		}
		if ownerSeats <= 1 {
			return "", runtime.NewError(
				"this is the club's only owner — transfer ownership instead of removing it, or the club would be left without one", 9)
		}
		// Same hazard as transfer, without transfer's promotion to offset it: if
		// this owner is the club's licensee, removing them can revoke its
		// authority to run cash games with no warning at all.
		if store.LicenceFor(ctx, db, req.ClubID).CanHostCash &&
			!store.LicenceAfterRemoval(ctx, db, req.ClubID, req.UserID).CanHostCash {
			return "", runtime.NewError(
				"this club runs cash games on this owner's licence and no other qualified owner remains — "+
					"add another qualified owner first, or transfer ownership to one before removing this seat", 9)
		}
	} else {
		if callerID2, err = requireClubPermission(ctx, db, req.ClubID, store.PermSettings); err != nil {
			return "", err
		}
	}

	removed, err := clubStore.RemoveOwner(ctx, req.ClubID, req.UserID)
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	if !removed {
		return "", runtime.NewError("that user does not hold an operator seat here", 5)
	}
	_ = store.NewClubExtStore(db).LogActivity(ctx, req.ClubID, callerID2, "owner_seat_removed",
		"removed "+target.Role+" seat for "+req.UserID)
	out, _ := json.Marshal(map[string]interface{}{"ok": true, "removed_role": target.Role})
	return string(out), nil
}

func BalanceAllocate(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	var req models.PlayerAllocatedBalance
	if err := json.Unmarshal([]byte(payload), &req); err != nil {
		return "", runtime.NewError("invalid payload", 3)
	}
	if req.ClubID == "" || req.UserID == "" {
		return "", runtime.NewError("club_id and user_id required", 3)
	}
	// Only a club owner/configurer may allocate chips — otherwise any player
	// could mint themselves an unlimited buy-in bankroll.
	if _, err := requireClubPermission(ctx, db, req.ClubID, store.PermMoney); err != nil {
		return "", err
	}
	if req.Currency == "" {
		req.Currency = "USD"
	}
	if err := store.NewClubStore(db).AllocateBalance(ctx, &req, "operator allocation"); err != nil {
		return "", runtime.NewError(err.Error(), 3)
	}
	// Record it in the club's own activity feed. An operator moving a member's
	// chips is exactly the kind of action the other operators need to be able to
	// see after the fact.
	actor, _ := callerID(ctx)
	_ = store.NewClubExtStore(db).LogActivity(ctx, req.ClubID, actor, "balance_allocate",
		fmt.Sprintf("allocated %d to %s", req.Balance, req.UserID))
	out, _ := json.Marshal(req)
	return string(out), nil
}

func BalanceGet(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	var req struct {
		ClubID string `json:"club_id"`
		UserID string `json:"user_id"`
	}
	if err := json.Unmarshal([]byte(payload), &req); err != nil {
		return "", runtime.NewError("invalid payload", 3)
	}
	// A player may read their own balance; anyone else must be a club configurer.
	caller, err := callerID(ctx)
	if err != nil {
		return "", err
	}
	if req.UserID == "" {
		req.UserID = caller
	}
	if req.UserID != caller {
		if _, err := requireClubConfigurer(ctx, db, req.ClubID); err != nil {
			return "", err
		}
	}
	bal, err := store.NewClubStore(db).GetBalance(ctx, req.ClubID, req.UserID)
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	out, _ := json.Marshal(bal)
	return string(out), nil
}

func RakeConfigSet(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	var req models.CustomRakeConfiguration
	if err := json.Unmarshal([]byte(payload), &req); err != nil {
		return "", runtime.NewError("invalid payload", 3)
	}
	if req.ClubID == "" {
		return "", runtime.NewError("club_id required", 3)
	}
	if _, err := requireClubPermission(ctx, db, req.ClubID, store.PermMoney); err != nil {
		return "", err
	}
	if req.Name == "" {
		req.Name = "Standard"
	}
	// Rake is capped at 0–10% (0–1000 bps), per the club marketplace model.
	if req.PercentBps < 0 {
		req.PercentBps = 0
	}
	if req.PercentBps > 1000 {
		req.PercentBps = 1000
	}
	req.IsActive = true
	if err := store.NewClubStore(db).SetRake(ctx, &req); err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	out, _ := json.Marshal(req)
	return string(out), nil
}

// RakeConfigGet exposes a club's rake rule. Rake transparency is OPT-IN: it is
// readable by anyone only when the club owner has toggled the config public
// (RakeConfigSet with "public": true). Otherwise it is restricted to club members
// and configurers. The write path stays requireClubConfigurer-only.
func RakeConfigGet(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	var req struct {
		ClubID string `json:"club_id"`
	}
	if err := json.Unmarshal([]byte(payload), &req); err != nil {
		return "", runtime.NewError("invalid payload", 3)
	}
	cs := store.NewClubStore(db)
	rake, err := cs.GetRake(ctx, req.ClubID)
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	// Gate unless the owner has opted this config into public visibility.
	if rake == nil || !rake.Public {
		if rerr := requireClubReader(ctx, db, req.ClubID); rerr != nil {
			return "", runtime.NewError("rake config is private to this club", 7)
		}
	}
	out, _ := json.Marshal(rake)
	return string(out), nil
}

func RakeLedgerGet(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	var req struct {
		ClubID string `json:"club_id"`
	}
	if err := json.Unmarshal([]byte(payload), &req); err != nil {
		return "", runtime.NewError("invalid payload", 3)
	}
	if _, err := requireClubPermission(ctx, db, req.ClubID, store.PermMoney); err != nil {
		return "", err
	}
	rakeStore := store.NewRakeStore(db)
	balance, err := rakeStore.HouseBalance(ctx, req.ClubID)
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	ledger, err := rakeStore.Ledger(ctx, req.ClubID, 50)
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	out, _ := json.Marshal(map[string]interface{}{
		"house_balance": balance,
		"ledger":        ledger,
	})
	return string(out), nil
}
