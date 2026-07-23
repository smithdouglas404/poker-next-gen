"use client";

import Link from "next/link";

import { Panel, SectionHeader } from "@/features/ui";
import { BTN_GOLD, cn } from "@/features/ui/tokens";

interface Capability {
  title: string;
  detail: string;
}

interface Group {
  heading: string;
  blurb: string;
  accent: string;
  items: Capability[];
}

const GROUPS: Group[] = [
  {
    heading: "Provably-Fair Engine",
    blurb: "A real poker engine, not a scripted table — server-authoritative and verifiable.",
    accent: "#f5c518",
    items: [
      { title: "Authoritative match runtime", detail: "Every deal, bet, and showdown is resolved on the server (Nakama match handler) — clients can't forge state." },
      { title: "rs_poker hand evaluation", detail: "Rust-powered hand ranking, correct multi-way side-pots, and showdown resolution. No shortcuts." },
      { title: "Provably-fair shuffle", detail: "SHA-256 deck commitment revealed each hand + an append-only audit trail you can verify." },
      { title: "GTO / CFR solver", detail: "A counterfactual-regret solver (rs_poker arena) powers study-and-review coaching and equity/ICM tools — never fed a live opponent's cards. See Game Integrity." },
    ],
  },
  {
    heading: "Real-Money Economy",
    blurb: "A single authoritative ledger with the full deposit → play → cash-out loop.",
    accent: "#22c55e",
    items: [
      { title: "Memberships & tiers", detail: "Five recurring tiers (Stripe subscriptions) unlocking stakes, limits, rakeback, and perks." },
      { title: "Crypto + card funding", detail: "Deposit with 200+ cryptocurrencies (NOWPayments) or card (Stripe). Wallet credited on confirmation." },
      { title: "Withdrawals with AML review", detail: "Held on request, reviewed by an operator; automated crypto payout on approve." },
      { title: "Rakeback & daily bonus", detail: "Rake flows back to players by tier; daily chip bonuses with streaks — all ledgered." },
    ],
  },
  {
    heading: "Private Clubs",
    blurb: "Run your own room — the heart of the network.",
    accent: "#e01e2b",
    items: [
      { title: "Owner-operated clubs", detail: "Create a club (one-time ownership fee), set custom rake, and run your own tables." },
      { title: "Member management", detail: "Roles (owner / admin / member), invites, kicks, and per-tier member capacity." },
      { title: "Club rake & ledger", detail: "Configurable rake with caps; every drop recorded to the club's house ledger." },
      { title: "KYC & geofencing-ready", detail: "Gate high tiers behind identity verification; region controls in the data model." },
    ],
  },
  {
    heading: "Tournaments & Social",
    blurb: "Native Nakama social features, wired in.",
    accent: "#9aa0a6",
    items: [
      { title: "Multi-table tournaments", detail: "MTT scheduling, blind timers, prize ladders, and table balancing." },
      { title: "Leaderboards", detail: "Native Nakama leaderboards updated from authoritative results." },
      { title: "Matchmaking", detail: "Queue into cash games by stake and club with server-side matchmaking." },
      { title: "Anti-bot & coaching", detail: "Bot-likelihood scoring plus a local AI coach that grades your spots." },
    ],
  },
  {
    heading: "Premium Experience",
    blurb: "The look and feel that sets us apart from every other client.",
    accent: "#ffd54a",
    items: [
      { title: "3D / 2.5D characters", detail: "Animated characters seated at the felt — idle, turn, win, and fold reactions." },
      { title: "Spatial audio", detail: "Positional chip/card SFX, a synth chip engine, and an in-game music picker." },
      { title: "Voice taunts", detail: "Per-character voice lines broadcast to the whole table over the chat channel." },
      { title: "Cosmetics marketplace (soon)", detail: "Buy character skins, taunts, and card backs with points or chips — and resell to members." },
    ],
  },
];

export default function CapabilitiesPage() {
  return (
    <div className="min-h-screen text-white">
      <header className="border-b border-white/10 px-6 py-10">
        <div className="mx-auto flex max-w-6xl flex-col gap-4">
          <div className="flex items-center justify-between">
            <SectionHeader>What sets us apart</SectionHeader>
            <Link href="/hub" className="text-sm text-neutral-400 transition hover:text-white">
              ← Command Center
            </Link>
          </div>
          <h1 className="font-display text-4xl font-bold md:text-5xl">
            A poker network built like{" "}
            <span className="bg-gradient-to-r from-[#d4a80f] via-[#f5c518] to-[#ffd54a] bg-clip-text text-transparent">
              nothing else
            </span>
          </h1>
          <p className="max-w-2xl text-neutral-400">
            Provably-fair Rust engine, authoritative Nakama runtime, a complete real-money
            economy, owner-operated clubs, and a premium 3D experience — one platform.
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-10 px-6 py-12">
        {GROUPS.map((g) => (
          <section key={g.heading}>
            <div className="flex items-baseline gap-3">
              <h2 className="font-display text-2xl font-bold" style={{ color: g.accent }}>
                {g.heading}
              </h2>
              <p className="text-sm text-neutral-500">{g.blurb}</p>
            </div>
            <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {g.items.map((it) => (
                <Panel key={it.title} className="p-5" hover>
                  <div className="h-1 w-8 rounded-full" style={{ backgroundColor: g.accent }} />
                  <h3 className="mt-3 font-semibold text-white">{it.title}</h3>
                  <p className="mt-1.5 text-xs leading-relaxed text-neutral-400">{it.detail}</p>
                </Panel>
              ))}
            </div>
          </section>
        ))}

        <section className="rounded-2xl border border-amber-400/30 bg-gradient-to-r from-amber-950/30 to-transparent p-8 text-center">
          <h2 className="font-display text-2xl font-bold">Ready to run your own room?</h2>
          <p className="mx-auto mt-2 max-w-xl text-sm text-neutral-400">
            Spin up a private club, set your rake, and bring your players to a table that
            plays fair and looks unreal.
          </p>
          <Link
            href="/clubs"
            className={cn(BTN_GOLD, "mt-5 inline-block rounded-xl px-6 py-3 text-sm")}
          >
            Start a club →
          </Link>
        </section>
      </main>
    </div>
  );
}
