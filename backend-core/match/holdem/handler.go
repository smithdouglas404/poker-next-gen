package holdem

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"

	"github.com/heroiclabs/nakama-common/runtime"

	"github.com/smithdouglas404/poker-next-gen/backend-core/poker"
	"github.com/smithdouglas404/poker-next-gen/backend-core/protocol"
)

type MatchState struct {
	Table      *poker.Table
	MatchID    string
	RoomID     string
	SmallBlind int64
	BigBlind   int64
	BuyIn      int64
	Presences  map[string]runtime.Presence
}

type Handler struct{}

func (h *Handler) MatchInit(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, params map[string]interface{}) (interface{}, int, string) {
	sb := int64(100)
	bb := int64(200)
	buyIn := int64(100000) // $1,000.00 in cents
	roomID := "room"
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

	state := &MatchState{
		Table:      poker.NewTable(),
		RoomID:     roomID,
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
			username := presence.GetUsername()
			if username == "" {
				username = fmt.Sprintf("Player_%s", userID[:4])
			}
			if err := s.Table.SitDown(req.Seat, userID, username, buyIn); err != nil {
				sendError(dispatcher, presence, "sit_failed", err.Error())
				continue
			}
			dispatcher.MatchLabelUpdate(buildLabel(s))
			broadcastSnapshot(dispatcher, s, nil)

		case protocol.OpStandUp:
			for i, seat := range s.Table.Seats {
				if seat != nil && seat.UserID == userID {
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
			showdown := s.Table.AdvanceAction()
			if showdown {
				broadcastShowdown(dispatcher, s)
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
	// Also broadcast public snapshot so everyone sees whose turn
	broadcastSnapshot(dispatcher, s, nil)
}

func broadcastShowdown(dispatcher runtime.MatchDispatcher, s *MatchState) {
	reveal := map[string][]protocol.CardView{}
	for userID, cards := range s.Table.HoleCards {
		reveal[userID] = []protocol.CardView{
			{Code: cards[0].Code(), FaceUp: true},
			{Code: cards[1].Code(), FaceUp: true},
		}
	}
	data, _ := json.Marshal(map[string]interface{}{
		"pot":   s.Table.Pot,
		"hands": reveal,
	})
	_ = dispatcher.BroadcastMessage(protocol.OpShowdown, data, nil, nil, true)
}

func sendError(dispatcher runtime.MatchDispatcher, p runtime.Presence, code, message string) {
	data, _ := json.Marshal(protocol.ErrorMessage{Code: code, Message: message})
	_ = dispatcher.BroadcastMessage(protocol.OpError, data, []runtime.Presence{p}, nil, true)
}
