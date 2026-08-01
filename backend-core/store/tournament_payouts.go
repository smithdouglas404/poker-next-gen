package store

import (
	"errors"
	"fmt"
	"sort"

	"github.com/smithdouglas404/poker-next-gen/backend-core/models"
)

// Tournament prize distribution, in exactly one place.
//
// The ladder was walked inline in two places — the director's automatic finish
// (match/tournament/director.go) and the tournament_finalize RPC — with no
// bound on what the tiers said. Nothing validated a tier when it was created
// either, so a ladder adding up to more than 100% paid out more real money than
// the tournament collected, and a tournament with NO tiers took every buy-in
// and paid nobody at all. Both surfaces now call TournamentPayouts, which keeps
// the total inside the pool and always pays the field.

// TournamentPayout is one credit to make: a finisher and what they are owed.
type TournamentPayout struct {
	UserID      string `json:"user_id"`
	Username    string `json:"username"`
	Place       int    `json:"place"`
	AmountMinor int64  `json:"amount_minor"`
}

// ValidatePrizeTier checks one ladder tier in isolation: places count from 1st
// downwards, a tier covers a real range, and its share is a usable slice of the
// pool. The `validate:` struct tags are only read by the schema reflector for
// the admin UI, so this is what actually holds server-side.
func ValidatePrizeTier(p *models.PrizeDistributionPool) error {
	if p == nil {
		return errors.New("prize tier is required")
	}
	if p.RankFrom < 1 {
		return errors.New("rank_from must be at least 1")
	}
	if p.RankTo < p.RankFrom {
		return errors.New("rank_to must be at least rank_from")
	}
	if p.PayoutBps <= 0 || p.PayoutBps > 10000 {
		return errors.New("payout_bps must be between 1 and 10000")
	}
	if p.GuaranteedMinor < 0 {
		return errors.New("guaranteed_minor cannot be negative")
	}
	return nil
}

// ValidatePrizeLadder checks a tier against the tiers already configured: no
// two tiers may cover the same finishing place, and the ladder may not promise
// more than the whole pool.
func ValidatePrizeLadder(existing []models.PrizeDistributionPool, add *models.PrizeDistributionPool) error {
	if err := ValidatePrizeTier(add); err != nil {
		return err
	}
	total := int64(add.PayoutBps)
	for i := range existing {
		e := &existing[i]
		if add.RankFrom <= e.RankTo && e.RankFrom <= add.RankTo {
			return fmt.Errorf("places %d-%d are already paid by an existing tier (%d-%d)",
				add.RankFrom, add.RankTo, e.RankFrom, e.RankTo)
		}
		total += int64(e.PayoutBps)
	}
	if total > 10000 {
		return fmt.Errorf("prize ladder would pay %d%% of the pool; it cannot exceed 100%%", total/100)
	}
	return nil
}

// TournamentPayouts turns a prize ladder plus the finishing order into the
// exact credits to make.
//
// Tiers that cannot be honored (unordered ranks, non-positive share) are
// ignored. A ladder promising more than the pool is scaled down proportionally
// rather than over-paying it, and a tournament with no usable ladder pays the
// pool to first place instead of keeping the field's buy-ins. Each tier's share
// splits evenly across the places it covers, and the rounding dust from that
// split goes to the highest-finishing player in the tier, so the payouts sum to
// the tier's share exactly.
func TournamentPayouts(prizes []models.PrizeDistributionPool, finishers []Finisher, pool int64) []TournamentPayout {
	if pool <= 0 || len(finishers) == 0 {
		return nil
	}

	var usable []models.PrizeDistributionPool
	var totalBps int64
	for _, p := range prizes {
		if p.RankFrom < 1 || p.RankTo < p.RankFrom || p.PayoutBps <= 0 {
			continue
		}
		usable = append(usable, p)
		totalBps += int64(p.PayoutBps)
	}
	if len(usable) == 0 {
		usable = []models.PrizeDistributionPool{{RankFrom: 1, RankTo: 1, PayoutBps: 10000}}
		totalBps = 10000
	}
	// Never pay out more than the pool: an over-promised ladder is scaled by its
	// own total instead of by 100%.
	divisor := int64(10000)
	if totalBps > divisor {
		divisor = totalBps
	}

	sort.Slice(usable, func(i, j int) bool { return usable[i].RankFrom < usable[j].RankFrom })
	out := []TournamentPayout{}
	for _, tier := range usable {
		var inTier []Finisher
		for _, f := range finishers {
			if f.FinishPlace >= int(tier.RankFrom) && f.FinishPlace <= int(tier.RankTo) {
				inTier = append(inTier, f)
			}
		}
		if len(inTier) == 0 {
			continue
		}
		sort.Slice(inTier, func(i, j int) bool { return inTier[i].FinishPlace < inTier[j].FinishPlace })

		tierAmount := pool * int64(tier.PayoutBps) / divisor
		if tierAmount <= 0 {
			continue
		}
		share := tierAmount / int64(len(inTier))
		remainder := tierAmount % int64(len(inTier))
		for i, f := range inTier {
			amount := share
			if int64(i) < remainder {
				amount++
			}
			if amount <= 0 {
				continue
			}
			out = append(out, TournamentPayout{
				UserID:      f.UserID,
				Username:    f.Username,
				Place:       f.FinishPlace,
				AmountMinor: amount,
			})
		}
	}
	return out
}
