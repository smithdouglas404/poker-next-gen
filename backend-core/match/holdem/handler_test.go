package holdem

import (
	"context"
	"strconv"
	"testing"

	"github.com/heroiclabs/nakama-common/runtime"

	"github.com/smithdouglas404/poker-next-gen/backend-core/poker"
)

// nopDispatcher is a no-op runtime.MatchDispatcher for exercising handler logic
// that touches the dispatcher without a live Nakama server.
type nopDispatcher struct{}

func (nopDispatcher) BroadcastMessage(int64, []byte, []runtime.Presence, runtime.Presence, bool) error {
	return nil
}
func (nopDispatcher) BroadcastMessageDeferred(int64, []byte, []runtime.Presence, runtime.Presence, bool) error {
	return nil
}
func (nopDispatcher) MatchKick([]runtime.Presence) error { return nil }
func (nopDispatcher) MatchLabelUpdate(string) error      { return nil }

func newTestState(t *testing.T) *MatchState {
	t.Helper()
	tbl := poker.NewTable()
	tbl.SetSeatCap(6)
	if err := tbl.SitDown(0, "u1", "Alice", 10000); err != nil {
		t.Fatalf("seat setup: %v", err)
	}
	return &MatchState{
		Table:      tbl,
		Phase:      poker.PhaseWaiting,
		HostUserID: "host",
		Presences:  map[string]runtime.Presence{},
		SeatWallet: map[int]string{},
		SeatLocked: map[int]int64{},
	}
}

// A host "kick" carrying an out-of-range seat index must not panic (the seat
// index arrives straight from the host's JSON payload). Before the fix the
// handler indexed the fixed-size Seats array with req.Seat *before* the bounds
// check, so seat = -1 or >= MaxSeats crashed the whole match goroutine.
func TestHandleHostAction_KickOutOfRangeSeatDoesNotPanic(t *testing.T) {
	for _, seat := range []int{-1, poker.MaxSeats, poker.MaxSeats + 5, 9999} {
		s := newTestState(t)
		data := []byte(`{"action":"kick","seat":` + strconv.Itoa(seat) + `}`)
		// db and logger are never reached on the out-of-range path.
		handleHostAction(context.Background(), nil, nil, nopDispatcher{}, s, "host", data)
		if s.Table.Seats[0] == nil || s.Table.Seats[0].UserID != "u1" {
			t.Fatalf("seat=%d: a valid seat was wrongly vacated", seat)
		}
	}
}
