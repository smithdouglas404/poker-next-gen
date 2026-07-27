package poker

const (
	MinBuyInCents  int64 = 10_000  // $100
	MaxBuyInCents  int64 = 100_000 // $1,000
	DefaultWallet  int64 = 100_000 // $1,000 baseline
)

func ClampBuyIn(amount int64) int64 {
	return ClampBuyInBand(amount, false)
}

// ClampBuyInBand is ClampBuyIn with the max cap skippable for tables configured
// "Unlimited buy-in (play money)" (MatchState.NoMaxBuyIn — real-money tables can
// never set it, enforced at match init). The floor always applies: a seat with
// $0 or negative chips is not a meaningful buy-in on any table.
func ClampBuyInBand(amount int64, allowUnlimited bool) int64 {
	if amount < MinBuyInCents {
		return MinBuyInCents
	}
	if !allowUnlimited && amount > MaxBuyInCents {
		return MaxBuyInCents
	}
	return amount
}
