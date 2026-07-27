package rpc

import (
	"context"
	"database/sql"

	"github.com/heroiclabs/nakama-common/api"
	"github.com/heroiclabs/nakama-common/runtime"

	"github.com/smithdouglas404/poker-next-gen/backend-core/store"
)

// Enforcing "Ban account".
//
// admin_ban (and antibot_ban) have existed since the admin console shipped, and
// until this file, banning a user did NOTHING except flip a database column
// nothing else read. The admin clicked Ban, got "Banned <user>", and the
// account could authenticate and play immediately after — through any of the
// three auth paths the client actually uses (Clerk-bridged custom auth, guest
// device auth, or email/password). None of them checked it.
//
// The fix is an After-authenticate hook rather than a Before one: by the time
// Nakama calls an After hook the account has been resolved (or just created),
// so RUNTIME_CTX_USER_ID is populated in ctx exactly as it is for any other
// authenticated RPC — the same identity ordinary gates like callerID() read.
// Returning a non-nil error from an After-authenticate hook is Nakama's
// documented mechanism for refusing to hand back a session even though
// authentication itself succeeded; the client gets an error, not a token.
//
// Stated limit: this blocks the NEXT login, not an already-open connection. A
// player mid-session when banned is not force-disconnected. Real-time kick
// would need a presence lookup this module doesn't otherwise need and isn't
// worth the added surface for what is, in practice, a rare admin action
// followed by the player's session naturally expiring or reconnecting.
func denyIfBanned(ctx context.Context, logger runtime.Logger, db *sql.DB) error {
	userID, _ := ctx.Value(runtime.RUNTIME_CTX_USER_ID).(string)
	banned, reason, err := store.IsBanned(ctx, db, userID)
	if err != nil {
		logger.Error("ban check failed for %s, refusing session as a precaution: %v", userID, err)
		return runtime.NewError("could not verify account status", 13)
	}
	if !banned {
		return nil
	}
	msg := "this account has been suspended"
	if reason != "" {
		msg += ": " + reason
	}
	return runtime.NewError(msg, 7)
}

// AfterAuthenticateCustomDenyBanned gates the Clerk-bridged login path.
func AfterAuthenticateCustomDenyBanned(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, out *api.Session, in *api.AuthenticateCustomRequest) error {
	return denyIfBanned(ctx, logger, db)
}

// AfterAuthenticateDeviceDenyBanned gates the guest device login path.
func AfterAuthenticateDeviceDenyBanned(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, out *api.Session, in *api.AuthenticateDeviceRequest) error {
	return denyIfBanned(ctx, logger, db)
}

// AfterAuthenticateEmailDenyBanned gates the email/password login path.
func AfterAuthenticateEmailDenyBanned(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, out *api.Session, in *api.AuthenticateEmailRequest) error {
	return denyIfBanned(ctx, logger, db)
}
