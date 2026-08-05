import { CommandCenter } from "@/features/commands/CommandCenter";
import { RequireRole } from "@/features/auth/RequireRole";

// OPS ONLY. This is not a player screen.
//
// The Command Center is a console GENERATED from the RPC registry — one form per
// backend action — so it reads as a wall of buttons while the rest of the app is
// designed screen by screen. That is fine for a diagnostics tool and wrong for
// anything a player sees.
//
// It was reachable from ~24 player-facing pages as "← Command Center", which
// made it the app's de-facto home, and /lobby's footer pointed About Us, Terms
// and Privacy straight at it. Those now go to /dashboard and LegalDialog.
//
// Of the 40 registered commands, 38 have a real screen (RICH_HOME signposts
// them). Only two are genuinely console-native:
//
//   antibot_score    per-player bot-pattern score — integrity tooling, no
//                    caller anywhere, and nothing a player should action
//   omaha_showdown   standalone "who wins these hands" evaluator. NOT dead game
//                    logic: real PLO showdowns route through
//                    ResolveOmahaShowdown via winnersAmong (showdown_async.go
//                    :121, sidepot.go:105). Only this RPC wrapper is unused.
//
// Plus liveness (healthz / stack_health), which also has /stack.
//
// NOTHING IS REMOVED. All 40 commands stay; this is an access change only.
//
// PLATFORM ADMIN ONLY (ADMIN_USER_IDS). Club owners do NOT belong here.
//
// This was briefly widened to club operators on the reasoning that they have
// back-office work to do. They do — but they already have a designed surface
// for it: the Owner Hub at /clubs, with Club Overview, Live Tables, Tournament
// Center, Member Registry, Operators & Equity, Announcements, Member Analytics,
// Revenue Reports and Global Settings, plus the approval, guest-session and
// settlement queues.
//
// Sending a club owner to a generated list of RPC forms when a real hub exists
// is a downgrade, not access. The console is the platform operator's raw tool;
// the Owner Hub is the club operator's product.
//
// Per-COMMAND visibility still exists a layer down (canSeeCommand's
// `requires: platform_admin | club_admin`, canRunInClub). That stays: it is
// what keeps the console honest for the one role that does reach it.
//
// The backend enforces every action regardless (adminCaller /
// requireClubConfigurer → 403), so this is UI defense-in-depth, not the
// security boundary. It stops PLAYERS landing on an operator tool.
//
// Worth being precise about what this console is and is not: it is a FASTER
// path to the same RPCs, not an override. `club_create` from here runs exactly
// the same server-side validation as /clubs/new — same checks, same refusals.
// It skips the wizard, not the rules.
export default function HubPage() {
  return (
    <RequireRole require="platform_admin">
      <CommandCenter />
    </RequireRole>
  );
}
