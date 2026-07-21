// Package billing holds the membership tier catalog and subscription logic.
//
// The tier catalog is the single source of truth for what each membership level
// costs and unlocks — ported from HighRollersClub's tier-config.ts so the limits
// match the documented subscription/KYC model. All monetary values are in cents.
package billing

// TierOrder lists tiers from lowest to highest rank.
var TierOrder = []string{"free", "bronze", "silver", "gold", "platinum"}

// TierDef describes one membership level. Limit conventions match HRC:
//   - MaxBigBlindCents: 0 means play-chips only (free) OR unlimited (platinum) —
//     disambiguated by tier; callers should treat platinum as unlimited.
//   - TournamentBuyInMaxCents: 0 = freerolls only (free) or unlimited (gold+).
//   - ClubCreateLimit / ClubMemberLimit: 0 = cannot create, -1 = unlimited.
type TierDef struct {
	ID                      string   `json:"id"`
	Name                    string   `json:"name"`
	MonthlyPriceCents       int64    `json:"monthly_price_cents"`
	AnnualPriceCents        int64    `json:"annual_price_cents"`
	KYCLevel                string   `json:"kyc_level"`
	DepositLimitDailyCents  int64    `json:"deposit_limit_daily_cents"`
	WithdrawLimitWeeklyCents int64   `json:"withdraw_limit_weekly_cents"`
	MaxBigBlindCents        int64    `json:"max_big_blind_cents"`
	TournamentBuyInMaxCents int64    `json:"tournament_buy_in_max_cents"`
	RakebackPercent         int      `json:"rakeback_percent"`
	DailyBonusChips         int64    `json:"daily_bonus_chips"`
	ClubCreateLimit         int      `json:"club_create_limit"`
	ClubMemberLimit         int      `json:"club_member_limit"`
	MultiTableLimit         int      `json:"multi_table_limit"`
	MarketplaceFeeBps       int      `json:"marketplace_fee_bps"`
	Benefits                []string `json:"benefits"`
}

// Tiers is the ordered catalog (free → platinum).
var Tiers = []TierDef{
	{
		ID: "free", Name: "Free", MonthlyPriceCents: 0, AnnualPriceCents: 0,
		KYCLevel: "email", DepositLimitDailyCents: 0, WithdrawLimitWeeklyCents: 0,
		MaxBigBlindCents: 0, TournamentBuyInMaxCents: 0, RakebackPercent: 0,
		DailyBonusChips: 500, ClubCreateLimit: 0, ClubMemberLimit: 0,
		MultiTableLimit: 1, MarketplaceFeeBps: 290,
		Benefits: []string{
			"Play-chip tables only",
			"Email verification",
			"Daily bonus: 500 chips",
			"Freeroll tournaments only",
			"Join clubs (cannot create)",
			"1 table at a time",
		},
	},
	{
		ID: "bronze", Name: "Bronze", MonthlyPriceCents: 499, AnnualPriceCents: 4799,
		KYCLevel: "basic", DepositLimitDailyCents: 20000, WithdrawLimitWeeklyCents: 50000,
		MaxBigBlindCents: 1000, TournamentBuyInMaxCents: 2500, RakebackPercent: 0,
		DailyBonusChips: 1000, ClubCreateLimit: 1, ClubMemberLimit: 25,
		MultiTableLimit: 1, MarketplaceFeeBps: 290,
		Benefits: []string{
			"Real-money micro stakes (up to 5/10)",
			"$200/day deposit, $500/week withdraw",
			"Daily bonus: 1,000 chips",
			"Tournament buy-ins up to $25",
			"Create 1 club (25 members max)",
			"Everything in Free",
		},
	},
	{
		ID: "silver", Name: "Silver", MonthlyPriceCents: 1499, AnnualPriceCents: 14399,
		KYCLevel: "standard", DepositLimitDailyCents: 100000, WithdrawLimitWeeklyCents: 250000,
		MaxBigBlindCents: 5000, TournamentBuyInMaxCents: 20000, RakebackPercent: 10,
		DailyBonusChips: 2500, ClubCreateLimit: 3, ClubMemberLimit: 100,
		MultiTableLimit: 4, MarketplaceFeeBps: 290,
		Benefits: []string{
			"Mid stakes (up to 25/50)",
			"$1,000/day deposit, $2,500/week withdraw",
			"10% rakeback",
			"Daily bonus: 2,500 chips",
			"Tournament buy-ins up to $200",
			"Create up to 3 clubs (100 members each)",
			"Multi-table up to 4 tables",
			"Everything in Bronze",
		},
	},
	{
		ID: "gold", Name: "Gold", MonthlyPriceCents: 2999, AnnualPriceCents: 28799,
		KYCLevel: "full", DepositLimitDailyCents: 500000, WithdrawLimitWeeklyCents: 1000000,
		MaxBigBlindCents: 40000, TournamentBuyInMaxCents: 0, RakebackPercent: 20,
		DailyBonusChips: 5000, ClubCreateLimit: 5, ClubMemberLimit: 500,
		MultiTableLimit: 4, MarketplaceFeeBps: 290,
		Benefits: []string{
			"High stakes (up to 200/400)",
			"$5,000/day deposit, $10,000/week withdraw",
			"20% rakeback",
			"Daily bonus: 5,000 chips",
			"Unlimited tournament buy-ins",
			"Create up to 5 clubs (500 members each)",
			"Everything in Silver",
		},
	},
	{
		ID: "platinum", Name: "Platinum", MonthlyPriceCents: 7999, AnnualPriceCents: 76799,
		KYCLevel: "enhanced", DepositLimitDailyCents: 2500000, WithdrawLimitWeeklyCents: 5000000,
		MaxBigBlindCents: 0, TournamentBuyInMaxCents: 0, RakebackPercent: 30,
		DailyBonusChips: 10000, ClubCreateLimit: -1, ClubMemberLimit: -1,
		MultiTableLimit: 8, MarketplaceFeeBps: 200,
		Benefits: []string{
			"Unlimited stakes",
			"$25,000/day deposit, $50,000/week withdraw",
			"30% rakeback",
			"Daily bonus: 10,000 chips",
			"Unlimited clubs & members",
			"Multi-table up to 8 tables",
			"Reduced 2.0% marketplace fee",
			"Everything in Gold",
		},
	},
}

var tierByID = func() map[string]TierDef {
	m := make(map[string]TierDef, len(Tiers))
	for _, t := range Tiers {
		m[t.ID] = t
	}
	return m
}()

// GetTierDef returns the definition for a tier id, defaulting to free for
// unknown/empty ids.
func GetTierDef(id string) TierDef {
	if t, ok := tierByID[id]; ok {
		return t
	}
	return tierByID["free"]
}

// TierRank returns the ordinal of a tier (free=0 … platinum=4); unknown → 0.
func TierRank(id string) int {
	for i, t := range TierOrder {
		if t == id {
			return i
		}
	}
	return 0
}

// IsValidTier reports whether id is a known tier.
func IsValidTier(id string) bool {
	_, ok := tierByID[id]
	return ok
}

// IsPaidTier reports whether the tier requires a subscription.
func IsPaidTier(id string) bool {
	return IsValidTier(id) && id != "free"
}

// Unlimited is the effective cap used where a tier field of 0 means "no limit"
// (e.g. platinum stakes) and for unlimited (-1) club limits.
const Unlimited int64 = 1<<62 - 1

// EffectiveMaxBigBlindCents returns the highest big blind (in cents) a tier may
// sit at. Platinum (catalog value 0) is unlimited. Free (catalog value 0, but
// "play chips only") is given a modest play cap so default $1/$2 tables keep
// working while real stakes require an upgrade.
func EffectiveMaxBigBlindCents(id string) int64 {
	def := GetTierDef(id)
	if id == "platinum" {
		return Unlimited
	}
	if def.MaxBigBlindCents <= 0 {
		return 200 // free: default play stake ($2 BB)
	}
	return def.MaxBigBlindCents
}

// CanCreateClub reports whether a user on `tier` who already owns `owned` clubs
// may create another (-1 = unlimited, 0 = cannot create).
func CanCreateClub(id string, owned int) bool {
	limit := GetTierDef(id).ClubCreateLimit
	if limit < 0 {
		return true
	}
	return owned < limit
}

// ClubMemberCap returns the member limit for a club owned by `tier`
// (-1 = unlimited → Unlimited).
func ClubMemberCap(id string) int64 {
	limit := GetTierDef(id).ClubMemberLimit
	if limit < 0 {
		return Unlimited
	}
	return int64(limit)
}
