package holdem

import (
	"context"
	"database/sql"

	"github.com/heroiclabs/nakama-common/runtime"

	"github.com/smithdouglas404/poker-next-gen/backend-core/poker"
	"github.com/smithdouglas404/poker-next-gen/backend-core/store"
)

// playerHandTrack accumulates one player's actions within a single hand so the
// settlement path can derive VPIP / PFR / aggression without re-reading history.
type playerHandTrack struct {
	VPIP       bool // voluntarily put money in preflop (call/raise, not a blind)
	PFR        bool // raised (or shoved) preflop
	BetsRaises int  // aggressive actions across all streets (the "AF" numerator)
	Calls      int  // calls across all streets (the "AF" denominator)
}

// trackAction folds one applied action into the actor's per-hand tracker. Called
// for every human and bot action (after it is applied); a no-op before a hand
// has initialised the tracker. Blinds are posted outside ApplyAction, so a
// preflop call/raise here is by definition voluntary.
func trackAction(s *MatchState, userID, action string) {
	if s.HandTrack == nil || userID == "" {
		return
	}
	tr := s.HandTrack[userID]
	if tr == nil {
		tr = &playerHandTrack{}
		s.HandTrack[userID] = tr
	}
	preflop := s.Table.Street == poker.StreetPreflop
	switch action {
	case "call":
		tr.Calls++
		if preflop {
			tr.VPIP = true
		}
	case "raise", "bet", "all_in":
		tr.BetsRaises++
		if preflop {
			tr.VPIP = true
			tr.PFR = true
		}
	}
}

// attributeHand persists per-player analytics (poker_hand_stats), the searchable
// hand-index row (poker_hand_index), and fans out mission progress at
// showdown/settlement. Strictly best-effort: every failure is logged and
// swallowed so a live hand is never disrupted. Reads seat state BEFORE
// ResetBetweenHands clears it.
func attributeHand(ctx context.Context, logger runtime.Logger, db *sql.DB, s *MatchState, res poker.ShowdownResult, plan poker.ShowdownPlan, potBefore int64) {
	ss := store.NewStatsStore(db)
	ms := store.NewMissionStore(db)
	matchID := matchIDForAudit(s)
	handNo := s.Table.HandNo
	contested := plan.UncontestedWinner < 0
	streetReached := len(plan.Board)

	// Winnings + winner set per seat, derived from the resolved side pots.
	winBySeat := map[int]int64{}
	winnerSeatSet := map[int]bool{}
	for _, r := range res.Resolutions {
		if len(r.Winners) == 0 || r.Amount <= 0 {
			continue
		}
		share := r.Amount / int64(len(r.Winners))
		for _, seat := range r.Winners {
			winBySeat[seat] += share
			winnerSeatSet[seat] = true
		}
	}

	// A seat "was dealt in" this hand iff it holds hole cards in the plan snapshot.
	dealtIn := func(userID string) bool { return len(plan.HoleCards[userID]) > 0 }

	// Hand-index membership (everyone dealt in) and the winning-seat list.
	userIDs := []string{}
	for _, seat := range s.Table.Seats {
		if seat == nil || seat.UserID == "" {
			continue
		}
		if dealtIn(seat.UserID) {
			userIDs = append(userIDs, seat.UserID)
		}
	}
	winnerSeats := []int{}
	for seat := range winnerSeatSet {
		winnerSeats = append(winnerSeats, seat)
	}

	if err := ss.SaveHandIndex(ctx, store.HandIndexInsert{
		MatchID:     matchID,
		RoomID:      s.RoomID,
		TableLabel:  buildLabel(s),
		HandNo:      handNo,
		UserIDs:     userIDs,
		WinnerSeats: winnerSeats,
		Pot:         potBefore,
		DeckCommit:  plan.DeckCommitment,
	}); err != nil {
		logger.Warn("attributeHand index (%s#%d): %v", matchID, handNo, err)
	}

	// Per-human-player stat rows + mission progress.
	for i, seat := range s.Table.Seats {
		if seat == nil || seat.IsBot || seat.UserID == "" || !dealtIn(seat.UserID) {
			continue
		}
		tr := s.HandTrack[seat.UserID]
		if tr == nil {
			tr = &playerHandTrack{}
		}
		won := winnerSeatSet[i]
		wentToShowdown := contested && seat.Status != poker.SeatFolded
		if err := ss.SaveHandStat(ctx, store.HandStatRow{
			UserID:            seat.UserID,
			ClubID:            s.ClubID,
			MatchID:           matchID,
			HandNo:            handNo,
			VPIP:              tr.VPIP,
			PFR:               tr.PFR,
			WentToShowdown:    wentToShowdown,
			Won:               won,
			NetCents:          winBySeat[i] - seat.TotalContributed,
			ContributionCents: seat.TotalContributed,
			StreetReached:     streetReached,
			BetsRaises:        tr.BetsRaises,
			Calls:             tr.Calls,
		}); err != nil {
			logger.Warn("attributeHand stat (%s %s#%d): %v", seat.UserID, matchID, handNo, err)
		}

		// Mission progress (best-effort): played / vpip / won / showdown-won.
		_ = ms.AccrueByMetric(ctx, seat.UserID, "hands_played", 1)
		if tr.VPIP {
			_ = ms.AccrueByMetric(ctx, seat.UserID, "vpip_hands", 1)
		}
		if won {
			_ = ms.AccrueByMetric(ctx, seat.UserID, "hands_won", 1)
			if wentToShowdown {
				_ = ms.AccrueByMetric(ctx, seat.UserID, "showdowns_won", 1)
			}
		}
	}
}
