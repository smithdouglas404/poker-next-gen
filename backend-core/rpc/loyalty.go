package rpc

import (
	"context"
	"database/sql"
	"encoding/json"

	"github.com/heroiclabs/nakama-common/runtime"

	"github.com/smithdouglas404/poker-next-gen/backend-core/loyalty"
	"github.com/smithdouglas404/poker-next-gen/backend-core/store"
)

type achievementView struct {
	Code        string `json:"code"`
	Name        string `json:"name"`
	Description string `json:"description"`
	HRP         int64  `json:"hrp"`
	Unlocked    bool   `json:"unlocked"`
	UnlockedAt  string `json:"unlocked_at,omitempty"`
}

// LoyaltyGet returns the caller's HRP total, loyalty level + progress, tier
// multiplier, and their achievement progress (unlocked + locked catalog).
func LoyaltyGet(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	userID, err := callerID(ctx)
	if err != nil {
		return "", err
	}
	ls := store.NewLoyaltyStore(db)
	l, err := ls.Get(ctx, userID)
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	unlocked, err := ls.ListAchievements(ctx, userID)
	if err != nil {
		return "", runtime.NewError(err.Error(), 13)
	}
	unlockedAt := map[string]string{}
	for _, a := range unlocked {
		unlockedAt[a.Code] = a.UnlockedAt.UTC().Format("2006-01-02T15:04:05Z")
	}

	current, next, progress := loyalty.LevelFor(l.HRPTotal)
	tier := store.SubscriptionTier(ctx, db, userID)

	achievements := make([]achievementView, 0, len(loyalty.Catalog))
	for _, a := range loyalty.Catalog {
		when, ok := unlockedAt[a.Code]
		achievements = append(achievements, achievementView{
			Code:        a.Code,
			Name:        a.Name,
			Description: a.Description,
			HRP:         a.HRP,
			Unlocked:    ok,
			UnlockedAt:  when,
		})
	}

	resp := map[string]any{
		"hrp_total":    l.HRPTotal,
		"hands_played": l.HandsPlayed,
		"hands_won":    l.HandsWon,
		"tier":         tier,
		"multiplier":   loyalty.Multiplier(tier),
		"level":        current,
		"next_level":   next, // null at max level
		"progress":     progress,
		"achievements": achievements,
	}
	out, err := json.Marshal(resp)
	if err != nil {
		return "", err
	}
	return string(out), nil
}
