package rpc

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"time"

	"github.com/heroiclabs/nakama-common/runtime"

	"github.com/smithdouglas404/poker-next-gen/backend-core/audit"
	"github.com/smithdouglas404/poker-next-gen/backend-core/billing"
	"github.com/smithdouglas404/poker-next-gen/backend-core/match/tournament"
	"github.com/smithdouglas404/poker-next-gen/backend-core/models"
	"github.com/smithdouglas404/poker-next-gen/backend-core/store"
)

// requireTournamentOwner authorizes a mutation on an existing tournament: the
// caller must be its creator, or a configurer of its owning club. Returns the
// caller id. (SEC-1 — these RPCs were previously unauthenticated.)
func requireTournamentOwner(ctx context.Context, db *sql.DB, tournamentID string) (string, error) {
	uid, err := callerID(ctx)
	if err != nil {
		return "", err
	}
	if tournamentID == "" {
		return "", runtime.NewError("tournament_id required", 3)
	}
	t, err := store.NewTournamentStore(db).Get(ctx, tournamentID)
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	if t == nil {
		return "", runtime.NewError("tournament not found", 5)
	}
	if t.CreatedBy != "" && t.CreatedBy == uid {
		return uid, nil
	}
	if t.ClubID != "" {
		if _, cerr := requireClubConfigurer(ctx, db, t.ClubID); cerr == nil {
			return uid, nil
		}
	}
	return "", runtime.NewError("forbidden: not the tournament owner", 7)
}

func TournamentCreate(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	var req models.TournamentBracket
	if err := json.Unmarshal([]byte(payload), &req); err != nil {
		return "", runtime.NewError("invalid payload", 3)
	}
	// Auth mandatory: record the creator, and if the tournament is club-owned the
	// caller must be a configurer of that club.
	uid, err := callerID(ctx)
	if err != nil {
		return "", err
	}
	if req.ClubID != "" {
		if _, cerr := requireClubConfigurer(ctx, db, req.ClubID); cerr != nil {
			return "", cerr
		}
	}
	req.CreatedBy = uid
	if req.Name == "" {
		return "", runtime.NewError("name required", 3)
	}
	if req.Variant == "" {
		req.Variant = "texas-holdem"
	}
	if req.StartingStack == 0 {
		req.StartingStack = 10000
	}
	if req.MaxPlayers == 0 {
		req.MaxPlayers = 180
	}
	if req.MaxSeatsPerTable == 0 {
		req.MaxSeatsPerTable = 6
	}
	if req.ScheduledAt.IsZero() {
		req.ScheduledAt = time.Now().UTC()
	}
	// Knockout (PKO): the per-player bounty is carved from the buy-in, so it must
	// leave a positive prize contribution. Non-knockout tournaments carry no bounty.
	if req.Knockout {
		if req.BountyMinor <= 0 {
			return "", runtime.NewError("a knockout tournament needs a positive bounty", 3)
		}
		if req.BountyMinor >= req.BuyInMinor {
			return "", runtime.NewError("bounty must be less than the buy-in", 3)
		}
	} else {
		req.BountyMinor = 0
	}
	// The builder's Financials/Rules fields arrive on this same payload (they are
	// json-tagged on TournamentBracket), so they need the identical validation
	// TournamentRulesSet applies — otherwise create is a hole around the edit gate.
	if req.AdminFeeBps < 0 || req.AdminFeeBps > 5000 {
		return "", runtime.NewError("admin fee must be between 0% and 50%", 3)
	}
	if req.GuaranteeMinor < 0 {
		return "", runtime.NewError("guaranteed prize pool cannot be negative", 3)
	}
	if req.BuyInMinor > 0 {
		perEntryRake := req.FeeMinor + req.BuyInMinor*int64(req.AdminFeeBps)/10000
		if perEntryRake >= req.BuyInMinor {
			return "", runtime.NewError(
				"the entry fee plus admin fee would consume the whole buy-in — lower one of them", 3)
		}
	}
	if req.OperatingStartMin < 0 || req.OperatingStartMin > 1439 ||
		req.OperatingEndMin < 0 || req.OperatingEndMin > 1439 {
		return "", runtime.NewError("operating hours must be minutes past midnight (0–1439)", 3)
	}
	if req.LateRegSecs < 0 {
		return "", runtime.NewError("late registration window cannot be negative", 3)
	}
	if req.TimeBankSecs < 0 || req.TimeBankSecs > 600 {
		return "", runtime.NewError("time bank must be between 0 and 600 seconds", 3)
	}
	if req.TimeBankPerHandSecs < 0 || req.TimeBankPerHandSecs > 120 {
		return "", runtime.NewError("per-hand time bank must be between 0 and 120 seconds", 3)
	}
	req.Status = "registering"
	if err := store.NewTournamentStore(db).Create(ctx, &req); err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	out, _ := json.Marshal(req)
	return string(out), nil
}

func TournamentList(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	list, err := store.NewTournamentStore(db).List(ctx)
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	out, _ := json.Marshal(map[string]interface{}{"tournaments": list})
	return string(out), nil
}

func TournamentRegister(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	var req struct {
		TournamentID string `json:"tournament_id"`
	}
	if err := json.Unmarshal([]byte(payload), &req); err != nil {
		return "", runtime.NewError("invalid payload", 3)
	}
	userID, ok := ctx.Value(runtime.RUNTIME_CTX_USER_ID).(string)
	if !ok || userID == "" {
		return "", runtime.NewError("unauthorized", 16)
	}
	username, _ := ctx.Value(runtime.RUNTIME_CTX_USERNAME).(string)

	tStore := store.NewTournamentStore(db)
	bracket, err := tStore.Get(ctx, req.TournamentID)
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	if bracket == nil {
		return "", runtime.NewError("tournament not found", 5)
	}
	// Late registration and operating hours were stored on the tournament and
	// enforced nowhere — a player could register into an event that had long
	// since closed. Both windows are now checked server-side.
	if open, why := store.RegistrationOpen(bracket, time.Now().UTC()); !open {
		return "", runtime.NewError(why, 9)
	}
	// Club-owned tournaments are private to that club's membership. Nothing
	// previously checked this at all — any authenticated user could register
	// for any club's tournament, member or not. There is no separate
	// public/private flag on TournamentBracket; a club_id being set IS what
	// scopes a tournament to that club, the same way a club-owned table
	// scopes seating.
	if bracket.ClubID != "" {
		m, _ := store.NewClubStore(db).GetMembership(ctx, bracket.ClubID, userID)
		if m == nil || m.Status != "active" {
			return "", runtime.NewError("this tournament is limited to club members", 7)
		}
	}
	// Tier gate: the tournament buy-in cap. Advertised per tier on the membership
	// page ("Up to $X") and enforced nowhere, so the cap bought nothing. Checked
	// BEFORE the wallet is debited — a rejection after taking the money would be
	// the worse failure.
	// Through the Effective helper, not the raw field: 0 means "freerolls only"
	// on free and "unlimited" on gold+, so the raw value would grant the free
	// tier unlimited entry.
	if maxBuyIn := billing.EffectiveTournamentBuyInMaxCents(store.SubscriptionTier(ctx, db, userID)); bracket.BuyInMinor > maxBuyIn {
		if maxBuyIn == 0 {
			return "", runtime.NewError("your plan covers freeroll tournaments only — upgrade to enter buy-in events", 9)
		}
		return "", runtime.NewError(fmt.Sprintf(
			"this tournament's buy-in is above your plan's limit of $%d — upgrade to enter", maxBuyIn/100), 9)
	}
	stack := bracket.StartingStack
	if stack <= 0 {
		stack = 10000
	}
	knockout, bounty := bracket.Knockout, bracket.BountyMinor
	if bracket.BuyInMinor > 0 {
		wStore := store.NewWalletStore(db)
		if err := wStore.Debit(ctx, userID, bracket.BuyInMinor, "tournament_buyin"); err != nil {
			return "", runtime.NewError("insufficient wallet balance", 9)
		}
	}
	registered, rerr := tStore.Register(ctx, req.TournamentID, userID, username, stack)
	if rerr != nil {
		if bracket.BuyInMinor > 0 {
			refundTournamentBuyIn(ctx, logger, db, userID, req.TournamentID, bracket.BuyInMinor, "register error")
		}
		return "", runtime.NewError(rerr.Error(), 13)
	}
	if !registered {
		// The UNIQUE(tournament_id, user_id) constraint refused a duplicate
		// registration; the buy-in was already taken above. Return it — a
		// double-click or a retried request must not pay twice for one entry.
		if bracket.BuyInMinor > 0 {
			refundTournamentBuyIn(ctx, logger, db, userID, req.TournamentID, bracket.BuyInMinor, "already registered")
		}
		return "", runtime.NewError("you are already registered for this tournament", 6)
	}
	// Arm this entrant's head bounty (funded from the buy-in) for a PKO event.
	if knockout && bounty > 0 {
		if err := store.NewBountyStore(db).SetBounty(ctx, req.TournamentID, userID, bounty); err != nil {
			logger.Error("bounty not armed tournament=%s user=%s amount_cents=%d: %v",
				req.TournamentID, userID, bounty, err)
		}
	}
	// Credit the club's rake balance for this entrant's share — the entry fee
	// plus the admin-fee percentage, via the SAME formula (TournamentPerEntryRake)
	// every other tournament-money figure uses. Registration debits the FULL
	// buy-in into house:tournament_buyin; nothing had ever pulled the club's
	// cut back out of it, so every "tournament fees" figure the dashboard
	// showed was a number with no corresponding ledger movement or club
	// balance behind it.
	if bracket.ClubID != "" {
		if rake := store.TournamentPerEntryRake(bracket); rake > 0 {
			if err := store.NewRakeStore(db).CreditTournament(ctx, bracket.ClubID, rake, req.TournamentID); err != nil {
				logger.Error("tournament rake not credited tournament=%s club=%s user=%s amount_cents=%d: %v",
					req.TournamentID, bracket.ClubID, userID, rake, err)
			} else if aerr := audit.EmitLedger(ctx, audit.NewPostgresEmitter(db), "tournament_rake_credited", bracket.ClubID, map[string]any{
				"tournament_id": req.TournamentID,
				"user_id":       userID,
				"amount_cents":  rake,
			}); aerr != nil {
				logger.Warn("tournament rake audit anchor failed: %v", aerr)
			}
		}
	}
	return `{"ok":true}`, nil
}

// refundTournamentBuyIn returns a tournament buy-in that was debited but could
// not be applied. Logged loudly on failure: a discarded refund error here means
// a player is out real money for an entry they never got, with no trace of why.
func refundTournamentBuyIn(ctx context.Context, logger runtime.Logger, db *sql.DB, userID, tournamentID string, amount int64, why string) {
	if err := store.NewWalletStore(db).Credit(ctx, userID, amount, "tournament_buyin_refund"); err != nil {
		logger.Error("REFUND FAILED tournament=%s user=%s amount_cents=%d reason=%s: %v",
			tournamentID, userID, amount, why, err)
	}
}

func BlindLevelAdd(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	var req models.BlindTimer
	if err := json.Unmarshal([]byte(payload), &req); err != nil {
		return "", runtime.NewError("invalid payload", 3)
	}
	if _, err := requireTournamentOwner(ctx, db, req.TournamentID); err != nil {
		return "", err
	}
	if req.DurationSecs == 0 {
		req.DurationSecs = 600
	}
	if err := store.NewTournamentStore(db).AddBlindLevel(ctx, &req); err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	out, _ := json.Marshal(req)
	return string(out), nil
}

func BlindLevelList(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	var req struct {
		TournamentID string `json:"tournament_id"`
	}
	if err := json.Unmarshal([]byte(payload), &req); err != nil {
		return "", runtime.NewError("invalid payload", 3)
	}
	levels, err := store.NewTournamentStore(db).ListBlinds(ctx, req.TournamentID)
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	out, _ := json.Marshal(map[string]interface{}{"levels": levels})
	return string(out), nil
}

func PrizePoolAdd(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	var req models.PrizeDistributionPool
	if err := json.Unmarshal([]byte(payload), &req); err != nil {
		return "", runtime.NewError("invalid payload", 3)
	}
	if _, err := requireTournamentOwner(ctx, db, req.TournamentID); err != nil {
		return "", err
	}
	ts := store.NewTournamentStore(db)
	// The ladder is real money: a tier that overlaps another or pushes the total
	// past 100% would pay out more than the tournament collected.
	existing, err := ts.ListPrizes(ctx, req.TournamentID)
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	if err := store.ValidatePrizeLadder(existing, &req); err != nil {
		return "", runtime.NewError(err.Error(), 3)
	}
	if err := ts.AddPrizeTier(ctx, &req); err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	out, _ := json.Marshal(req)
	return string(out), nil
}

func PrizePoolList(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	var req struct {
		TournamentID string `json:"tournament_id"`
	}
	if err := json.Unmarshal([]byte(payload), &req); err != nil {
		return "", runtime.NewError("invalid payload", 3)
	}
	prizes, err := store.NewTournamentStore(db).ListPrizes(ctx, req.TournamentID)
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	out, _ := json.Marshal(map[string]interface{}{"prizes": prizes})
	return string(out), nil
}

func BalancingRuleSet(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	var req models.MultiTableBalancingRule
	if err := json.Unmarshal([]byte(payload), &req); err != nil {
		return "", runtime.NewError("invalid payload", 3)
	}
	if _, err := requireTournamentOwner(ctx, db, req.TournamentID); err != nil {
		return "", err
	}
	if req.Strategy == "" {
		req.Strategy = "balanced"
	}
	if req.MaxSeatDifference == 0 {
		req.MaxSeatDifference = 1
	}
	if req.BreakTableAtOrBelow == 0 {
		req.BreakTableAtOrBelow = 2
	}
	if err := store.NewTournamentStore(db).SetBalancingRule(ctx, &req); err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	out, _ := json.Marshal(req)
	return string(out), nil
}

func TournamentStart(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	var req struct {
		TournamentID string `json:"tournament_id"`
	}
	if err := json.Unmarshal([]byte(payload), &req); err != nil {
		return "", runtime.NewError("invalid payload", 3)
	}
	if _, err := requireTournamentOwner(ctx, db, req.TournamentID); err != nil {
		return "", err
	}
	// Structure invariant (SEC-1 / P0-8): a tournament may only start with at
	// least one blind level and prize tiers that sum to exactly 100% (10000 bps).
	tStore := store.NewTournamentStore(db)
	blinds, err := tStore.ListBlinds(ctx, req.TournamentID)
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	if len(blinds) == 0 {
		return "", runtime.NewError("cannot start: no blind levels defined", 9)
	}
	prizes, err := tStore.ListPrizes(ctx, req.TournamentID)
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	var totalBps int32
	for _, p := range prizes {
		totalBps += p.PayoutBps
	}
	if totalBps != 10000 {
		return "", runtime.NewError(fmt.Sprintf("cannot start: prize tiers must total 100%% (10000 bps), got %d", totalBps), 9)
	}
	directorID, tables, err := tournament.StartTournament(ctx, nk, db, req.TournamentID)
	if err != nil {
		return "", err
	}
	out, _ := json.Marshal(map[string]interface{}{
		"director_match_id": directorID,
		"table_match_ids":   tables,
		"status":            "running",
	})
	return string(out), nil
}
