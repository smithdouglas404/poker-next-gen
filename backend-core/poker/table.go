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

func NewDeck() (deck []Card, commitment, seed string, order []string, err error) {
	return NewSecureDeck()
}

// MaxSeats is the physical seat cap; a table's active seats (2..MaxSeats) are
// configurable at creation. 9 supports full-ring; 6-max stays the default.
const MaxSeats = 9

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

// Variant identifies the poker game a table plays.
const (
	VariantHoldem = "holdem" // Texas Hold'em (2 hole cards, no-limit)
	VariantPLO    = "plo"    // Pot-Limit Omaha (4 hole cards, pot-limit)
)

type Table struct {
	Seats          [MaxSeats]*Seat
	Deck           []Card
	DeckOrder      []string
	DeckCommitment string // SHA-256(seed) — committed before the deal
	DeckSeed       string // hex seed — revealed only after the hand settles
	Board          []Card
	HoleCards   map[string][]Card
	Pot         int64
	CurrentBet  int64
	MinRaise    int64
	Street      Street
	ButtonSeat  int
	ActionSeat  int
	HandNo      int
	ActedThisRound map[int]bool
	SeatCap        int    // configured active seats (2..MaxSeats); 0 => default 6
	Variant        string // "holdem" | "plo"; empty => holdem
	PotLimit       bool   // cap raises to the pot size (PLO)

	// ── Optional table features (#41) ────────────────────────────────────────
	// All default-off and gated so a standard Hold'em/PLO hand is byte-for-byte
	// unchanged when none of these are enabled.

	// Straddle: a voluntary UTG post of 2x BB before the deal; betting reopens
	// from the straddle (the straddler acts last preflop).
	AllowStraddle     bool
	StraddleRequested bool // armed for the next StartHand; consumed there
	StraddleSeat      int  // seat that posted a straddle this hand, else -1

	// Bomb pot: every seated player antes a set amount, preflop betting is
	// skipped, and the hand deals straight to the flop.
	AllowBombPot     bool
	BombPotAnte      int64 // ante per player (0 => one big blind when triggered)
	BombPotRequested bool  // armed for the next StartHand; consumed there

	// Run-it-twice: when all remaining players are all-in and agree, the board is
	// run N times and each pot fraction settled per board. RunItTwice is resolved
	// by the match handler immediately before showdown; the engine only reads it.
	AllowRunItTwice  bool
	RunItTwice       bool
	RunItTwiceBoards int // N (default 2)

	// All-in insurance: offered to an all-in favorite, priced off real equity and
	// settled against the wallet (never the pot). The engine only carries the flag.
	AllowInsurance bool
}

func NewTable() *Table {
	return &Table{
		HoleCards:        map[string][]Card{},
		ActedThisRound:   map[int]bool{},
		Street:           StreetWaiting,
		SeatCap:          6,
		Variant:          VariantHoldem,
		StraddleSeat:     -1,
		RunItTwiceBoards: 2,
	}
}

// SetVariant configures the game variant and its betting mode. Unknown values
// fall back to Hold'em so existing tables are unaffected.
func (t *Table) SetVariant(v string) {
	switch v {
	case VariantPLO:
		t.Variant = VariantPLO
		t.PotLimit = true
	default:
		t.Variant = VariantHoldem
		t.PotLimit = false
	}
}

// IsOmaha reports whether the table uses Omaha (4-card, must-use-2) evaluation.
func (t *Table) IsOmaha() bool { return t.Variant == VariantPLO }

// holeCount is how many hole cards each player is dealt for this variant.
func (t *Table) holeCount() int {
	if t.Variant == VariantPLO {
		return 4
	}
	return 2
}

// potLimitMaxTotal is the largest total bet a raiser may commit under pot-limit
// rules: their current bet + the pot after they call + a pot-sized raise. t.Pot
// already includes every chip bet this street, so the pot after calling is
// t.Pot + toCall and the max raise increment equals that — giving
// s.Bet + t.Pot + 2*toCall.
func (t *Table) potLimitMaxTotal(s *Seat, toCall int64) int64 {
	return s.Bet + t.Pot + 2*toCall
}

// cap returns the configured number of active seats, clamped to [2, MaxSeats].
func (t *Table) cap() int {
	if t.SeatCap < 2 {
		return 6
	}
	if t.SeatCap > MaxSeats {
		return MaxSeats
	}
	return t.SeatCap
}

// SetSeatCap configures how many seats (2..MaxSeats) this table exposes.
func (t *Table) SetSeatCap(n int) {
	if n < 2 {
		n = 2
	}
	if n > MaxSeats {
		n = MaxSeats
	}
	t.SeatCap = n
}

// Cap is the exported active-seat count for snapshots/labels.
func (t *Table) Cap() int { return t.cap() }

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
	if seat < 0 || seat >= t.cap() {
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
	deck, commitment, seed, deckOrder, err := NewDeck()
	if err != nil {
		return err
	}
	t.Deck = deck
	t.DeckOrder = deckOrder
	t.DeckCommitment = commitment
	t.DeckSeed = seed
	t.Board = nil
	t.HoleCards = map[string][]Card{}
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

	// Deal hole cards (2 for Hold'em, 4 for PLO).
	n := t.holeCount()
	for _, idx := range seated {
		s := t.Seats[idx]
		hole := make([]Card, n)
		for i := 0; i < n; i++ {
			hole[i] = t.draw()
		}
		t.HoleCards[s.UserID] = hole
		s.Status = SeatSeated
		s.Bet = 0
		s.LastAction = ""
	}

	// Reset per-hand feature state before choosing the opening structure.
	t.StraddleSeat = -1
	t.RunItTwice = false

	// Bomb pot: every seated player antes, preflop betting is skipped, and the
	// hand deals straight to the flop. Takes precedence over blinds/straddle.
	if t.AllowBombPot && t.BombPotRequested {
		ante := t.bombAnte(bb)
		t.BombPotRequested = false
		if ante > 0 {
			for _, idx := range seated {
				t.postAnte(idx, ante)
			}
			// Deal the flop immediately; there is no preflop betting round.
			t.Board = append(t.Board, t.draw(), t.draw(), t.draw())
			t.Street = StreetFlop
			t.CurrentBet = 0
			t.MinRaise = bb
			t.ActedThisRound = map[int]bool{}
			// Post-flop action opens on the first active seat left of the button.
			t.ActionSeat = t.nextActiveSeat(t.ButtonSeat)
			return nil
		}
	}

	// Post blinds
	sbSeat := t.nextSeated(t.ButtonSeat)
	bbSeat := t.nextSeated(sbSeat)
	t.postBlind(sbSeat, sb, "SB")
	t.postBlind(bbSeat, bb, "BB")
	t.ActionSeat = t.nextActiveSeat(bbSeat)

	// Optional voluntary straddle: UTG posts 2x BB and betting reopens from the
	// straddle (the straddler retains the option to act last preflop, exactly as
	// the big blind does — postBlind does not mark the seat as having acted).
	if t.AllowStraddle && t.StraddleRequested {
		utg := t.nextSeated(bbSeat)
		su := t.Seats[utg]
		straddle := 2 * bb
		if utg != bbSeat && utg != sbSeat && su != nil && su.Stack >= straddle {
			t.postBlind(utg, straddle, "STRADDLE")
			t.CurrentBet = straddle
			t.MinRaise = bb // last raise increment stays one big blind
			t.StraddleSeat = utg
			t.ActionSeat = t.nextActiveSeat(utg)
		}
	}
	t.StraddleRequested = false
	return nil
}

// bombAnte is the per-player ante for a bomb pot: the configured amount, or one
// big blind when none is configured.
func (t *Table) bombAnte(bb int64) int64 {
	if t.BombPotAnte > 0 {
		return t.BombPotAnte
	}
	return bb
}

// postAnte moves an ante into the pot. Unlike a blind it does NOT set the seat's
// current Bet (there is nothing to call it against), so bomb-pot flop betting
// opens at CurrentBet 0. A player who cannot cover the ante is put all-in for it.
func (t *Table) postAnte(seat int, amount int64) {
	s := t.Seats[seat]
	if s == nil || amount <= 0 {
		return
	}
	pay := amount
	if pay > s.Stack {
		pay = s.Stack
	}
	s.Stack -= pay
	t.addContribution(seat, pay)
	s.LastAction = "ante"
	if s.Stack == 0 {
		s.Status = SeatAllIn
	}
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
		// Pot-limit: no bet may exceed the pot. A shove above the cap becomes a
		// pot-sized raise; an explicit raise above the cap is rejected.
		if t.PotLimit {
			maxTotal := t.potLimitMaxTotal(s, toCall)
			if amount > maxTotal {
				if action == "all_in" {
					amount = maxTotal
				} else {
					return fmt.Errorf("raise exceeds pot limit")
				}
			}
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
	// Pot-limit caps the max raise to the pot size (still clamped by stack).
	if t.PotLimit {
		if capTotal := t.potLimitMaxTotal(s, toCall); capTotal < maxRaise {
			maxRaise = capTotal
		}
	}
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
