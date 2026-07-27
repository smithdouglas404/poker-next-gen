package poker

import "testing"

// ClampBuyInBand backs both reserveBuyIn (the wallet debit) and Table.SitDown /
// SitDownUnlimited (the seat's stack). The two MUST clamp identically for the
// same (amount, allowUnlimited) pair — a mismatch means the wallet is charged
// more than the stack the player receives (chips destroyed) or the stack shows
// more than was ever charged (chips minted from nothing).
func TestClampBuyInBand(t *testing.T) {
	cases := []struct {
		name           string
		amount         int64
		allowUnlimited bool
		want           int64
	}{
		{"below floor, capped table: raised to the floor", 1, false, MinBuyInCents},
		{"below floor, unlimited table: still raised to the floor", 1, true, MinBuyInCents},
		{"within band, capped table: unchanged", 50_000, false, 50_000},
		{"above cap, capped table: lowered to the cap", 500_000, false, MaxBuyInCents},
		{"above cap, unlimited table: NOT lowered", 500_000, true, 500_000},
		{"exactly the cap, unlimited table: unchanged", MaxBuyInCents, true, MaxBuyInCents},
		{"zero, unlimited table: still raised to the floor", 0, true, MinBuyInCents},
		{"negative, unlimited table: still raised to the floor", -500_000, true, MinBuyInCents},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := ClampBuyInBand(tc.amount, tc.allowUnlimited)
			if got != tc.want {
				t.Fatalf("ClampBuyInBand(%d, %v) = %d, want %d", tc.amount, tc.allowUnlimited, got, tc.want)
			}
		})
	}
}

// ClampBuyIn is the capped-table default and must never let anything through
// above MaxBuyInCents — this is the function every OTHER caller in the codebase
// still uses (bots, tests, anything not table-config-aware).
func TestClampBuyIn(t *testing.T) {
	if got := ClampBuyIn(500_000); got != MaxBuyInCents {
		t.Fatalf("ClampBuyIn did not cap: got %d, want %d", got, MaxBuyInCents)
	}
	if got := ClampBuyIn(1); got != MinBuyInCents {
		t.Fatalf("ClampBuyIn did not floor: got %d, want %d", got, MinBuyInCents)
	}
}

// SitDown and SitDownUnlimited must clamp EXACTLY the way reserveBuyIn's
// ClampBuyInBand call does for the same inputs — this is a direct regression
// guard on the seat-vs-wallet consistency the doc comment on SitDownUnlimited
// describes. A table.go change that clamps differently from constants.go would
// pass a vet/build but silently reopen the money-mismatch bug.
func TestSitDownUnlimitedMatchesReserveBuyInClamp(t *testing.T) {
	amount := int64(500_000) // above MaxBuyInCents

	tb := NewTable()
	if err := tb.SitDownUnlimited(0, "alice", "Alice", amount); err != nil {
		t.Fatalf("SitDownUnlimited: %v", err)
	}
	gotStack := tb.Seats[0].Stack
	wantStack := ClampBuyInBand(amount, true) // what reserveBuyIn would have debited
	if gotStack != wantStack {
		t.Fatalf("seat stack = %d, want %d (must match what reserveBuyIn debits)", gotStack, wantStack)
	}
	if gotStack != amount {
		t.Fatalf("SitDownUnlimited capped an unlimited-table buy-in: got %d, want %d unchanged", gotStack, amount)
	}

	tb2 := NewTable()
	if err := tb2.SitDown(0, "bob", "Bob", amount); err != nil {
		t.Fatalf("SitDown: %v", err)
	}
	if got := tb2.Seats[0].Stack; got != MaxBuyInCents {
		t.Fatalf("capped SitDown let %d through, want it clamped to %d", got, MaxBuyInCents)
	}
}

// A table's filler bots must respect the same buy-in band as its human
// players — a table configured "Unlimited buy-in (play money)" seating a human
// for $5,000 next to a bot capped at $1,000 is the table silently disagreeing
// with itself about its own stakes.
func TestSitDownBotUnlimitedMatchesSitDownUnlimited(t *testing.T) {
	amount := int64(500_000) // above MaxBuyInCents

	tb := NewTable()
	if err := tb.SitDownBotUnlimited(0, "bot_room_0", "Bot_1", amount); err != nil {
		t.Fatalf("SitDownBotUnlimited: %v", err)
	}
	if got := tb.Seats[0].Stack; got != amount {
		t.Fatalf("SitDownBotUnlimited capped an unlimited-table bot buy-in: got %d, want %d unchanged", got, amount)
	}
	if !tb.Seats[0].IsBot {
		t.Fatal("SitDownBotUnlimited did not mark the seat as a bot")
	}

	tb2 := NewTable()
	if err := tb2.SitDownBot(0, "bot_room_1", "Bot_1", amount); err != nil {
		t.Fatalf("SitDownBot: %v", err)
	}
	if got := tb2.Seats[0].Stack; got != MaxBuyInCents {
		t.Fatalf("capped SitDownBot let %d through, want it clamped to %d", got, MaxBuyInCents)
	}
}
