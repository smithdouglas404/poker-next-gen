package bot

import (
	"math/rand"
	"testing"
)

func TestPolicyFoldsTrashToBet(t *testing.T) {
	r := rand.New(rand.NewSource(1))
	// Trash hand (strength 0) facing a bet must fold.
	d := policy(0, 100, 200, 50, 1000, 1000, r)
	if d.Action != "fold" {
		t.Fatalf("trash facing bet should fold, got %q", d.Action)
	}
}

func TestPolicyStrongHandIsAggressive(t *testing.T) {
	r := rand.New(rand.NewSource(2))
	// Strong made hand should never fold; it raises or calls.
	for i := 0; i < 20; i++ {
		d := policy(6, 100, 300, 150, 2000, 2000, r)
		if d.Action == "fold" {
			t.Fatalf("strong hand should not fold, got fold on iter %d", i)
		}
	}
}

func TestPolicyChecksWhenFreeWithMarginal(t *testing.T) {
	r := rand.New(rand.NewSource(3))
	// Marginal hand, no bet to face -> check (never fold when it's free).
	d := policy(1, 0, 200, 50, 1000, 1000, r)
	if d.Action == "fold" {
		t.Fatalf("should never fold when checking is free")
	}
}

func TestPreflopStrengthOrders(t *testing.T) {
	aces := preflopStrength("As", "Ah")
	trash := preflopStrength("7c", "2d")
	if aces <= trash {
		t.Fatalf("AA (%d) should outrank 72o (%d)", aces, trash)
	}
	if preflopStrength("As", "Ks") <= preflopStrength("As", "Kd") {
		t.Fatalf("suited AK should beat offsuit AK")
	}
}

func TestRaiseSizeClamped(t *testing.T) {
	r := rand.New(rand.NewSource(4))
	got := raiseSize(50, 120, 1000, 0.75, r)
	if got < 50 || got > 120 {
		t.Fatalf("raise size %d out of [50,120]", got)
	}
}
