package poker

// HandPhase is the coarse match state for a single table hand.
// Betting streets live on Table.Street; HandPhase gates when players may act
// and when async showdown work is in flight.
type HandPhase string

const (
	PhaseWaiting           HandPhase = "waiting"
	PhaseBetting           HandPhase = "betting"
	PhaseResolvingSidePots HandPhase = "resolving_sidepots"
	PhaseSettled           HandPhase = "settled"
)

func (p HandPhase) AllowsPlayerActions() bool {
	return p == PhaseBetting
}
