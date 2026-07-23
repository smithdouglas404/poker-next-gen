"use client";

import Link from "next/link";

import { Panel, SectionHeader } from "@/features/ui";
import { cn } from "@/features/ui/tokens";

// Game Integrity & Tools — the single player-facing fair-play policy (P0-6).
// Consolidates the platform's stance on dealing fairness, information symmetry,
// third-party/solver tools, and bot disclosure into one page. Every claim here
// is true of the shipped system (provably-fair shuffle, own-hand-only HUD,
// study-only solver, always-badged bots that are blocked on real-money tables).

interface Item {
  title: string;
  detail: string;
}
interface Group {
  heading: string;
  blurb: string;
  accent: string;
  items: Item[];
}

const GROUPS: Group[] = [
  {
    heading: "Provably-fair dealing",
    blurb: "The deck is committed before the deal and revealed after — you can verify it yourself.",
    accent: "#f5c518",
    items: [
      {
        title: "Commit before the deal",
        detail:
          "Each hand the server draws a 256-bit seed from the OS CSPRNG and publishes a SHA-256 commitment before any card is dealt — it cannot change the deck after seeing the action.",
      },
      {
        title: "Reveal & verify after",
        detail:
          "When the hand ends the seed is revealed. A SHA-256-CTR keystream drives a Fisher–Yates shuffle in the Rust engine (rs_poker); anyone can recompute the exact deck and confirm it matches the commitment.",
      },
      {
        title: "No external oracle",
        detail:
          "There is no 'quantum RNG', blockchain VRF, or third-party randomness in the loop — just a standard, auditable OS CSPRNG pipeline you can reproduce.",
      },
    ],
  },
  {
    heading: "Equal information at the table",
    blurb: "Every player sees the same tools. No one can buy an information edge over the table.",
    accent: "#22c55e",
    items: [
      {
        title: "Your own hand only",
        detail:
          "The in-client HUD shows your own equity and hand strength — computed from the public board and your own cards. It never reveals opponents' hidden cards.",
      },
      {
        title: "No purchased opponent stats",
        detail:
          "We do not sell or surface per-opponent tracking overlays. The same HUD is available to every player, so there is no pay-to-win information asymmetry.",
      },
    ],
  },
  {
    heading: "Study tools, not live assistance",
    blurb: "Solver and coaching are for learning and post-game review — not real-time bots in your ear.",
    accent: "#f3e2ad",
    items: [
      {
        title: "GTO / solver is a study tool",
        detail:
          "The CFR solver and coaching tips run over hands you enter yourself or your own completed history. They are never fed a live opponent's hidden cards during a hand in progress.",
      },
      {
        title: "Post-game review",
        detail:
          "Hand-by-hand analysis is designed for after the session — replay a hand, see where equity shifted, and learn. It is not an automated real-time advisor at the live table.",
      },
    ],
  },
  {
    heading: "Bots are always disclosed",
    blurb: "AI seats are labeled for everyone, and they never sit in a real-money game.",
    accent: "#e01e2b",
    items: [
      {
        title: "BOT badge for all players",
        detail:
          "Any AI-controlled seat carries a visible BOT badge that every player at the table sees. AI players are disclosed at the wire level — there is no way to hide one as a human.",
      },
      {
        title: "Blocked on real-money tables",
        detail:
          "Bots are practice opponents only. When real-money play is enabled a table seats zero bots, and the add-bot host control is disabled.",
      },
    ],
  },
  {
    heading: "Anti-collusion & anti-bot monitoring",
    blurb: "Automated integrity checks run behind the scenes with human review.",
    accent: "#9aa0a6",
    items: [
      {
        title: "Bot-likelihood scoring",
        detail:
          "Play patterns are scored for automation. High-signal accounts are surfaced to operators for review — the scoring itself is never exposed to players.",
      },
      {
        title: "Collusion review queue",
        detail:
          "Suspicious multi-account patterns are flagged for a human integrity review before any action is taken.",
      },
    ],
  },
];

export default function IntegrityPage() {
  return (
    <div className="min-h-screen text-white">
      <header className="border-b border-white/10 px-6 py-10">
        <div className="mx-auto flex max-w-6xl flex-col gap-4">
          <div className="flex items-center justify-between">
            <SectionHeader>Game Integrity &amp; Tools</SectionHeader>
            <Link href="/hub" className="text-sm text-neutral-400 transition hover:text-white">
              ← Command Center
            </Link>
          </div>
          <h1 className="font-display text-4xl font-bold md:text-5xl">
            Fair by{" "}
            <span className="bg-gradient-to-r from-[#ff2d3f] via-[#e01e2b] to-[#b3151f] bg-clip-text text-transparent">
              design
            </span>
          </h1>
          <p className="max-w-2xl text-neutral-400">
            How High Rollers Club keeps the game honest: a provably-fair deal you can verify, equal
            information for every player, study tools that never touch a live hand, and bots that are
            always disclosed and never play for real money.
          </p>
          <div>
            <Link
              href="/provably-fair"
              className="inline-flex items-center rounded-full border border-[#e01e2b]/40 bg-[#e01e2b]/10 px-4 py-2 text-sm font-semibold text-[#ff6b73] transition hover:bg-[#e01e2b]/20"
            >
              Verify a hand →
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-10">
        <div className="grid gap-6 md:grid-cols-2">
          {GROUPS.map((g) => (
            <Panel key={g.heading} className="p-6">
              <div className="flex items-center gap-3">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: g.accent }} aria-hidden />
                <h2 className="font-display text-xl font-bold uppercase tracking-wide">{g.heading}</h2>
              </div>
              <p className="mt-1 text-sm text-neutral-400">{g.blurb}</p>
              <ul className="mt-4 space-y-4">
                {g.items.map((it) => (
                  <li key={it.title}>
                    <p className="text-sm font-semibold text-white">{it.title}</p>
                    <p className="mt-0.5 text-sm leading-relaxed text-neutral-400">{it.detail}</p>
                  </li>
                ))}
              </ul>
            </Panel>
          ))}
        </div>

        <p className={cn("mt-8 text-center text-sm text-neutral-500")}>
          Spotted something that doesn&apos;t look right?{" "}
          <a href="mailto:support@highrollers.club" className="text-neutral-300 underline hover:text-white">
            Report a game-integrity concern
          </a>
          .
        </p>
      </main>
    </div>
  );
}
