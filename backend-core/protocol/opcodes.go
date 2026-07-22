package protocol

// Client → server match op codes.
const (
	OpSitDown  int64 = 1
	OpStandUp  int64 = 2
	OpAction   int64 = 3
	OpStartHand int64 = 4
	OpChatSend  int64 = 5
	OpHostAction int64 = 6 // table host: pause/resume/kick/set_blinds/close/bomb_pot
	OpPostStraddle    int64 = 7 // voluntary straddle: arm a 2x BB UTG post for the next hand
	OpRunItTwice      int64 = 8 // agreement vote to run the board multiple times when all-in
	OpInsuranceAccept int64 = 9 // accept a previously offered all-in insurance policy
)

// Server → client match op codes.
const (
	OpSnapshot        int64 = 100
	OpHandStart       int64 = 101
	OpDealPrivate     int64 = 102
	OpBoard           int64 = 103
	OpActionApplied   int64 = 104
	OpActionRequired  int64 = 105
	OpShowdown        int64 = 106
	OpSeatUpdate      int64 = 107
	OpError           int64 = 108
	OpBlindUpdate     int64 = 109
	OpTournamentInfo  int64 = 110
	OpChat            int64 = 111
	OpSessionKey      int64 = 112
	OpInsuranceOffer  int64 = 113 // server offers an all-in player insurance (premium/payout)
)

const (
	MatchModule           = "holdem_cash_6max"
	TournamentModule      = "tournament_director"
	MaxSeats              = 10 // physical seat cap; a table's active seats (2-10) is configurable
)

const (
	ActionFold  = "fold"
	ActionCheck = "check"
	ActionCall  = "call"
	ActionRaise = "raise"
	ActionAllIn = "all_in"
)
