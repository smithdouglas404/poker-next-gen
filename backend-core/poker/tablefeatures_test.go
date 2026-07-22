package poker

import "testing"

// These cover the network-free engine helpers behind the #41 table features.
// StartHand itself draws from the engine-math shuffle sidecar, so the straddle /
// bomb-pot integration is exercised at the match layer, not here.

func TestBombAnteDefaultsToBigBlind(t *testing.T) {
	tbl := NewTable()
	if got := tbl.bombAnte(200); got != 200 {
		t.Fatalf("bombAnte with no configured ante = %d, want 200 (one BB)", got)
	}
	tbl.BombPotAnte = 500
	if got := tbl.bombAnte(200); got != 500 {
		t.Fatalf("bombAnte with configured ante = %d, want 500", got)
	}
}

func TestPostAnteMovesChipsWithoutSettingBet(t *testing.T) {
	tbl := NewTable()
	tbl.Seats[0] = &Seat{Index: 0, UserID: "u1", Username: "P1", Stack: 1000, Status: SeatSeated}
	tbl.postAnte(0, 300)
	s := tbl.Seats[0]
	if s.Stack != 700 {
		t.Fatalf("stack after ante = %d, want 700", s.Stack)
	}
	if s.Bet != 0 {
		t.Fatalf("ante must not set Bet (bomb-pot flop opens at 0), got %d", s.Bet)
	}
	if tbl.Pot != 300 || s.TotalContributed != 300 {
		t.Fatalf("pot/contrib after ante = %d/%d, want 300/300", tbl.Pot, s.TotalContributed)
	}
}

func TestPostAntePutsShortStackAllIn(t *testing.T) {
	tbl := NewTable()
	tbl.Seats[0] = &Seat{Index: 0, UserID: "u1", Username: "P1", Stack: 120, Status: SeatSeated}
	tbl.postAnte(0, 300)
	s := tbl.Seats[0]
	if s.Stack != 0 || s.Status != SeatAllIn {
		t.Fatalf("short stack should be all-in for the ante, got stack=%d status=%s", s.Stack, s.Status)
	}
	if tbl.Pot != 120 {
		t.Fatalf("pot should hold only what the short stack could cover, got %d", tbl.Pot)
	}
}

func TestParseBoardStringRoundTrips(t *testing.T) {
	cards, err := ParseBoardString("AsKd7cThQc")
	if err != nil {
		t.Fatalf("ParseBoardString: %v", err)
	}
	if len(cards) != 5 {
		t.Fatalf("parsed %d cards, want 5", len(cards))
	}
	want := []string{"As", "Kd", "7c", "Th", "Qc"}
	for i, c := range cards {
		if c.Code() != want[i] {
			t.Fatalf("card %d = %s, want %s (order must be preserved)", i, c.Code(), want[i])
		}
	}
	if _, err := ParseBoardString("AsK"); err == nil {
		t.Fatal("expected error on dangling card code")
	}
}

func TestNewTableFeatureDefaults(t *testing.T) {
	tbl := NewTable()
	if tbl.AllowStraddle || tbl.AllowBombPot || tbl.AllowInsurance || tbl.AllowRunItTwice {
		t.Fatal("all optional table features must default OFF")
	}
	if tbl.StraddleSeat != -1 {
		t.Fatalf("StraddleSeat default = %d, want -1", tbl.StraddleSeat)
	}
	if tbl.RunItTwiceBoards != 2 {
		t.Fatalf("RunItTwiceBoards default = %d, want 2", tbl.RunItTwiceBoards)
	}
}
