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
// Gated on platform_admin. The backend already enforces every action
// (adminCaller / requireClubConfigurer → 403), so this is UI defense-in-depth,
// not the security boundary — it stops players landing on an operator tool.
export default function HubPage() {
  return (
    <RequireRole require="platform_admin">
      <CommandCenter />
    </RequireRole>
  );
}
