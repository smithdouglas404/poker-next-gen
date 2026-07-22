"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { BTN_GOLD, GLASS_PANEL, GLASS_PANEL_HOVER, HEADING_SM, cn } from "@/features/ui/tokens";
import { LegalDialog, type LegalDoc } from "./LegalDialog";
import { LiveStatsBand } from "./LiveStatsBand";
import { RecoveryDialog } from "./RecoveryDialog";
import { SupportDialog } from "./SupportDialog";
import { landingApi, type SiteSettings } from "./landingRpc";

const PILLARS = [
  {
    title: "Provably Fair",
    body: "Every deck is committed before the deal, your cards are encrypted and never shared, and the record is anchored on-chain. Verify any hand yourself.",
    href: "/provably-fair",
    cta: "See how it works",
    accent: "#34d399",
  },
  {
    title: "Own Your Club",
    body: "Run your own room. Set your rake 0–10%, invite your community, manage members, and earn. Club owners are entrepreneurs here.",
    href: "/clubs",
    cta: "Start a club",
    accent: "#81ecff",
  },
  {
    title: "Crypto & Card",
    body: "Fund your wallet with 200+ cryptocurrencies or card. Withdraw with AML review and automated payout. Membership tiers with real perks.",
    href: "/membership",
    cta: "View plans",
    accent: "#d4af37",
  },
];

const FEATURES = [
  ["GPU poker table", "Real WebGPU felt with cinematic dealing, chip, and showdown animation.", "#81ecff"],
  ["3D characters", "Rigged, animated characters at every seat — generate your own with AI.", "#b44dff"],
  ["Rust engine", "rs_poker: correct side pots, equity, and a GTO solver for live coaching.", "#34d399"],
  ["Live table audio", "Spatial chip & card SFX, a music picker, and per-character voice taunts.", "#22d3ee"],
  ["Marketplace", "Buy, sell, and trade character skins and cosmetics with other members.", "#d4af37"],
  ["Tournaments", "Multi-table tournaments with blind timers and stacked prize ladders.", "#f3e2ad"],
] as const;

export function LandingClient() {
  const [settings, setSettings] = useState<SiteSettings | null>(null);
  const [supportOpen, setSupportOpen] = useState(false);
  const [recoveryOpen, setRecoveryOpen] = useState(false);
  const [legal, setLegal] = useState<LegalDoc>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const res = await landingApi.siteSettings();
        if (alive) setSettings(res.settings);
      } catch {
        /* branding falls back to defaults — never blocks the page */
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const siteName = settings?.site_name ?? "High Rollers Club";
  const socials: Array<{ label: string; href: string }> = [];
  if (settings?.discord_url) socials.push({ label: "Discord", href: settings.discord_url });
  if (settings?.twitter_url) socials.push({ label: "Twitter / X", href: settings.twitter_url });

  return (
    <div className="min-h-screen overflow-hidden text-foreground">
      {/* Hero */}
      <section className="relative px-6 pt-24 pb-14 text-center">
        <div className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute left-1/2 top-0 h-[440px] w-[860px] -translate-x-1/2 rounded-full bg-[radial-gradient(ellipse,rgba(212,175,55,0.14),transparent_65%)]" />
          <div className="absolute left-1/2 top-44 h-[380px] w-[760px] -translate-x-1/2 rounded-full bg-[radial-gradient(ellipse,rgba(129,236,255,0.10),transparent_65%)]" />
          <div className="absolute left-[12%] top-24 h-40 w-40 rounded-full bg-[radial-gradient(circle,rgba(180,77,255,0.10),transparent_70%)]" />
        </div>

        <p className={cn(HEADING_SM, "text-gold/80 tracking-[0.35em]")}>{siteName}</p>
        <h1 className="font-display mx-auto mt-5 max-w-4xl text-5xl font-bold uppercase leading-[1.03] tracking-tight md:text-7xl">
          Where every hand is{" "}
          <span className="bg-gradient-to-r from-[#9a7b2c] via-[#d4af37] to-[#f3e2ad] bg-clip-text text-transparent">
            verified
          </span>
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-neutral-400">
          A provably-fair, community-first poker network. Own your club, play on a real GPU table
          with 3D characters, and move money in crypto or card — all on an engine you can verify.
        </p>
        <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/login"
            className={cn(BTN_GOLD, "rounded-xl px-7 py-3.5 text-sm uppercase tracking-wide")}
          >
            Play now
          </Link>
          <Link
            href="/table"
            className={cn(
              GLASS_PANEL,
              GLASS_PANEL_HOVER,
              "rounded-xl px-7 py-3.5 text-sm font-bold text-white",
            )}
          >
            Enter a table
          </Link>
          <Link
            href="/hub"
            className="rounded-xl px-7 py-3.5 text-sm font-semibold text-neutral-300 transition hover:text-white"
          >
            Command Center →
          </Link>
        </div>
      </section>

      {/* Live-stats band — wired to stats_global + presence_online */}
      <LiveStatsBand />

      {/* Pillars */}
      <section className="mx-auto max-w-6xl px-6 pb-6 pt-10">
        <div className="grid gap-4 md:grid-cols-3">
          {PILLARS.map((p) => (
            <div key={p.title} className={cn(GLASS_PANEL, GLASS_PANEL_HOVER, "group p-6")}>
              <div
                className="h-1 w-12 rounded-full"
                style={{ backgroundColor: p.accent, boxShadow: `0 0 16px ${p.accent}` }}
              />
              <h3 className="font-display mt-4 text-xl font-bold uppercase tracking-wide">{p.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-neutral-400">{p.body}</p>
              <Link
                href={p.href}
                className="mt-4 inline-flex items-center gap-1 text-sm font-semibold transition group-hover:gap-2"
                style={{ color: p.accent }}
              >
                {p.cta} →
              </Link>
            </div>
          ))}
        </div>
      </section>

      {/* Feature grid */}
      <section className="mx-auto max-w-6xl px-6 pb-16 pt-10">
        <p className={cn(HEADING_SM, "text-center text-gold/70")}>Built different</p>
        <h2 className="font-display mb-8 mt-2 text-center text-3xl font-bold uppercase tracking-wide">
          The whole table, reimagined
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map(([title, body, accent]) => (
            <div key={title} className={cn(GLASS_PANEL, GLASS_PANEL_HOVER, "p-5")}>
              <div className="mb-3 h-8 w-8 rounded-lg" style={{ background: `linear-gradient(135deg, ${accent}, transparent)` }} />
              <h3 className="font-display text-base font-bold uppercase tracking-wide text-white">{title}</h3>
              <p className="mt-1.5 text-xs leading-relaxed text-neutral-400">{body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-4xl px-6 pb-20 text-center">
        <div className={cn(GLASS_PANEL, "relative overflow-hidden border-gold/25 p-10")}>
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(212,175,55,0.12),transparent_60%)]" />
          <h2 className="font-display text-3xl font-bold uppercase tracking-wide">
            Ready to run your own room?
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-neutral-400">
            Spin up a private club, set your rake, and bring your players to a table that plays fair
            and looks unreal.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Link
              href="/clubs"
              className={cn(BTN_GOLD, "rounded-xl px-6 py-3 text-sm uppercase tracking-wide")}
            >
              Start a club
            </Link>
            <Link
              href="/capabilities"
              className={cn(GLASS_PANEL, GLASS_PANEL_HOVER, "rounded-xl px-6 py-3 text-sm font-bold text-white")}
            >
              See all capabilities
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/[0.06] px-6 py-10">
        <div className="mx-auto flex max-w-6xl flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
          <div className="max-w-xs">
            <p className="font-display text-lg font-bold uppercase tracking-wide">{siteName}</p>
            <p className="mt-2 text-xs leading-relaxed text-neutral-500">
              Provably-fair poker. Play responsibly — you must be of legal age in your jurisdiction.
            </p>
          </div>

          <div className="flex flex-wrap gap-x-12 gap-y-6">
            <nav className="flex flex-col gap-2">
              <p className={cn(HEADING_SM, "text-neutral-500")}>Company</p>
              <button
                type="button"
                onClick={() => setLegal("about")}
                className="text-left text-sm text-neutral-400 transition hover:text-cyan"
              >
                About
              </button>
              <button
                type="button"
                onClick={() => setLegal("terms")}
                className="text-left text-sm text-neutral-400 transition hover:text-cyan"
              >
                Terms
              </button>
              <button
                type="button"
                onClick={() => setLegal("privacy")}
                className="text-left text-sm text-neutral-400 transition hover:text-cyan"
              >
                Privacy
              </button>
            </nav>

            <nav className="flex flex-col gap-2">
              <p className={cn(HEADING_SM, "text-neutral-500")}>Help</p>
              <button
                type="button"
                onClick={() => setSupportOpen(true)}
                className="text-left text-sm text-neutral-400 transition hover:text-cyan"
              >
                Contact support
              </button>
              <button
                type="button"
                onClick={() => setRecoveryOpen(true)}
                className="text-left text-sm text-neutral-400 transition hover:text-cyan"
              >
                Recover account
              </button>
              <Link href="/provably-fair" className="text-sm text-neutral-400 transition hover:text-cyan">
                Verify a hand
              </Link>
            </nav>

            <nav className="flex flex-col gap-2">
              <p className={cn(HEADING_SM, "text-neutral-500")}>Social</p>
              {socials.length > 0 ? (
                socials.map((s) => (
                  <a
                    key={s.label}
                    href={s.href}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sm text-neutral-400 transition hover:text-gold"
                  >
                    {s.label}
                  </a>
                ))
              ) : (
                <span className="text-sm text-neutral-600">Coming soon</span>
              )}
              {settings?.support_email && (
                <a
                  href={`mailto:${settings.support_email}`}
                  className="text-sm text-neutral-400 transition hover:text-gold"
                >
                  Email us
                </a>
              )}
            </nav>
          </div>
        </div>
        <p className="mx-auto mt-8 max-w-6xl text-xs text-neutral-600">
          © {new Date().getFullYear()} {siteName}. All rights reserved.
        </p>
      </footer>

      <SupportDialog
        open={supportOpen}
        onClose={() => setSupportOpen(false)}
        supportEmail={settings?.support_email}
      />
      <RecoveryDialog open={recoveryOpen} onClose={() => setRecoveryOpen(false)} />
      <LegalDialog doc={legal} onClose={() => setLegal(null)} />
    </div>
  );
}
