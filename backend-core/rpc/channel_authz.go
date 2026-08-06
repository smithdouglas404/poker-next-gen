package rpc

import (
	"context"
	"database/sql"
	"strings"

	"github.com/heroiclabs/nakama-common/api"
	"github.com/heroiclabs/nakama-common/rtapi"
	"github.com/heroiclabs/nakama-common/runtime"

	"github.com/smithdouglas404/poker-next-gen/backend-core/store"
)

// SPIKE — not wired to any client. Registered so the behaviour can be MEASURED.
//
// Nakama ROOM channels are addressed by name and carry no membership concept:
// measured before this hook existed, an account with no membership of any kind
// joined a room named after a club, posted to it, and read the whole history
// back, while club_chat_send/club_chat_list correctly refused both with 403.
// That single fact is what ruled Nakama's built-in chat out.
//
// It should not have. GROUP channels do enforce membership, and clubs are not
// Nakama groups — but that is not the only route. RegisterBeforeRt can reject a
// realtime message before the pipeline handles it, so a room join can be gated
// against poker_club_member directly, with no group mirroring and no second
// membership system to keep in sync.
//
// The gate deliberately applies ONLY to targets that look like a club id.
// Everything else is passed through untouched: this hook must not become a
// second, quieter place where chat authorisation lives. If Nakama channels are
// adopted, every private channel needs an explicit rule here, and a target that
// matches no rule should be refused rather than allowed — but that decision
// belongs with the adoption, not with this measurement.
//
// Fails CLOSED, for the same reason the guest-approval gate does: a DB error
// means "not a member". A wrong refusal costs someone a reconnect; a wrong
// approval puts a stranger in a club's private chat.
func BeforeChannelJoinClubGate(
	ctx context.Context,
	logger runtime.Logger,
	db *sql.DB,
	nk runtime.NakamaModule,
	in *rtapi.Envelope,
) (*rtapi.Envelope, error) {
	join := in.GetChannelJoin()
	if join == nil {
		return in, nil
	}
	target := join.GetTarget()
	if !strings.HasPrefix(target, "club_") {
		return in, nil // not a club channel — not this hook's business
	}

	userID, ok := ctx.Value(runtime.RUNTIME_CTX_USER_ID).(string)
	if !ok || userID == "" {
		return nil, runtime.NewError("authentication required", 16)
	}

	m, err := store.NewClubStore(db).GetMembership(ctx, target, userID)
	if err != nil {
		logger.WithField("club_id", target).WithField("error", err.Error()).
			Warn("club channel join refused: membership lookup failed")
		return nil, runtime.NewError("only club members can join club chat", 7)
	}
	if m == nil {
		return nil, runtime.NewError("only club members can join club chat", 7)
	}
	return in, nil
}

// clubMemberOf returns the club id a channel target/id belongs to, or "" if the
// target is not a club channel. Channel IDs are DERIVABLE from the club id —
// a room channel for club_abc is addressed as "2..club_abc" — so the club id
// has to be recovered by substring, not by equality.
func clubIDFromChannel(s string) string {
	i := strings.Index(s, "club_")
	if i < 0 {
		return ""
	}
	id := s[i:]
	if j := strings.IndexAny(id, ".:"); j >= 0 {
		id = id[:j]
	}
	return id
}

// BeforeListChannelMessagesClubGate closes the hole the join gate leaves open.
//
// Gating ChannelJoin is NOT sufficient, and only probing found that out.
// ListChannelMessages is a REST call that takes a channel id directly — it never
// joins — and the channel id is derivable from the club id. Measured with the
// join hook already active: a stranger refused the join still read the club's
// history back, in full.
//
// The lesson is bigger than this hook: Nakama's chat has more than one door,
// and closing the obvious one produced a system that LOOKED gated. Anything
// adopting these channels needs both gates and a check that no third path
// exists for the message type in question.
func BeforeListChannelMessagesClubGate(
	ctx context.Context,
	logger runtime.Logger,
	db *sql.DB,
	nk runtime.NakamaModule,
	in *api.ListChannelMessagesRequest,
) (*api.ListChannelMessagesRequest, error) {
	clubID := clubIDFromChannel(in.GetChannelId())
	if clubID == "" {
		return in, nil
	}
	userID, ok := ctx.Value(runtime.RUNTIME_CTX_USER_ID).(string)
	if !ok || userID == "" {
		return nil, runtime.NewError("authentication required", 16)
	}
	m, err := store.NewClubStore(db).GetMembership(ctx, clubID, userID)
	if err != nil || m == nil {
		return nil, runtime.NewError("only club members can read club chat", 7)
	}
	return in, nil
}
