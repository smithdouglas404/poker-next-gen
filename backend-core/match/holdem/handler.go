package holdem

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"

	"github.com/heroiclabs/nakama-common/runtime"

	"github.com/smithdouglas404/poker-next-gen/backend-core/poker"
	"github.com/smithdouglas404/poker-next-gen/backend-core/protocol"
	"github.com/smithdouglas404/poker-next-gen/backend-core/store"
)

type MatchState struct {
	Table        *poker.Table
	MatchID      string
	RoomID       string
	ClubID       string
	TournamentID string
	SmallBlind   int64
	BigBlind     int64
	Ante         int64
	BuyIn        int64
	Presences    map[string]runtime.Presence
}

type Handler struct{}

func (h *Handler) MatchInit(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, params map[string]interface{}) (interface{}, int, string) {
	sb := int64(100)
	bb := int64(200)
	buyIn := int64(100000)
	roomID := "room"
	clubID := ""
	if v, ok := params["small_blind"].(float64); ok {
		sb = int64(v)
	}
	if v, ok := params["big_blind"].(float64); ok {
		bb = int64(v)
	}
	if v, ok := params["buy_in"].(float64); ok {
		buyIn = int64(v)
	}
	if v, ok := params["room_id"].(string); ok {
		roomID = v
	}
	if v, ok := params["club_id"].(string); ok {
		clubID = v
	}
	tournamentID := ""
	if v, ok := params["tournament_id"].(string); ok {
		tournamentID = v
	}

	state := &MatchState{
		Table:        poker.NewTable(),
		RoomID:       roomID,
		ClubID:       clubID,
		TournamentID: tournamentID,
		SmallBlind:   sb,
		BigBlind:     bb,
		BuyIn:        buyIn,
		Presences:    map[string]runtime.Presence{},
	}
	label := buildLabel(state)
	return state, 1, label
}

func (h *Handler) MatchJoinAttempt(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, dispatcher runtime.MatchDispatcher, tick int64, state interface{}, presence runtime.Presence, metadata map[string]string) (interface{}, bool, string) {
	return state, true, ""
}

func (h *Handler) MatchJoin(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, dispatcher runtime.MatchDispatcher, tick int64, state interface{}, presences []runtime.Presence) interface{} {
	s := state.(*MatchState)
	for _, p := range presences {
		s.Presences[p.GetUserId()] = p
	}
	broadcastSnapshot(ctx, db, dispatcher, s, nil)
	return s
}

func (h *Handler) MatchLeave(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, dispatcher runtime.MatchDispatcher, tick int64, state interface{}, presences []runtime.Presence) interface{} {
	s := state.(*MatchState)
	for _, p := range presences {
		delete(s.Presences, p.GetUserId())
		for i, seat := range s.Table.Seats {
			if seat != nil && seat.UserID == p.GetUserId() {
				s.Table.StandUp(i)
			}
		}
	}
	dispatcher.MatchLabelUpdate(buildLabel(s))
	broadcastSnapshot(ctx, db, dispatcher, s, nil)
	return s
}

func (h *Handler) MatchLoop(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, dispatcher runtime.MatchDispatcher, tick int64, state interface{}, messages []runtime.MatchData) interface{} {
	s := state.(*MatchState)

	for _, msg := range messages {
		userID := msg.GetUserId()
		presence, ok := s.Presences[userID]
		if !ok {
			continue
		}
		switch msg.GetOpCode() {
		case protocol.OpSitDown:
			var req protocol.SitDownRequest
			if err := json.Unmarshal(msg.GetData(), &req); err != nil {
				sendError(dispatcher, presence, "invalid_payload", err.Error())
				continue
			}
			buyIn := poker.ClampBuyIn(s.BuyIn)
			if req.BuyIn > 0 {
				buyIn = poker.ClampBuyIn(req.BuyIn)
			}
			if err := reserveBuyIn(ctx, db, s, userID, buyIn); err != nil {
				sendError(dispatcher, presence, "buy_in_failed", err.Error())
				continue
			}
			username := presence.GetUsername()
			if username == "" {
				username = fmt.Sprintf("Player_%s", userID[:4])
			}
			if err := s.Table.SitDown(req.Seat, userID, username, buyIn); err != nil {
				releaseBuyIn(ctx, db, s.ClubID, userID, buyIn)
				sendError(dispatcher, presence, "sit_failed", err.Error())
				continue
			}
			dispatcher.MatchLabelUpdate(buildLabel(s))
			broadcastSnapshot(ctx, db, dispatcher, s, nil)

		case protocol.OpStandUp:
			for i, seat := range s.Table.Seats {
				if seat != nil && seat.UserID == userID {
					releaseBuyIn(ctx, db, s.ClubID, userID, seat.Stack)
					s.Table.StandUp(i)
					break
				}
			}
			dispatcher.MatchLabelUpdate(buildLabel(s))
			broadcastSnapshot(ctx, db, dispatcher, s, nil)

		case protocol.OpStartHand:
			if s.Table.SeatedCount() >= 2 && s.Table.Street == poker.StreetWaiting {
				s.Table.StartHand(s.SmallBlind, s.BigBlind)
				broadcastHandStart(ctx, db, dispatcher, s)
				dealPrivateCards(dispatcher, s)
				broadcastActionRequired(ctx, db, dispatcher, s)
			}

		case protocol.OpAction:
			var req protocol.ActionRequest
			if err := json.Unmarshal(msg.GetData(), &req); err != nil {
				sendError(dispatcher, presence, "invalid_payload", err.Error())
				continue
			}
			seatIdx := seatForUser(s, userID)
			if seatIdx < 0 {
				continue
			}
			if err := s.Table.ApplyAction(seatIdx, req.Type, req.Amount); err != nil {
				sendError(dispatcher, presence, "action_failed", err.Error())
				continue
			}
			broadcastSnapshot(ctx, db, dispatcher, s, nil)

			if winner, uncontested := s.Table.UncontestedWinner(); uncontested {
				winners := [][]int{{winner}}
				potBefore := s.Table.Pot
				poker.AwardSidePots(s.Table)
				broadcastShowdown(ctx, db, dispatcher, s, winners, potBefore)
				creditRake(ctx, db, s, potBefore)
				s.Table.ResetBetweenHands()
				reportTournamentBusts(ctx, db, nk, s)
				continue
			}

			showdown := s.Table.AdvanceAction()
			if showdown {
				potBefore := s.Table.Pot
				winners := s.Table.ResolveAndAward()
				broadcastShowdown(ctx, db, dispatcher, s, winners, potBefore)
				creditRake(ctx, db, s, potBefore)
				s.Table.ResetBetweenHands()
				reportTournamentBusts(ctx, db, nk, s)
			} else if s.Table.Street != poker.StreetPreflop || len(s.Table.Board) > 0 {
				if len(s.Table.Board) > 0 {
					broadcastBoard(dispatcher, s)
				}
				broadcastActionRequired(ctx, db, dispatcher, s)
			} else {
				broadcastActionRequired(ctx, db, dispatcher, s)
			}
		}
	}
	return s
}

func reserveBuyIn(ctx context.Context, db *sql.DB, s *MatchState, userID string, amount int64) error {
	amount = poker.ClampBuyIn(amount)
	if s.TournamentID != "" {
		return nil
	}
	if s.ClubID != "" {
		return store.NewClubStore(db).LockBalance(ctx, s.ClubID, userID, amount)
	}
	return store.NewWalletStore(db).Debit(ctx, userID, amount)
}

func releaseBuyIn(ctx context.Context, db *sql.DB, clubID, userID string, amount int64) {
	if amount <= 0 {
		return
	}
	if clubID != "" {
		_ = store.NewClubStore(db).UnlockBalance(ctx, clubID, userID, amount)
		return
	}
	_ = store.NewWalletStore(db).Credit(ctx, userID, amount)
}

func creditRake(ctx context.Context, db *sql.DB, s *MatchState, pot int64) {
	if s.ClubID == "" || pot <= 0 {
		return
	}
	rake, err := store.NewClubStore(db).GetRake(ctx, s.ClubID)
	if err != nil || rake == nil {
		return
	}
	if rake.NoFlopNoDrop && len(s.Table.Board) == 0 {
		return
	}
	if pot < rake.MinPotMinor {
		return
	}
	rakeAmount := pot * int64(rake.PercentBps) / 10000
	if rake.CapMinor > 0 && rakeAmount > rake.CapMinor {
		rakeAmount = rake.CapMinor
	}
	if rakeAmount <= 0 {
		return
	}
	_ = store.NewRakeStore(db).Credit(ctx, s.ClubID, rakeAmount, s.MatchID, s.Table.HandNo)
}

func reportTournamentBusts(ctx context.Context, db *sql.DB, nk runtime.NakamaModule, s *MatchState) {
	if s.TournamentID == "" {
		return
	}
	tStore := store.NewTournamentStore(db)
	for _, seat := range s.Table.Seats {
		if seat == nil {
			continue
		}
		if seat.Stack <= 0 {
			_ = tStore.MarkBusted(ctx, s.TournamentID, seat.UserID)
		} else {
			_ = tStore.UpdatePlayerStack(ctx, s.TournamentID, seat.UserID, seat.Stack)
		}
	}
}

func (h *Handler) MatchTerminate(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, dispatcher runtime.MatchDispatcher, tick int64, state interface{}, graceSeconds int) interface{} {
	return state
}

func (h *Handler) MatchSignal(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, dispatcher runtime.MatchDispatcher, tick int64, state interface{}, data string) (interface{}, string) {
	s := state.(*MatchState)
	var sig map[string]interface{}
	if err := json.Unmarshal([]byte(data), &sig); err != nil {
		return s, ""
	}
	switch sig["type"] {
	case "blind_update":
		if v, ok := sig["small_blind"].(float64); ok {
			s.SmallBlind = int64(v)
		}
		if v, ok := sig["big_blind"].(float64); ok {
			s.BigBlind = int64(v)
		}
		if v, ok := sig["ante"].(float64); ok {
			s.Ante = int64(v)
		}
		payload, _ := json.Marshal(map[string]interface{}{
			"small_blind": s.SmallBlind,
			"big_blind":   s.BigBlind,
			"ante":        s.Ante,
			"level":       sig["level"],
		})
		_ = dispatcher.BroadcastMessage(protocol.OpBlindUpdate, payload, nil, nil, true)
	case "balance_table":
		// Director requests table to stand busted players before next hand.
		for i, seat := range s.Table.Seats {
			if seat != nil && seat.Stack <= 0 {
				s.Table.StandUp(i)
			}
		}
		broadcastSnapshot(ctx, db, dispatcher, s, nil)
	}
	return s, ""
}

func seatForUser(s *MatchState, userID string) int {
	for i, seat := range s.Table.Seats {
		if seat != nil && seat.UserID == userID {
			return i
		}
	}
	return -1
}

func buildLabel(s *MatchState) string {
	seated := s.Table.SeatedCount()
	label, _ := json.Marshal(map[string]interface{}{
		"module":     protocol.MatchModule,
		"room_id":    s.RoomID,
		"seated":     seated,
		"open_seats": protocol.MaxSeats - seated,
		"sb":         s.SmallBlind,
		"bb":         s.BigBlind,
		"status":     string(s.Table.Street),
	})
	return string(label)
}

func snapshotFor(ctx context.Context, db *sql.DB, s *MatchState, heroID string) protocol.TableSnapshot {
	seats := make([]protocol.SeatView, protocol.MaxSeats)
	for i := 0; i < protocol.MaxSeats; i++ {
		seats[i] = protocol.SeatView{Index: i, Status: "empty"}
		if s.Table.Seats[i] != nil {
			seat := s.Table.Seats[i]
			seats[i] = protocol.SeatView{
				Index:      i,
				UserID:     seat.UserID,
				Username:   seat.Username,
				Stack:      seat.Stack,
				Status:     string(seat.Status),
				LastAction: seat.LastAction,
				IsHero:     seat.UserID == heroID,
			}
		}
	}
	board := make([]protocol.CardView, 0, len(s.Table.Board))
	for _, c := range s.Table.Board {
		board = append(board, protocol.CardView{Code: c.Code(), FaceUp: true})
	}
	heroWallet, _ := store.NewWalletStore(db).Get(ctx, heroID)
	return protocol.TableSnapshot{
		MatchID:    s.MatchID,
		RoomID:     s.RoomID,
		Phase:      string(s.Table.Street),
		Seats:      seats,
		Board:      board,
		Pot:        s.Table.Pot,
		CurrentBet: s.Table.CurrentBet,
		ActionSeat: s.Table.ActionSeat,
		ButtonSeat: s.Table.ButtonSeat,
		SmallBlind: s.SmallBlind,
		BigBlind:   s.BigBlind,
		HeroWallet: heroWallet,
		HandNo:     s.Table.HandNo,
	}
}

func broadcastSnapshot(ctx context.Context, db *sql.DB, dispatcher runtime.MatchDispatcher, s *MatchState, sender runtime.Presence) {
	for userID, p := range s.Presences {
		snap := snapshotFor(ctx, db, s, userID)
		data, _ := json.Marshal(snap)
		_ = dispatcher.BroadcastMessage(protocol.OpSnapshot, data, []runtime.Presence{p}, sender, true)
	}
}

func broadcastHandStart(ctx context.Context, db *sql.DB, dispatcher runtime.MatchDispatcher, s *MatchState) {
	payload, _ := json.Marshal(snapshotFor(ctx, db, s, ""))
	_ = dispatcher.BroadcastMessage(protocol.OpHandStart, payload, nil, nil, true)
}

func dealPrivateCards(dispatcher runtime.MatchDispatcher, s *MatchState) {
	for userID, cards := range s.Table.HoleCards {
		p, ok := s.Presences[userID]
		if !ok {
			continue
		}
		seat := seatForUser(s, userID)
		msg := protocol.DealPrivateMessage{
			Seat: seat,
			Cards: []protocol.CardView{
				{Code: cards[0].Code(), FaceUp: true},
				{Code: cards[1].Code(), FaceUp: true},
			},
		}
		data, _ := json.Marshal(msg)
		_ = dispatcher.BroadcastMessage(protocol.OpDealPrivate, data, []runtime.Presence{p}, nil, true)
	}
}

func broadcastBoard(dispatcher runtime.MatchDispatcher, s *MatchState) {
	board := make([]protocol.CardView, 0, len(s.Table.Board))
	for _, c := range s.Table.Board {
		board = append(board, protocol.CardView{Code: c.Code(), FaceUp: true})
	}
	data, _ := json.Marshal(map[string]interface{}{"board": board, "phase": s.Table.Street})
	_ = dispatcher.BroadcastMessage(protocol.OpBoard, data, nil, nil, true)
}

func broadcastActionRequired(ctx context.Context, db *sql.DB, dispatcher runtime.MatchDispatcher, s *MatchState) {
	seat := s.Table.ActionSeat
	if seat < 0 {
		return
	}
	seatData := s.Table.Seats[seat]
	if seatData == nil {
		return
	}
	actions, toCall, minRaise, maxRaise := s.Table.ValidActions(seat)
	msg := protocol.ActionRequiredMessage{
		Seat:         seat,
		ValidActions: actions,
		ToCall:       toCall,
		MinRaise:     minRaise,
		MaxRaise:     maxRaise,
		Pot:          s.Table.Pot,
	}
	data, _ := json.Marshal(msg)
	p, ok := s.Presences[seatData.UserID]
	if ok {
		_ = dispatcher.BroadcastMessage(protocol.OpActionRequired, data, []runtime.Presence{p}, nil, true)
	}
	broadcastSnapshot(ctx, db, dispatcher, s, nil)
}

func broadcastShowdown(ctx context.Context, db *sql.DB, dispatcher runtime.MatchDispatcher, s *MatchState, winnerGroups [][]int, pot int64) {
	reveal := map[string][]protocol.CardView{}
	for userID, cards := range s.Table.HoleCards {
		reveal[userID] = []protocol.CardView{
			{Code: cards[0].Code(), FaceUp: true},
			{Code: cards[1].Code(), FaceUp: true},
		}
	}
	winnerViews := make([]map[string]interface{}, 0)
	for potIdx, group := range winnerGroups {
		for _, seat := range group {
			if s.Table.Seats[seat] == nil {
				continue
			}
			winnerViews = append(winnerViews, map[string]interface{}{
				"seat":     seat,
				"pot":      potIdx,
				"user_id":  s.Table.Seats[seat].UserID,
				"username": s.Table.Seats[seat].Username,
				"hand":     poker.HandCategory(seat, s.Table),
				"engine":   "rs_poker",
			})
		}
	}
	data, _ := json.Marshal(map[string]interface{}{
		"pot":      pot,
		"hands":    reveal,
		"winners":  winnerViews,
		"side_pots": len(winnerGroups),
	})
	_ = dispatcher.BroadcastMessage(protocol.OpShowdown, data, nil, nil, true)
	broadcastSnapshot(ctx, db, dispatcher, s, nil)
}

func sendError(dispatcher runtime.MatchDispatcher, p runtime.Presence, code, message string) {
	data, _ := json.Marshal(protocol.ErrorMessage{Code: code, Message: message})
	_ = dispatcher.BroadcastMessage(protocol.OpError, data, []runtime.Presence{p}, nil, true)
}
