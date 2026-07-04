package protocol

// Client → server match op codes.
const (
	OpSitDown  int64 = 1
	OpStandUp  int64 = 2
	OpAction   int64 = 3
	OpStartHand int64 = 4
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
)

const (
	MatchModule = "holdem_cash_6max"
	MaxSeats    = 6
)

const (
	ActionFold  = "fold"
	ActionCheck = "check"
	ActionCall  = "call"
	ActionRaise = "raise"
	ActionAllIn = "all_in"
)
