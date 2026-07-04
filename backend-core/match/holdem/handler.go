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
	Table      *poker.Table
	MatchID    string
	RoomID     string
	ClubID     string
	SmallBlind int64
	BigBlind   int64
	BuyIn      int64
	Presences  map[string]runtime.Presence
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

	state := &MatchState{
		Table:      poker.NewTable(),
		RoomID:     roomID,
		ClubID:     clubID,
		SmallBlind: sb,
		BigBlind:   bb,
		BuyIn:      buyIn,
		Presences:  map[string]runtime.Presence{},
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
	broadcastSnapshot(dispatcher, s, nil)
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
	broadcastSnapshot(dispatcher, s, nil)
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
			buyIn := s.BuyIn
			if req.BuyIn > 0 {
				buyIn = req.BuyIn
			}
			if err := reserveBuyIn(ctx, db, s.ClubID, userID, buyIn); err != nil {
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
			broadcastSnapshot(dispatcher, s, nil)

		case protocol.OpStandUp:
			for i, seat := range s.Table.Seats {
				if seat != nil && seat.UserID == userID {
					releaseBuyIn(ctx, db, s.ClubID, userID, seat.Stack)
					s.Table.StandUp(i)
					break
				}
			}
			dispatcher.MatchLabelUpdate(buildLabel(s))
			broadcastSnapshot(dispatcher, s, nil)

		case protocol.OpStartHand:
			if s.Table.SeatedCount() >= 2 && s.Table.Street == poker.StreetWaiting {
				s.Table.StartHand(s.SmallBlind, s.BigBlind)
				broadcastHandStart(dispatcher, s)
				dealPrivateCards(dispatcher, s)
				broadcastActionRequired(dispatcher, s)
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
			broadcastSnapshot(dispatcher, s, nil)

			if winner, uncontested := s.Table.UncontestedWinner(); uncontested {
				winners := []int{winner}
				potBefore := s.Table.Pot
				poker.AwardPot(s.Table, winners)
				broadcastShowdown(dispatcher, s, winners, potBefore)
				applyRake(ctx, db, s, potBefore)
				s.Table.ResetBetweenHands()
				continue
			}

			showdown := s.Table.AdvanceAction()
			if showdown {
				potBefore := s.Table.Pot
				winners := s.Table.ResolveAndAward()
				broadcastShowdown(dispatcher, s, winners, potBefore)
				applyRake(ctx, db, s, potBefore)
				s.Table.ResetBetweenHands()
			} else if s.Table.Street != poker.StreetPreflop || len(s.Table.Board) > 0 {
				if len(s.Table.Board) > 0 {
					broadcastBoard(dispatcher, s)
				}
				broadcastActionRequired(dispatcher, s)
			} else {
				broadcastActionRequired(dispatcher, s)
			}
		}
	}
	return s
}

func reserveBuyIn(ctx context.Context, db *sql.DB, clubID, userID string, amount int64) error {
	if clubID != "" {
		return store.NewClubStore(db).LockBalance(ctx, clubID, userID, amount)
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

func applyRake(ctx context.Context, db *sql.DB, s *MatchState, pot int64) {
	if s.ClubID == "" || pot <= 0 {
		return
	}
	rake, err := store.NewClubStore(db).GetRake(ctx, s.ClubID)
	if err != nil || rake == nil {
		return
	}
	rakeAmount := pot * int64(rake.PercentBps) / 10000
	if rake.CapMinor > 0 && rakeAmount > rake.CapMinor {
		rakeAmount = rake.CapMinor
	}
	if rakeAmount <= 0 {
		return
	}
	// Rake stays in club ledger as house revenue (no player credit)
	_ = rakeAmount
}

func (h *Handler) MatchTerminate(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, dispatcher runtime.MatchDispatcher, tick int64, state interface{}, graceSeconds int) interface{} {
	return state
}

func (h *Handler) MatchSignal(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, dispatcher runtime.MatchDispatcher, tick int64, state interface{}, data string) (interface{}, string) {
	return state, ""
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

func snapshotFor(s *MatchState, heroID string) protocol.TableSnapshot {
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
		HandNo:     s.Table.HandNo,
	}
}

func broadcastSnapshot(dispatcher runtime.MatchDispatcher, s *MatchState, sender runtime.Presence) {
	for userID, p := range s.Presences {
		snap := snapshotFor(s, userID)
		data, _ := json.Marshal(snap)
		_ = dispatcher.BroadcastMessage(protocol.OpSnapshot, data, []runtime.Presence{p}, sender, true)
	}
}

func broadcastHandStart(dispatcher runtime.MatchDispatcher, s *MatchState) {
	payload, _ := json.Marshal(snapshotFor(s, ""))
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

func broadcastActionRequired(dispatcher runtime.MatchDispatcher, s *MatchState) {
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
	broadcastSnapshot(dispatcher, s, nil)
}

func broadcastShowdown(dispatcher runtime.MatchDispatcher, s *MatchState, winners []int, pot int64) {
	reveal := map[string][]protocol.CardView{}
	for userID, cards := range s.Table.HoleCards {
		reveal[userID] = []protocol.CardView{
			{Code: cards[0].Code(), FaceUp: true},
			{Code: cards[1].Code(), FaceUp: true},
		}
	}
	winnerViews := make([]map[string]interface{}, 0, len(winners))
	for _, seat := range winners {
		if s.Table.Seats[seat] == nil {
			continue
		}
		userID := s.Table.Seats[seat].UserID
		hole := s.Table.HoleCards[userID]
		ev := poker.BestHand(hole[:], s.Table.Board)
		winnerViews = append(winnerViews, map[string]interface{}{
			"seat":     seat,
			"user_id":  s.Table.Seats[seat].UserID,
			"username": s.Table.Seats[seat].Username,
			"hand":     ev.Category,
		})
	}
	data, _ := json.Marshal(map[string]interface{}{
		"pot":      pot,
		"hands":    reveal,
		"winners":  winnerViews,
	})
	_ = dispatcher.BroadcastMessage(protocol.OpShowdown, data, nil, nil, true)
	broadcastSnapshot(dispatcher, s, nil)
}

func sendError(dispatcher runtime.MatchDispatcher, p runtime.Presence, code, message string) {
	data, _ := json.Marshal(protocol.ErrorMessage{Code: code, Message: message})
	_ = dispatcher.BroadcastMessage(protocol.OpError, data, []runtime.Presence{p}, nil, true)
}
