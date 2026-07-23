"use client";

import Link from "next/link";

const PILLARS = [
  {
    title: "Provably Fair",
    body: "Every deck is committed before the deal, your cards are encrypted and never shared, and the record is anchored on-chain. Verify every hand.",
    href: "/provably-fair",
    cta: "See how",
    accent: "#22c55e",
  },
  {
    title: "Own Your Club",
    body: "Run your own room. Set your rake (0–10%), invite your community, manage members, and earn. Club owners are entrepreneurs here.",
    href: "/clubs",
    cta: "Start a club",
    accent: "#e01e2b",
  },
  {
    title: "Crypto & Card",
    body: "Fund your wallet with 200+ cryptocurrencies or card. Withdraw with AML review + automated crypto payout. Membership tiers with real perks.",
    href: "/membership",
    cta: "View plans",
    accent: "#d4af37",
  },
];

const FEATURES = [
  ["GPU poker table", "Pixi/WebGPU felt with real dealing, chip, and showdown animation."],
  ["3D characters", "Rigged, animated characters at every seat — generate your own with AI."],
  ["Rust engine", "rs_poker: correct side pots, equity, and a CFR/GTO solver for coaching."],
  ["Live table audio", "Spatial chip/card SFX, a music picker, and per-character voice taunts."],
  ["Marketplace", "Buy, sell, and trade character skins and cosmetics with other members."],
  ["Tournaments", "Multi-table tournaments with blind timers and prize ladders."],
];

export function Landing() {
  return (
    <div className="min-h-screen overflow-hidden text-white">
      {/* Hero */}
      <section className="relative px-6 pt-24 pb-20 text-center">
        <div className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute left-1/2 top-0 h-[420px] w-[820px] -translate-x-1/2 rounded-full bg-[radial-gradient(ellipse,rgba(212,175,55,0.14),transparent_65%)]" />
          <div className="absolute left-1/2 top-40 h-[360px] w-[720px] -translate-x-1/2 rounded-full bg-[radial-gradient(ellipse,rgba(224,30,43,0.10),transparent_65%)]" />
        </div>
        <p className="font-display text-xs font-bold uppercase tracking-[0.35em] text-amber-300/80">
          High Rollers Club
        </p>
        <h1 className="font-display mx-auto mt-4 max-w-4xl text-5xl font-bold leading-[1.05] md:text-7xl">
          Where every hand is{" "}
          <span className="bg-gradient-to-r from-[#9a7b2c] via-[#d4af37] to-[#f3e2ad] bg-clip-text text-transparent">
            verified
          </span>
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg text-neutral-400">
          A provably-fair, community-first poker network. Own your club, play on a real GPU
          table with 3D characters, and move money in crypto or card — all on an engine you can
          verify.
        </p>
        <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/login"
            className="rounded-xl bg-gradient-to-r from-[#9a7b2c] via-[#d4af37] to-[#f3e2ad] px-7 py-3.5 text-sm font-bold text-black transition hover:shadow-[0_0_28px_rgba(212,175,55,0.4)]"
          >
            Play now
          </Link>
          <Link
            href="/table"
            className="rounded-xl border border-white/20 px-7 py-3.5 text-sm font-bold text-white transition hover:bg-white/5"
          >
            Enter a table →
          </Link>
          <Link
            href="/hub"
            className="rounded-xl border border-white/10 px-7 py-3.5 text-sm font-semibold text-neutral-300 transition hover:bg-white/5"
          >
            Command Center
          </Link>
        </div>
      </section>

      {/* Pillars */}
      <section className="mx-auto max-w-6xl px-6 pb-16">
        <div className="grid gap-4 md:grid-cols-3">
          {PILLARS.map((p) => (
            <div
              key={p.title}
              className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-6 backdrop-blur-xl transition hover:border-white/20"
            >
              <div className="h-1 w-10 rounded-full" style={{ backgroundColor: p.accent }} />
              <h3 className="font-display mt-4 text-xl font-bold">{p.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-neutral-400">{p.body}</p>
              <Link
                href={p.href}
                className="mt-4 inline-block text-sm font-semibold"
                style={{ color: p.accent }}
              >
                {p.cta} →
              </Link>
            </div>
          ))}
        </div>
      </section>

      {/* Feature grid */}
      <section className="mx-auto max-w-6xl px-6 pb-20">
        <h2 className="font-display mb-6 text-center text-2xl font-bold text-neutral-300">
          Built different
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map(([title, body]) => (
            <div key={title} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5">
              <h3 className="font-semibold text-white">{title}</h3>
              <p className="mt-1.5 text-xs leading-relaxed text-neutral-400">{body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-4xl px-6 pb-24 text-center">
        <div className="rounded-3xl border border-amber-400/30 bg-gradient-to-b from-amber-950/30 to-transparent p-10">
          <h2 className="font-display text-3xl font-bold">Ready to run your own room?</h2>
          <p className="mx-auto mt-3 max-w-xl text-neutral-400">
            Spin up a private club, set your rake, and bring your players to a table that plays
            fair and looks unreal.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Link
              href="/clubs"
              className="rounded-xl bg-gradient-to-r from-[#9a7b2c] via-[#d4af37] to-[#f3e2ad] px-6 py-3 text-sm font-bold text-black transition hover:shadow-[0_0_22px_rgba(212,175,55,0.35)]"
            >
              Start a club
            </Link>
            <Link
              href="/capabilities"
              className="rounded-xl border border-white/20 px-6 py-3 text-sm font-bold text-white transition hover:bg-white/5"
            >
              See all capabilities
            </Link>
          </div>
        </div>
        <p className="mt-10 text-xs text-neutral-600">
          High Rollers Club · provably-fair poker · play responsibly
        </p>
      </section>
    </div>
  );
}
