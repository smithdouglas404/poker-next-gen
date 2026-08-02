"use client";
// ── HIGH ROLLERS CLUB — Landing Page v2 ──────────────────────────────────────
// Premium dark-casino aesthetic. Playfair Display headings, Inter body.
// Asymmetric hero, animated stats band, icon-rich feature grid, gold CTA.
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { BTN_GOLD, GLASS_PANEL, GLASS_PANEL_HOVER, HEADING_SM, cn } from "@/features/ui/tokens";
import { LegalDialog, type LegalDoc } from "./LegalDialog";
import { LiveStatsBand } from "./LiveStatsBand";
import { RecoveryDialog } from "./RecoveryDialog";
import { SupportDialog } from "./SupportDialog";
import { landingApi, type SiteSettings } from "./landingRpc";

// ── Content constants ─────────────────────────────────────────────────────────
const PILLARS = [
  {
    title: "Provably Fair",
    body: "Every deck is committed before the deal, your cards are encrypted and never shared, and the record is anchored on-chain. Verify any hand yourself.",
    href: "/provably-fair",
    cta: "See how it works",
    accent: "#22c55e",
    icon: "✓",
    bg: "rgba(34,197,94,0.06)",
    border: "rgba(34,197,94,0.20)",
  },
  {
    title: "Own Your Club",
    body: "Run your own room. Set your rake 0–10%, invite your community, manage members, and earn. Club owners are entrepreneurs here.",
    href: "/clubs",
    cta: "Start a club",
    accent: "#e01e2b",
    icon: "♣",
    bg: "rgba(224,30,43,0.06)",
    border: "rgba(224,30,43,0.20)",
  },
  {
    title: "Crypto & Card",
    body: "Fund your wallet with 200+ cryptocurrencies or card. Withdraw with AML review and automated payout. Membership tiers with real perks.",
    href: "/membership",
    cta: "View plans",
    accent: "#f5c518",
    icon: "$",
    bg: "rgba(245,197,24,0.06)",
    border: "rgba(245,197,24,0.20)",
  },
] as const;

const FEATURES = [
  {
    title: "GPU Poker Table",
    body: "Real WebGPU felt with cinematic dealing, chip, and showdown animation.",
    accent: "#e01e2b",
    icon: "♠",
  },
  {
    title: "3D Characters",
    body: "Rigged, animated characters at every seat — generate your own with AI.",
    accent: "#f5c518",
    icon: "◈",
  },
  {
    title: "Rust Engine",
    body: "rs_poker: correct side pots, equity, and a GTO solver for live coaching.",
    accent: "#22c55e",
    icon: "⚙",
  },
  {
    title: "Live Table Audio",
    body: "Spatial chip & card SFX, a music picker, and per-character voice taunts.",
    accent: "#ff2d3f",
    icon: "♪",
  },
  {
    title: "Marketplace",
    body: "Buy, sell, and trade character skins and cosmetics with other members.",
    accent: "#f5c518",
    icon: "◇",
  },
  {
    title: "Tournaments",
    body: "Multi-table tournaments with blind timers and stacked prize ladders.",
    accent: "#ffd54a",
    icon: "🏆",
  },
] as const;

const TRUST_BADGES = [
  { label: "Provably Fair", color: "#22c55e" },
  { label: "GTO Verified", color: "#4a9eb0" },
  { label: "On-Chain Audit", color: "#f5c518" },
  { label: "AML Compliant", color: "#a78bfa" },
  { label: "18+ Only", color: "#ff4455" },
] as const;

// ── Component ─────────────────────────────────────────────────────────────────
export function LandingClient() {
  const [settings, setSettings]       = useState<SiteSettings | null>(null);
  const [supportOpen, setSupportOpen] = useState(false);
  const [recoveryOpen, setRecoveryOpen] = useState(false);
  const [legal, setLegal]             = useState<LegalDoc>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const res = await landingApi.siteSettings();
        if (alive) setSettings(res.settings);
      } catch { /* falls back to defaults */ }
    })();
    return () => { alive = false; };
  }, []);

  const siteName = settings?.site_name ?? "High Rollers Club";
  const socials: Array<{ label: string; href: string }> = [];
  if (settings?.discord_url) socials.push({ label: "Discord", href: settings.discord_url });
  if (settings?.twitter_url) socials.push({ label: "Twitter / X", href: settings.twitter_url });

  return (
    <div className="min-h-screen overflow-hidden text-foreground">

      {/* ── Marketing header ─────────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 border-b border-white/[0.06] bg-[#0a0d12]/90 backdrop-blur-2xl">
        <div className="h-px w-full bg-gradient-to-r from-transparent via-[#f5c518]/35 to-transparent" />
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-3.5">
          <Link href="/" className="flex items-center gap-2.5 group">
            <div className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-[#ffe066] via-[#f5c518] to-[#c9a000] shadow-[0_0_16px_rgba(245,197,24,0.35)] transition-shadow group-hover:shadow-[0_0_28px_rgba(245,197,24,0.55)]">
              <span className="font-display text-sm font-black text-[#1a1200]">HR</span>
            </div>
            <div className="hidden sm:block">
              <span className="block font-display text-sm font-bold uppercase tracking-[0.12em] text-white leading-none">{siteName}</span>
              <span className="block text-[9px] font-semibold uppercase tracking-[0.35em] text-[#f5c518]/60 mt-0.5">Premium Poker Network</span>
            </div>
          </Link>
          <nav className="flex items-center gap-2">
            <Link href="/provably-fair" className="hidden rounded-xl px-3 py-2 text-sm font-semibold text-neutral-400 transition hover:text-white sm:inline">
              How it works
            </Link>
            <Link href="/sign-in" className="rounded-xl px-4 py-2 text-sm font-semibold text-neutral-200 transition hover:text-white">
              Sign in
            </Link>
            <Link href="/sign-up" className={cn(BTN_GOLD, "rounded-xl px-4 py-2 text-sm uppercase tracking-wide")}>
              Join
            </Link>
          </nav>
        </div>
      </header>

      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden px-6 pb-16 pt-20 text-center">
        {/* Ambient background glows */}
        <div className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute left-1/2 top-0 h-[500px] w-[900px] -translate-x-1/2 rounded-full bg-[radial-gradient(ellipse,rgba(245,197,24,0.045),transparent_65%)]" />
          <div className="absolute right-0 top-1/4 h-[300px] w-[400px] rounded-full bg-[radial-gradient(ellipse,rgba(224,30,43,0.030),transparent_65%)]" />
          <div className="absolute left-0 bottom-0 h-[300px] w-[400px] rounded-full bg-[radial-gradient(ellipse,rgba(34,197,94,0.020),transparent_65%)]" />
        </div>

        {/* Trust badges row */}
        <div className="mb-8 flex flex-wrap items-center justify-center gap-2">
          {TRUST_BADGES.map((b) => (
            <span
              key={b.label}
              className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-wider"
              style={{ borderColor: `${b.color}30`, color: b.color, background: `${b.color}0a` }}
            >
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: b.color }} />
              {b.label}
            </span>
          ))}
        </div>

        {/* Eyebrow */}
        <p className={cn(HEADING_SM, "text-[#f5c518]/70 tracking-[0.35em] mb-4")}>{siteName}</p>

        {/* Main headline */}
        <h1 className="font-display mx-auto max-w-5xl text-5xl font-black uppercase leading-[1.0] tracking-tight md:text-7xl lg:text-8xl">
          Where every hand is{" "}
          <span className="italic bg-gradient-to-r from-[#ffe066] via-[#f5c518] to-[#c9a000] bg-clip-text text-transparent">
            verified
          </span>
        </h1>

        {/* Sub-headline */}
        <p className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-neutral-400 md:text-lg">
          A provably-fair, community-first poker network. Own your club, play on a real GPU table
          with 3D characters, and move money in crypto or card — all on an engine you can verify.
        </p>

        {/* CTAs */}
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/login"
            className={cn(BTN_GOLD, "rounded-xl px-8 py-3.5 text-sm uppercase tracking-wider shadow-[0_4px_24px_rgba(245,197,24,0.35)]")}
          >
            ♠ Play now
          </Link>
          <Link
            href="/table"
            className="rounded-xl border border-white/20 bg-white/[0.04] px-8 py-3.5 text-sm font-semibold uppercase tracking-wider text-white transition hover:border-white/30 hover:bg-white/[0.08]"
          >
            Enter a table
          </Link>
          <Link
            href="/hub"
            className="rounded-xl px-6 py-3.5 text-sm font-semibold text-neutral-400 transition hover:text-white"
          >
            Command Center →
          </Link>
        </div>

        {/* Scroll hint */}
        <div className="mt-12 flex justify-center">
          <div className="flex flex-col items-center gap-1.5 text-neutral-700">
            <span className="text-[10px] font-semibold uppercase tracking-[0.3em]">Live network</span>
            <svg className="h-4 w-4 animate-bounce" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M8 3v10M4 9l4 4 4-4" />
            </svg>
          </div>
        </div>
      </section>

      {/* ── Live Stats Band ───────────────────────────────────────────────── */}
      <LiveStatsBand />

      {/* ── Pillars ───────────────────────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-6 py-16">
        <div className="grid gap-5 md:grid-cols-3">
          {PILLARS.map((p) => (
            <div
              key={p.title}
              className="group relative overflow-hidden rounded-2xl border p-7 transition-all duration-200 hover:-translate-y-1 hover:shadow-[0_8px_32px_rgba(0,0,0,0.4)]"
              style={{ borderColor: p.border, background: p.bg }}
            >
              {/* Accent top line */}
              <div className="absolute inset-x-0 top-0 h-px" style={{ background: `linear-gradient(90deg, transparent, ${p.accent}, transparent)` }} />

              {/* Icon */}
              <div
                className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl text-xl font-bold"
                style={{ background: `${p.accent}18`, color: p.accent, border: `1px solid ${p.accent}30` }}
              >
                {p.icon}
              </div>

              <h3 className="font-display text-lg font-bold uppercase tracking-wide text-white">{p.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-neutral-400">{p.body}</p>
              <Link
                href={p.href}
                className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold transition group-hover:gap-2.5"
                style={{ color: p.accent }}
              >
                {p.cta}
                <svg className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M2 7h10M8 3l4 4-4 4" />
                </svg>
              </Link>
            </div>
          ))}
        </div>
      </section>

      {/* ── Feature grid ─────────────────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-6 pb-16 pt-4">
        <div className="mb-10 text-center">
          <p className={cn(HEADING_SM, "text-[#f5c518]/70 mb-2")}>Built different</p>
          <h2 className="font-display text-3xl font-bold uppercase tracking-wide md:text-4xl">
            The whole table, reimagined
          </h2>
          <div className="mx-auto mt-3 h-px w-24 bg-gradient-to-r from-transparent via-[#f5c518]/40 to-transparent" />
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <div
              key={f.title}
              className={cn(GLASS_PANEL, GLASS_PANEL_HOVER, "group relative overflow-hidden p-6 panel-inner-glow")}
            >
              {/* Accent top line */}
              <div className="absolute inset-x-0 top-0 h-px" style={{ background: `linear-gradient(90deg, transparent, ${f.accent}80, transparent)` }} />

              {/* Icon */}
              <div
                className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl text-lg font-bold transition group-hover:scale-110"
                style={{ background: `${f.accent}14`, color: f.accent, border: `1px solid ${f.accent}25` }}
              >
                {f.icon}
              </div>

              <h3 className="font-display text-sm font-bold uppercase tracking-wide text-white">{f.title}</h3>
              <p className="mt-1.5 text-xs leading-relaxed text-neutral-400">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── CTA banner ───────────────────────────────────────────────────── */}
      <section className="mx-auto max-w-5xl px-6 pb-20">
        <div className="relative overflow-hidden rounded-3xl border border-[#f5c518]/20 bg-gradient-to-br from-[#f5c518]/[0.07] via-[#1a2030] to-[#1a2030] p-12 text-center shadow-[0_0_80px_rgba(245,197,24,0.08)]">
          {/* Glow */}
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(245,197,24,0.12),transparent_60%)]" />
          {/* Top accent */}
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#f5c518]/50 to-transparent" />

          <p className={cn(HEADING_SM, "text-[#f5c518]/70 mb-3")}>Ready to play?</p>
          <h2 className="font-display text-3xl font-bold uppercase tracking-wide md:text-4xl">
            Run your own room
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-neutral-400">
            Spin up a private club, set your rake, and bring your players to a table that plays fair
            and looks unreal.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link
              href="/clubs"
              className={cn(BTN_GOLD, "rounded-xl px-8 py-3.5 text-sm uppercase tracking-wider shadow-[0_4px_24px_rgba(245,197,24,0.35)]")}
            >
              Start a club
            </Link>
            <Link
              href="/capabilities"
              className="rounded-xl border border-white/20 bg-white/[0.04] px-8 py-3.5 text-sm font-semibold uppercase tracking-wider text-white transition hover:border-white/30 hover:bg-white/[0.08]"
            >
              See all capabilities
            </Link>
          </div>

          {/* Stats row */}
          <div className="mt-10 flex flex-wrap justify-center gap-8 border-t border-white/[0.06] pt-8">
            {[
              { label: "Clubs worldwide", value: "2,400+" },
              { label: "Hands verified", value: "18M+" },
              { label: "Avg payout time", value: "< 4 hrs" },
              { label: "Uptime SLA", value: "99.9%" },
            ].map((s) => (
              <div key={s.label} className="text-center">
                <p className="font-display text-2xl font-bold text-[#f5c518]">{s.value}</p>
                <p className="mt-0.5 text-xs text-neutral-500">{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Footer ───────────────────────────────────────────────────────── */}
      <footer className="border-t border-white/[0.06] bg-[#0a0d12] px-6 py-12">
        <div className="h-px w-full bg-gradient-to-r from-transparent via-[#f5c518]/20 to-transparent mb-10" />
        <div className="mx-auto flex max-w-6xl flex-col gap-8 sm:flex-row sm:items-start sm:justify-between">
          <div className="max-w-xs">
            <div className="flex items-center gap-2.5 mb-3">
              <div className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-[#ffe066] via-[#f5c518] to-[#c9a000] shadow-[0_0_12px_rgba(245,197,24,0.30)]">
                <span className="font-display text-sm font-black text-[#1a1200]">HR</span>
              </div>
              <span className="font-display text-sm font-bold uppercase tracking-[0.12em] text-white">{siteName}</span>
            </div>
            <p className="text-xs leading-relaxed text-neutral-600">
              Provably-fair poker. Play responsibly — you must be of legal age in your jurisdiction.
            </p>
            {socials.length > 0 && (
              <div className="mt-4 flex gap-2">
                {socials.map((s) => (
                  <a key={s.label} href={s.href} target="_blank" rel="noopener noreferrer"
                    className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-neutral-400 transition hover:border-white/20 hover:text-white">
                    {s.label}
                  </a>
                ))}
              </div>
            )}
          </div>

          <div className="flex flex-wrap gap-x-12 gap-y-6">
            <nav className="flex flex-col gap-2">
              <p className={cn(HEADING_SM, "text-neutral-600 mb-1")}>Company</p>
              <button type="button" onClick={() => setLegal("about")} className="text-left text-sm text-neutral-500 transition hover:text-white">About</button>
              <button type="button" onClick={() => setLegal("terms")} className="text-left text-sm text-neutral-500 transition hover:text-white">Terms</button>
              <button type="button" onClick={() => setLegal("privacy")} className="text-left text-sm text-neutral-500 transition hover:text-white">Privacy</button>
            </nav>
            <nav className="flex flex-col gap-2">
              <p className={cn(HEADING_SM, "text-neutral-600 mb-1")}>Help</p>
              <button type="button" onClick={() => setSupportOpen(true)} className="text-left text-sm text-neutral-500 transition hover:text-white">Contact support</button>
              <button type="button" onClick={() => setRecoveryOpen(true)} className="text-left text-sm text-neutral-500 transition hover:text-white">Recover account</button>
              <Link href="/provably-fair" className="text-sm text-neutral-500 transition hover:text-white">Verify a hand</Link>
            </nav>
            <nav className="flex flex-col gap-2">
              <p className={cn(HEADING_SM, "text-neutral-600 mb-1")}>Play</p>
              <Link href="/lobby" className="text-sm text-neutral-500 transition hover:text-white">Cash Games</Link>
              <Link href="/tournaments" className="text-sm text-neutral-500 transition hover:text-white">Tournaments</Link>
              <Link href="/clubs" className="text-sm text-neutral-500 transition hover:text-white">Clubs</Link>
              <Link href="/membership" className="text-sm text-neutral-500 transition hover:text-white">Membership</Link>
            </nav>
            {socials.length === 0 && (
              <nav className="flex flex-col gap-2">
                <p className={cn(HEADING_SM, "text-neutral-600 mb-1")}>Social</p>
                <span className="text-sm text-neutral-700">Coming soon</span>
              </nav>
            )}
          </div>
        </div>
        <div className="mx-auto mt-8 max-w-6xl border-t border-white/[0.05] pt-6 text-center">
          <p className="text-[11px] text-neutral-700">© {new Date().getFullYear()} High Rollers Club. All rights reserved.</p>
        </div>
      </footer>

      {/* ── Dialogs ───────────────────────────────────────────────────────── */}
      {supportOpen  && <SupportDialog  onClose={() => setSupportOpen(false)} />}
      {recoveryOpen && <RecoveryDialog onClose={() => setRecoveryOpen(false)} />}
      {legal        && <LegalDialog doc={legal} onClose={() => setLegal(null)} />}
    </div>
  );
}
