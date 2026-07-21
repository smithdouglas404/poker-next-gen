package poker

import "testing"

// StartHand draws from the engine-math shuffle sidecar (no local fallback), so
// hole-card counts are verified via holeCount() — the value that drives the deal
// loop — without a network dependency.
func TestPLOConfig(t *testing.T) {
	tbl := NewTable()
	tbl.SetVariant(VariantPLO)
	if got := tbl.holeCount(); got != 4 {
		t.Fatalf("PLO holeCount = %d, want 4", got)
	}
	if !tbl.PotLimit {
		t.Fatal("PLO table must be pot-limit")
	}
	if !tbl.IsOmaha() {
		t.Fatal("PLO table must use Omaha evaluation")
	}
}

func TestHoldemConfig(t *testing.T) {
	tbl := NewTable()
	if got := tbl.holeCount(); got != 2 {
		t.Fatalf("Hold'em holeCount = %d, want 2", got)
	}
	if tbl.PotLimit || tbl.IsOmaha() {
		t.Fatal("Hold'em table must be no-limit, non-Omaha")
	}
}

func TestPotLimitMaxTotal(t *testing.T) {
	// 3-handed 100/200, UTG to act: pot already holds SB+BB = 300, toCall = 200,
	// the raiser has nothing in yet (s.Bet = 0). Pot-limit max total bet is
	// s.Bet + pot + 2*toCall = 0 + 300 + 400 = 700.
	tbl := NewTable()
	tbl.SetVariant(VariantPLO)
	tbl.Pot = 300
	s := &Seat{Bet: 0}
	if got := tbl.potLimitMaxTotal(s, 200); got != 700 {
		t.Fatalf("potLimitMaxTotal = %d, want 700", got)
	}
}

func TestSetVariantUnknownFallsBackToHoldem(t *testing.T) {
	tbl := NewTable()
	tbl.SetVariant("nonsense")
	if tbl.Variant != VariantHoldem || tbl.PotLimit {
		t.Fatalf("unknown variant should fall back to no-limit Hold'em, got %q potLimit=%v", tbl.Variant, tbl.PotLimit)
	}
}
