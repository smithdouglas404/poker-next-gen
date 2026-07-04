package poker

const (
	MinBuyInCents  int64 = 10_000  // $100
	MaxBuyInCents  int64 = 100_000 // $1,000
	DefaultWallet  int64 = 100_000 // $1,000 baseline
)

func ClampBuyIn(amount int64) int64 {
	if amount < MinBuyInCents {
		return MinBuyInCents
	}
	if amount > MaxBuyInCents {
		return MaxBuyInCents
	}
	return amount
}
