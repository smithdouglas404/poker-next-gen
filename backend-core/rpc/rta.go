package rpc

import (
	"encoding/json"
	"os"

	"github.com/heroiclabs/nakama-common/runtime"
)

// Real-time assistance (RTA) policy — assessment S-1.
//
// Every competitor treats live solver/equity/coaching output as cheating. The
// rule: no equity/GTO/coaching while the caller is in an active hand at a table
// with real stakes. It is enforced HERE (server-side), not just hidden in the
// UI. Post-hand review and play-money/practice tables stay fully allowed — that
// split is the product's flagship "play on HRC, get coached by HRC" loop.
//
// The caller declares its context (`live`, `stakes`) in the assistance payload;
// the honest production client sets these at a live stakes table mid-hand. An
// operator can lift the block for a vetted deployment with RTA_LIVE_ALLOWED=true
// (e.g. an all-practice environment). Default is fail-safe: block.
type rtaContext struct {
	Live   bool `json:"live"`   // caller is in an active hand right now
	Stakes bool `json:"stakes"` // the table plays for real value (not play-money/practice)
}

// guardRTA rejects live real-time assistance at real-stakes tables unless the
// deployment explicitly opts in. Empty/absent flags => treated as review/
// analysis (allowed), so tools, calculators, and post-hand review are unaffected.
func guardRTA(payload string) error {
	if os.Getenv("RTA_LIVE_ALLOWED") == "true" {
		return nil
	}
	var c rtaContext
	if payload != "" {
		_ = json.Unmarshal([]byte(payload), &c)
	}
	if c.Live && c.Stakes {
		return runtime.NewError(
			"live real-time assistance is disabled at real-stakes tables — this is available in post-hand review", 9)
	}
	return nil
}
