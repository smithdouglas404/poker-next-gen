package billing

import "testing"

// The tier catalog is the membership product. Every one of these numbers is
// printed on the membership page, so a field the server does not read is a
// promise the customer paid for and did not get.

func TestZeroIsNeverReadRawAsUnlimited(t *testing.T) {
	// THE TRAP. The catalog overloads 0 on two fields: it means "play chips only"
	// / "freerolls only" on FREE and "unlimited" on the top tiers. A gate reading
	// the raw field therefore grants the free tier unlimited access — the exact
	// inverse of what is advertised, and the bug this test caught in the first
	// version of the sit-down gate.
	if raw := GetTierDef("free").MaxBigBlindCents; raw != 0 {
		t.Fatalf("free MaxBigBlindCents is %d; this test assumes the 0 encoding", raw)
	}
	if eff := EffectiveMaxBigBlindCents("free"); eff <= 0 || eff >= Unlimited {
		t.Errorf("free resolves to %d — must be a small positive cap, not unlimited", eff)
	}
	if eff := EffectiveTournamentBuyInMaxCents("free"); eff != 0 {
		t.Errorf("free tournament cap resolved to %d — free is freerolls only", eff)
	}
	// The same 0 on the top tier must resolve the other way.
	if eff := EffectiveMaxBigBlindCents("platinum"); eff != Unlimited {
		t.Errorf("platinum stake cap resolved to %d, want unlimited", eff)
	}
	if eff := EffectiveTournamentBuyInMaxCents("platinum"); eff != Unlimited {
		t.Errorf("platinum tournament cap resolved to %d, want unlimited", eff)
	}
	// And an unknown tier must fall to the free treatment, not to unlimited.
	if eff := EffectiveMaxBigBlindCents("not-a-tier"); eff >= Unlimited {
		t.Error("an unknown tier resolved to unlimited stakes")
	}
}

func TestEveryPaidTierAdvertisesEnforceableLimits(t *testing.T) {
	// A paid tier whose caps are all zero is indistinguishable from free once the
	// gates are applied — the customer would be paying for nothing enforceable.
	for _, tier := range Tiers {
		if !IsPaidTier(tier.ID) {
			continue
		}
		if EffectiveMaxBigBlindCents(tier.ID) <= EffectiveMaxBigBlindCents("free") {
			t.Errorf("%s grants no more stake headroom than free", tier.ID)
		}
		if EffectiveTournamentBuyInMaxCents(tier.ID) <= 0 {
			t.Errorf("%s cannot enter any buy-in tournament", tier.ID)
		}
		if tier.WithdrawLimitWeeklyCents <= 0 {
			t.Errorf("%s advertises no weekly withdrawal limit", tier.ID)
		}
		if tier.MultiTableLimit <= 0 {
			t.Errorf("%s advertises no multi-table limit", tier.ID)
		}
	}
}

func TestTierLimitsIncreaseWithPrice(t *testing.T) {
	// A higher tier that grants LESS is the worst possible bug in a paid ladder:
	// the customer pays more and is quietly restricted further.
	for i := 1; i < len(Tiers); i++ {
		lo, hi := Tiers[i-1], Tiers[i]
		if hi.MonthlyPriceCents < lo.MonthlyPriceCents {
			continue // catalog is not strictly ascending in price; skip the pair
		}
		if EffectiveMaxBigBlindCents(hi.ID) < EffectiveMaxBigBlindCents(lo.ID) {
			t.Errorf("%s costs more than %s but caps stakes lower (%d < %d)",
				hi.ID, lo.ID, EffectiveMaxBigBlindCents(hi.ID), EffectiveMaxBigBlindCents(lo.ID))
		}
		if EffectiveTournamentBuyInMaxCents(hi.ID) < EffectiveTournamentBuyInMaxCents(lo.ID) {
			t.Errorf("%s caps tournament buy-ins lower than %s", hi.ID, lo.ID)
		}
		if hi.MultiTableLimit < lo.MultiTableLimit {
			t.Errorf("%s allows fewer tables than %s (%d < %d)",
				hi.ID, lo.ID, hi.MultiTableLimit, lo.MultiTableLimit)
		}
		if hi.WithdrawLimitWeeklyCents < lo.WithdrawLimitWeeklyCents {
			t.Errorf("%s has a lower weekly withdrawal limit than %s", hi.ID, lo.ID)
		}
		if hi.MarketplaceFeeBps > lo.MarketplaceFeeBps {
			t.Errorf("%s pays a HIGHER marketplace fee than %s", hi.ID, lo.ID)
		}
	}
}

func TestLowestWithdrawWeeklyCents(t *testing.T) {
	got := LowestWithdrawWeeklyCents()
	if got <= 0 {
		t.Fatal("no tier defines a weekly withdrawal limit — the gate would be disabled entirely")
	}
	for _, tier := range Tiers {
		if tier.WithdrawLimitWeeklyCents > 0 && tier.WithdrawLimitWeeklyCents < got {
			t.Errorf("%s has a lower limit (%d) than the reported floor (%d)",
				tier.ID, tier.WithdrawLimitWeeklyCents, got)
		}
	}
	// The floor is what a tier with no configured limit falls back to. It must be
	// positive but NOT unlimited: a free account keeps access to its own funds
	// without inheriting a paid tier's velocity.
	if got == 0 {
		t.Error("floor of 0 would block every unconfigured tier from withdrawing at all")
	}
}

func TestFreeTierCannotSponsorOrCreateClubs(t *testing.T) {
	// The product rule: hosting is the paid feature. If free could sponsor, the
	// subscription has no anchor.
	if CanSponsorTable("free") {
		t.Error("the free tier can sponsor tables — hosting is supposed to be the paid feature")
	}
	if CanCreateClub("free", 0) {
		t.Error("the free tier can create a club")
	}
}
