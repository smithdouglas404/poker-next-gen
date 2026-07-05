package poker

import (
	"fmt"
)

type Card struct {
	Rank int // 2-14 (Ace=14)
	Suit int // 0-3
}

func (c Card) Code() string {
	ranks := map[int]string{14: "A", 13: "K", 12: "Q", 11: "J", 10: "T"}
	r := ranks[c.Rank]
	if r == "" {
		r = fmt.Sprintf("%d", c.Rank)
	}
	suits := []string{"s", "h", "d", "c"}
	return r + suits[c.Suit]
}

func NewDeck() ([]Card, string, []string, error) {
	return NewSecureDeck()
}

const MaxSeats = 6

type SeatStatus string

const (
	SeatEmpty   SeatStatus = "empty"
	SeatSeated  SeatStatus = "seated"
	SeatFolded  SeatStatus = "folded"
	SeatAllIn   SeatStatus = "all_in"
)

type Seat struct {
	Index            int
	UserID           string
	Username         string
	Stack            int64
	Bet              int64
	TotalContributed int64
	Status           SeatStatus
	LastAction       string
	IsBot            bool
}

type Street string

const (
	StreetWaiting Street = "waiting"
	StreetPreflop Street = "preflop"
	StreetFlop    Street = "flop"
	StreetTurn    Street = "turn"
	StreetRiver   Street = "river"
	StreetShowdown Street = "showdown"
)

type Table struct {
	Seats          [MaxSeats]*Seat
	Deck           []Card
	DeckOrder      []string
	DeckCommitment string
	Board          []Card
	HoleCards   map[string][2]Card
	Pot         int64
	CurrentBet  int64
	MinRaise    int64
	Street      Street
	ButtonSeat  int
	ActionSeat  int
	HandNo      int
	ActedThisRound map[int]bool
}

func NewTable() *Table {
	return &Table{
		HoleCards:      map[string][2]Card{},
		ActedThisRound: map[int]bool{},
		Street:         StreetWaiting,
	}
}

func (t *Table) SeatedCount() int {
	n := 0
	for _, s := range t.Seats {
		if s != nil && s.Status != SeatEmpty {
			n++
		}
	}
	return n
}

func (t *Table) SitDown(seat int, userID, username string, buyIn int64) error {
	if seat < 0 || seat >= MaxSeats {
		return fmt.Errorf("invalid seat")
	}
	if t.Seats[seat] != nil {
		return fmt.Errorf("seat taken")
	}
	buyIn = ClampBuyIn(buyIn)
	t.Seats[seat] = &Seat{
		Index:    seat,
		UserID:   userID,
		Username: username,
		Stack:    buyIn,
		Status:   SeatSeated,
	}
	return nil
}

func (t *Table) StandUp(seat int) {
	if seat >= 0 && seat < MaxSeats {
		t.Seats[seat] = nil
	}
}

// SitDownBot seats an AI player (no wallet debit; not tied to a presence).
func (t *Table) SitDownBot(seat int, userID, username string, buyIn int64) error {
	if err := t.SitDown(seat, userID, username, buyIn); err != nil {
		return err
	}
	t.Seats[seat].IsBot = true
	return nil
}

// FirstEmptySeat returns the lowest empty seat index, or -1 if the table is full.
func (t *Table) FirstEmptySeat() int {
	for i := 0; i < MaxSeats; i++ {
		if t.Seats[i] == nil {
			return i
		}
	}
	return -1
}

func (t *Table) StartHand(sb, bb int64) error {
	t.HandNo++
	deck, deckHash, deckOrder, err := NewDeck()
	if err != nil {
		return err
	}
	t.Deck = deck
	t.DeckOrder = deckOrder
	t.DeckCommitment = deckHash
	t.Board = nil
	t.HoleCards = map[string][2]Card{}
	t.Pot = 0
	t.CurrentBet = bb
	t.MinRaise = bb
	t.Street = StreetPreflop
	t.ActedThisRound = map[int]bool{}

	// Find button with at least 2 seated
	seated := t.seatedIndices()
	if len(seated) < 2 {
		t.Street = StreetWaiting
		return nil
	}
	if t.ButtonSeat == 0 && t.HandNo == 1 {
		t.ButtonSeat = seated[0]
	} else {
		t.ButtonSeat = t.nextSeated(t.ButtonSeat)
	}

	// Deal hole cards
	for _, idx := range seated {
		s := t.Seats[idx]
		c1 := t.draw()
		c2 := t.draw()
		t.HoleCards[s.UserID] = [2]Card{c1, c2}
		s.Status = SeatSeated
		s.Bet = 0
		s.LastAction = ""
	}

	// Post blinds
	sbSeat := t.nextSeated(t.ButtonSeat)
	bbSeat := t.nextSeated(sbSeat)
	t.postBlind(sbSeat, sb, "SB")
	t.postBlind(bbSeat, bb, "BB")
	t.ActionSeat = t.nextActiveSeat(bbSeat)
	return nil
}

func (t *Table) addContribution(seat int, amount int64) {
	if amount <= 0 {
		return
	}
	t.Pot += amount
	if t.Seats[seat] != nil {
		t.Seats[seat].TotalContributed += amount
	}
}

func (t *Table) postBlind(seat int, amount int64, label string) {
	s := t.Seats[seat]
	if s == nil {
		return
	}
	pay := amount
	if pay > s.Stack {
		pay = s.Stack
	}
	s.Stack -= pay
	s.Bet = pay
	t.addContribution(seat, pay)
	s.LastAction = label
}

func (t *Table) draw() Card {
	c := t.Deck[0]
	t.Deck = t.Deck[1:]
	return c
}

func (t *Table) seatedIndices() []int {
	out := []int{}
	for i, s := range t.Seats {
		if s != nil && s.Status != SeatEmpty {
			out = append(out, i)
		}
	}
	return out
}

func (t *Table) nextSeated(from int) int {
	for i := 1; i <= MaxSeats; i++ {
		idx := (from + i) % MaxSeats
		if t.Seats[idx] != nil {
			return idx
		}
	}
	return from
}

func (t *Table) nextActiveSeat(from int) int {
	for i := 1; i <= MaxSeats; i++ {
		idx := (from + i) % MaxSeats
		s := t.Seats[idx]
		if s != nil && s.Status == SeatSeated && s.Stack > 0 {
			return idx
		}
	}
	return -1
}

func (t *Table) activeCount() int {
	n := 0
	for _, s := range t.Seats {
		if s != nil && (s.Status == SeatSeated || s.Status == SeatAllIn) {
			n++
		}
	}
	return n
}

func (t *Table) ApplyAction(seat int, action string, amount int64) error {
	s := t.Seats[seat]
	if s == nil || seat != t.ActionSeat {
		return fmt.Errorf("not your turn")
	}
	toCall := t.CurrentBet - s.Bet
	switch action {
	case "fold":
		s.Status = SeatFolded
		s.LastAction = "fold"
	case "check":
		if toCall > 0 {
			return fmt.Errorf("cannot check")
		}
		s.LastAction = "check"
	case "call":
		pay := toCall
		if pay > s.Stack {
			pay = s.Stack
		}
		s.Stack -= pay
		s.Bet += pay
		t.addContribution(seat, pay)
		s.LastAction = "call"
		if s.Stack == 0 {
			s.Status = SeatAllIn
		}
	case "raise", "all_in":
		if action == "all_in" {
			amount = s.Bet + s.Stack
		}
		raiseTotal := amount - s.Bet
		if raiseTotal <= toCall {
			return fmt.Errorf("raise too small")
		}
		if amount > s.Bet+s.Stack {
			amount = s.Bet + s.Stack
		}
		add := amount - s.Bet
		s.Stack -= add
		s.Bet = amount
		t.addContribution(seat, add)
		if amount > t.CurrentBet {
			t.MinRaise = amount - t.CurrentBet
			t.CurrentBet = amount
		}
		s.LastAction = action
		if s.Stack == 0 {
			s.Status = SeatAllIn
		}
		t.ActedThisRound = map[int]bool{seat: true}
	default:
		return fmt.Errorf("unknown action")
	}
	t.ActedThisRound[seat] = true
	return nil
}

func (t *Table) AdvanceAction() bool {
	next := t.nextActiveSeat(t.ActionSeat)
	if next < 0 {
		return t.advanceStreet()
	}
	if t.allMatched() {
		return t.advanceStreet()
	}
	t.ActionSeat = next
	return false
}

func (t *Table) allMatched() bool {
	for _, s := range t.Seats {
		if s == nil || s.Status == SeatFolded {
			continue
		}
		if s.Status == SeatSeated && s.Bet < t.CurrentBet && s.Stack > 0 {
			return false
		}
		if !t.ActedThisRound[s.Index] && s.Status == SeatSeated {
			return false
		}
	}
	return true
}

func (t *Table) advanceStreet() bool {
	// Reset bets for new street
	for _, s := range t.Seats {
		if s != nil {
			s.Bet = 0
		}
	}
	t.CurrentBet = 0
	t.MinRaise = 0
	t.ActedThisRound = map[int]bool{}

	switch t.Street {
	case StreetPreflop:
		t.Board = append(t.Board, t.draw(), t.draw(), t.draw())
		t.Street = StreetFlop
	case StreetFlop:
		t.Board = append(t.Board, t.draw())
		t.Street = StreetTurn
	case StreetTurn:
		t.Board = append(t.Board, t.draw())
		t.Street = StreetRiver
	case StreetRiver:
		t.Street = StreetShowdown
		return true
	default:
		return true
	}
	if t.onlyAllInRemaining() {
		return t.advanceStreet()
	}
	t.ActionSeat = t.nextActiveSeat(t.ButtonSeat)
	if t.ActionSeat < 0 {
		return t.advanceStreet()
	}
	return false
}

func (t *Table) onlyAllInRemaining() bool {
	canAct := 0
	for _, s := range t.Seats {
		if s == nil || s.Status == SeatFolded {
			continue
		}
		if s.Status == SeatSeated && s.Stack > 0 {
			canAct++
		}
	}
	return canAct <= 1
}

func (t *Table) ValidActions(seat int) (actions []string, toCall, minRaise, maxRaise int64) {
	s := t.Seats[seat]
	if s == nil {
		return nil, 0, 0, 0
	}
	toCall = t.CurrentBet - s.Bet
	if toCall < 0 {
		toCall = 0
	}
	maxRaise = s.Bet + s.Stack
	minRaise = t.CurrentBet + t.MinRaise
	if minRaise < t.BigBlindAmount() {
		minRaise = t.BigBlindAmount()
	}
	actions = append(actions, "fold")
	if toCall == 0 {
		actions = append(actions, "check")
	} else {
		actions = append(actions, "call")
	}
	if s.Stack > toCall {
		actions = append(actions, "raise", "all_in")
	}
	return actions, toCall, minRaise, maxRaise
}

func (t *Table) BigBlindAmount() int64 {
	if t.MinRaise > 0 {
		return t.MinRaise
	}
	return 200
}

func (t *Table) ResetBetweenHands() {
	t.Street = StreetWaiting
	t.Board = nil
	t.Pot = 0
	t.CurrentBet = 0
	for _, s := range t.Seats {
		if s != nil {
			s.Bet = 0
			s.TotalContributed = 0
			s.Status = SeatSeated
			s.LastAction = ""
		}
	}
}

func (t *Table) NonFoldedSeats() []int {
	out := []int{}
	for i, s := range t.Seats {
		if s != nil && s.Status != SeatFolded && s.Status != SeatEmpty {
			out = append(out, i)
		}
	}
	return out
}

func (t *Table) UncontestedWinner() (int, bool) {
	active := t.NonFoldedSeats()
	if len(active) == 1 {
		return active[0], true
	}
	return -1, false
}

func (t *Table) ResolveAndAward() ([][]int, error) {
	winners, _, err := AwardSidePots(t)
	return winners, err
}
