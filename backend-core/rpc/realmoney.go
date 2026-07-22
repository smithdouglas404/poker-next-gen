package rpc

import (
	"os"

	"github.com/heroiclabs/nakama-common/runtime"
)

// Real-money kill switch (assessment SEC-2).
//
// Real cash is "under 2 months out". Until an operator explicitly turns it on,
// every path that moves real value (fiat deposit, crypto deposit, withdrawal)
// must fail CLOSED — a missing/false flag means no real money moves, so a
// mis-set env or a premature deploy can never accidentally accept funds. The
// KYC tier gate (verification-following-the-money) still applies on top of this;
// this is the outer launch switch.
func realMoneyEnabled() bool {
	return os.Getenv("REAL_MONEY_ENABLED") == "true"
}

// requireRealMoney rejects real-money movement unless the deployment has opted
// in. Default (unset) => blocked.
func requireRealMoney() error {
	if !realMoneyEnabled() {
		return runtime.NewError("real-money deposits and withdrawals are not enabled on this platform yet", 9)
	}
	return nil
}
