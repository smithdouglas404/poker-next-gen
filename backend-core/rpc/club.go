package rpc

import (
	"context"
	"database/sql"
	"encoding/json"
	"os"
	"strconv"
	"strings"

	"github.com/heroiclabs/nakama-common/runtime"

	"github.com/smithdouglas404/poker-next-gen/backend-core/billing"
	"github.com/smithdouglas404/poker-next-gen/backend-core/models"
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
			return userID, nil
		}
	}
	return "", runtime.NewError("forbidden: not a club owner/configurer", 7)
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

	if err := clubStore.Create(ctx, &club); err != nil {
		logger.Error("club create: %v", err)
		// Refund the fee if the club couldn't be created.
		if fee > 0 {
			_ = store.NewWalletStore(db).Credit(ctx, userID, fee, "club_create_fee_refund")
		}
		return "", runtime.NewError("failed to create club", 13)
	}
	_ = clubStore.AddOwner(ctx, &models.Owner{
		ClubID: club.ID, UserID: userID, Role: "owner", EquityBps: 10000, CanConfigure: true,
	})
	username, _ := ctx.Value(runtime.RUNTIME_CTX_USERNAME).(string)
	_ = clubStore.AddMember(ctx, club.ID, userID, username, "owner")

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
	m, _ := store.NewClubStore(db).GetMembership(ctx, req.ClubID, userID)
	if m != nil && m.Role == "owner" {
		return "", runtime.NewError("owners cannot leave their own club", 9)
	}
	if err := store.NewClubStore(db).RemoveMember(ctx, req.ClubID, userID); err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
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
	members, err := store.NewClubStore(db).ListMembers(ctx, req.ClubID)
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	out, _ := json.Marshal(map[string]interface{}{"members": members})
	return string(out), nil
}

// ClubMemberRole lets an owner/configurer set a member's role (member|admin).
func ClubMemberRole(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	var req struct {
		ClubID string `json:"club_id"`
		UserID string `json:"user_id"`
		Role   string `json:"role"`
	}
	if err := json.Unmarshal([]byte(payload), &req); err != nil || req.ClubID == "" || req.UserID == "" {
		return "", runtime.NewError("club_id and user_id required", 3)
	}
	if req.Role != "member" && req.Role != "admin" {
		return "", runtime.NewError("role must be member or admin", 3)
	}
	if _, err := requireClubConfigurer(ctx, db, req.ClubID); err != nil {
		return "", err
	}
	if err := store.NewClubStore(db).SetMemberRole(ctx, req.ClubID, req.UserID, req.Role); err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	return `{"ok":true}`, nil
}

// ClubKick removes a member from a club (owner/configurer only; cannot kick an owner).
func ClubKick(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	var req struct {
		ClubID string `json:"club_id"`
		UserID string `json:"user_id"`
	}
	if err := json.Unmarshal([]byte(payload), &req); err != nil || req.ClubID == "" || req.UserID == "" {
		return "", runtime.NewError("club_id and user_id required", 3)
	}
	if _, err := requireClubConfigurer(ctx, db, req.ClubID); err != nil {
		return "", err
	}
	clubStore := store.NewClubStore(db)
	if m, _ := clubStore.GetMembership(ctx, req.ClubID, req.UserID); m != nil && m.Role == "owner" {
		return "", runtime.NewError("cannot remove an owner", 9)
	}
	if err := clubStore.RemoveMember(ctx, req.ClubID, req.UserID); err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
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
		"club":            club,
		"members":         members,
		"my_membership":   mine,
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
	if _, err := requireClubConfigurer(ctx, db, req.ClubID); err != nil {
		return "", err
	}
	if req.Role == "" {
		req.Role = "manager"
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

	if err := clubStore.AddOwner(ctx, &req); err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	out, _ := json.Marshal(req)
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
	if _, err := requireClubConfigurer(ctx, db, req.ClubID); err != nil {
		return "", err
	}
	if req.Currency == "" {
		req.Currency = "USD"
	}
	if err := store.NewClubStore(db).AllocateBalance(ctx, &req); err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
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
	if _, err := requireClubConfigurer(ctx, db, req.ClubID); err != nil {
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

func RakeConfigGet(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	var req struct {
		ClubID string `json:"club_id"`
	}
	if err := json.Unmarshal([]byte(payload), &req); err != nil {
		return "", runtime.NewError("invalid payload", 3)
	}
	rake, err := store.NewClubStore(db).GetRake(ctx, req.ClubID)
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
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
	if _, err := requireClubConfigurer(ctx, db, req.ClubID); err != nil {
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
