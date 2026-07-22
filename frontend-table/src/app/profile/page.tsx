"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { AnalyticsPanel } from "@/features/profile/AnalyticsPanel";
import { LeaderboardPanel } from "@/features/profile/LeaderboardPanel";
import { SecurityPanel } from "@/features/profile/SecurityPanel";
import { money, profileApi, type Profile } from "@/features/profile/profileRpc";
import { GLASS_PANEL, HEADING_SM, cn } from "@/features/ui/tokens";

type Tab = "analytics" | "leaderboard" | "security";
type Toast = { msg: string; kind: "ok" | "err" };

const TABS: { id: Tab; label: string }[] = [
  { id: "analytics", label: "Analytics" },
  { id: "leaderboard", label: "Leaderboard" },
  { id: "security", label: "Security" },
];

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "PN";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

export default function ProfilePage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [tab, setTab] = useState<Tab>("analytics");
  const [toast, setToast] = useState<Toast | null>(null);
  const [loading, setLoading] = useState(true);

  const notify = useCallback((msg: string, kind: "ok" | "err" = "ok") => {
    setToast({ msg, kind });
    window.setTimeout(() => setToast(null), 3600);
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        setProfile(await profileApi.get());
      } catch (e) {
        notify(e instanceof Error ? e.message : "Failed to load profile", "err");
      } finally {
        setLoading(false);
      }
    })();
  }, [notify]);

  const displayName = profile?.username || (loading ? "Loading…" : "Player");

  const body = useMemo(() => {
    switch (tab) {
      case "analytics":
        return <AnalyticsPanel notify={notify} />;
      case "leaderboard":
        return <LeaderboardPanel meUserId={profile?.user_id ?? null} notify={notify} />;
      case "security":
        return <SecurityPanel notify={notify} />;
      default:
        return null;
    }
  }, [tab, notify, profile?.user_id]);

  return (
    <main className="min-h-screen bg-background text-foreground">
      {toast && (
        <div
          className={cn(
            "fixed left-1/2 top-4 z-50 -translate-x-1/2 rounded-xl border px-4 py-2.5 text-sm backdrop-blur-xl",
            toast.kind === "ok"
              ? "border-emerald-500/30 bg-emerald-950/40 text-emerald-200"
              : "border-red-500/30 bg-red-950/40 text-red-200",
          )}
        >
          {toast.msg}
        </div>
      )}

      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:py-12">
        <div className="flex items-center justify-between">
          <p className={cn(HEADING_SM, "text-gold/80")}>Command Center</p>
          <Link href="/hub" className="text-xs uppercase tracking-widest text-neutral-500 hover:text-cyan">
            ← Back to hub
          </Link>
        </div>

        {/* Identity header */}
        <header className={cn(GLASS_PANEL, "mt-4 flex flex-col gap-5 p-6 sm:flex-row sm:items-center")}>
          <div
            className="flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl font-display text-2xl font-bold text-black"
            style={{
              background: "linear-gradient(135deg, #f3e2ad, #d4af37 55%, #9a7b2c)",
              boxShadow: "0 0 26px rgba(212,175,55,0.3)",
            }}
          >
            {initials(displayName)}
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="font-display truncate text-2xl font-bold uppercase tracking-wide">{displayName}</h1>
            <p className="mt-0.5 font-mono text-xs text-neutral-500">
              {profile ? profile.user_id : "—"}
            </p>
          </div>
          <div className="sm:text-right">
            <p className="text-[11px] uppercase tracking-[0.2em] text-neutral-400">Wallet</p>
            <p className="font-display text-2xl font-bold text-gold">
              {profile ? money(profile.balance_cents) : "—"}
            </p>
          </div>
        </header>

        {/* Tabs */}
        <nav className="mt-6 flex gap-2 border-b border-white/[0.06]">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={cn(
                "relative px-4 py-3 text-sm font-semibold uppercase tracking-wide transition",
                tab === t.id ? "text-foreground" : "text-neutral-500 hover:text-neutral-300",
              )}
            >
              {t.label}
              {tab === t.id && (
                <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-cyan shadow-[0_0_10px_rgba(129,236,255,0.6)]" />
              )}
            </button>
          ))}
        </nav>

        <div className="mt-6">{body}</div>
      </div>
    </main>
  );
}
