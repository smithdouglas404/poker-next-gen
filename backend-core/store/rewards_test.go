package store

import "testing"

// Redemption status decides whether a player gets their points back. It used to
// be a silent coercion, and the failure mode was maximally bad, so the rule is
// pinned here.

func TestValidRedemptionStatus(t *testing.T) {
	for _, ok := range []string{RedemptionFulfilled, RedemptionCancelled} {
		if !ValidRedemptionStatus(ok) {
			t.Errorf("%q rejected but is a legal terminal status", ok)
		}
	}
	// The dangerous inputs. Each of these used to become "fulfilled": the reward
	// marked delivered, the points kept, and no way back once the row left
	// `pending`. An operator who typed "cancel" instead of "cancelled" would have
	// destroyed the player's points while believing they had refunded them.
	for _, bad := range []string{"", "cancel", "canceled", "refunded", "Fulfilled", "pending", "FULFILLED"} {
		if ValidRedemptionStatus(bad) {
			t.Errorf("%q accepted as a terminal status", bad)
		}
	}
}

func TestRedemptionStatusConstants(t *testing.T) {
	// The strings are the persisted column values and the ones the admin client
	// sends; renaming either side silently would strand pending redemptions.
	if RedemptionFulfilled != "fulfilled" || RedemptionCancelled != "cancelled" {
		t.Errorf("redemption status constants changed: %q / %q", RedemptionFulfilled, RedemptionCancelled)
	}
	// "pending" is the initial state CreateRedemption writes and the predicate
	// FulfilRedemption matches on; it must not be reachable as a terminal status.
	if ValidRedemptionStatus("pending") {
		t.Error("\"pending\" accepted as terminal — a redemption could be 'resolved' back to unresolved")
	}
}
