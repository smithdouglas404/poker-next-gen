package rpc

import (
	"testing"
	"time"

	"github.com/smithdouglas404/poker-next-gen/backend-core/store"
)

// A comped month must never shorten a term someone already paid for. Grant
// computes its expiry as now+months, so without the extend branch a support
// agent adding a month to a member with ten months left would replace ten months
// with one — the exact screen that exists to make a customer whole would take
// nine months of paid membership away, silently.
func TestAdminGrantExpiry(t *testing.T) {
	now := time.Date(2026, 7, 27, 12, 0, 0, 0, time.UTC)
	future := now.AddDate(0, 10, 0)
	past := now.AddDate(0, -1, 0)

	paid := func(tier string, exp *time.Time) store.Subscription {
		return store.Subscription{Tier: tier, Status: "active", ExpiresAt: exp}
	}

	cases := []struct {
		name       string
		tier       string
		current    store.Subscription
		months     int
		wantExtend bool
		wantUntil  time.Time
	}{
		{
			name:       "same paid tier with time left extends from the existing expiry",
			tier:       "gold",
			current:    paid("gold", &future),
			months:     1,
			wantExtend: true,
			wantUntil:  future.AddDate(0, 1, 0),
		},
		{
			name:       "upgrade starts a new term",
			tier:       "platinum",
			current:    paid("gold", &future),
			months:     1,
			wantExtend: false,
		},
		{
			name:       "downgrade starts a new term",
			tier:       "silver",
			current:    paid("gold", &future),
			months:     1,
			wantExtend: false,
		},
		{
			name:       "free tier never extends",
			tier:       "free",
			current:    paid("free", nil),
			months:     3,
			wantExtend: false,
		},
		{
			name:       "same tier already lapsed starts a new term",
			tier:       "gold",
			current:    paid("gold", &past),
			months:     1,
			wantExtend: false,
		},
		{
			name:       "same tier with no expiry recorded starts a new term",
			tier:       "gold",
			current:    paid("gold", nil),
			months:     1,
			wantExtend: false,
		},
		{
			name:       "comping a member on free starts a new term",
			tier:       "gold",
			current:    paid("free", nil),
			months:     2,
			wantExtend: false,
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			until, extend := adminGrantExpiry(tc.tier, tc.current, tc.months, now)
			if extend != tc.wantExtend {
				t.Fatalf("extend = %v, want %v", extend, tc.wantExtend)
			}
			if !extend {
				return
			}
			if !until.Equal(tc.wantUntil) {
				t.Fatalf("until = %v, want %v", until, tc.wantUntil)
			}
			// The whole point: never shorter than what they already had.
			if until.Before(*tc.current.ExpiresAt) {
				t.Fatalf("extend shortened the term: %v < %v", until, *tc.current.ExpiresAt)
			}
		})
	}
}
