"use client";

import Link from "next/link";

import { cn } from "@/features/ui/tokens";
import { HandAudit } from "./HandAudit";

interface Props {
  matchId: string;
  handNo: number;
}

/**
 * Standalone, deep-linkable hand-audit detail surface reachable at
 * `/provably-fair/hand/<matchId>/<handNo>`. It wraps the shared {@link HandAudit}
 * panel (which loads `audit_verify_hand` + `hand_history` and reproduces the deck
 * locally, with a clearly-badged demo fallback) in its own page chrome so a single
 * hand's cryptographic proof can be shared, bookmarked, or opened from anywhere.
 */
export function HandAuditDetail({ matchId, handNo }: Props) {
  return (
    <div className="min-h-screen text-foreground">
      <header className="sticky top-0 z-20 border-b border-white/[0.06] bg-surface">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-6 px-6 py-4">
          <div className="flex items-center gap-4">
            <Link
              href="/provably-fair"
              aria-label="Back to fairness suite"
              className={cn(
                "flex h-9 w-9 items-center justify-center rounded-lg border border-white/[0.08]",
                "text-neutral-400 transition hover:border-white/20 hover:text-white",
              )}
            >
              ←
            </Link>
            <span className="font-display text-lg font-bold uppercase tracking-wider text-brand">
              Proof of Play
            </span>
          </div>
          <div className="flex items-center gap-5 text-xs font-bold uppercase tracking-wider">
            <Link href="/hub" className="text-neutral-400 transition hover:text-white">
              Lobby
            </Link>
            <Link href="/provably-fair" className="text-brand">
              Fairness
            </Link>
            <Link
              href="/provably-fair?tab=history"
              className="text-neutral-400 transition hover:text-white"
            >
              History
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-10">
        <HandAudit target={{ matchId, handNo }} />
      </main>
    </div>
  );
}
