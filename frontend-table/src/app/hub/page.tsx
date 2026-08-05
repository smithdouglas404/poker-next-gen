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
// Gated on "club_admin", which RequireRole reads as platform_admin OR anyone
// administering a club — the super admin plus anyone granted ops
// responsibility. Not platform_admin alone: that is the ADMIN_USER_IDS env list
// and would lock out every club operator who has legitimate back-office work.
//
// Per-COMMAND visibility is already handled a layer down by canSeeCommand
// (`requires: platform_admin | club_admin`) and canRunInClub, so a club
// operator who gets in sees only their own commands, not the platform ones.
// This gate is about the door; that one is about the rooms.
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
    <RequireRole require="club_admin">
      <CommandCenter />
    </RequireRole>
  );
}
