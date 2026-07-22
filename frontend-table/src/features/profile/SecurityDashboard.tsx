"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { BTN_GOLD, GLASS_PANEL, HEADING_SM, cn } from "@/features/ui/tokens";

import {
  DEMO_LINKED_WALLETS,
  DEMO_SESSIONS,
  money,
  profileApi,
  type ActiveSession,
  type ApiKey,
  type LinkedWalletInfo,
  type WalletBalance,
} from "./profileRpc";

const PREFS_KEY = "poker.profile.prefs";
type Prefs = { emailNotifications: boolean; privacyMode: boolean };
const DEFAULT_PREFS: Prefs = { emailNotifications: true, privacyMode: false };

function readPrefs(): Prefs {
  if (typeof window === "undefined") return DEFAULT_PREFS;
  try {
    const raw = window.localStorage.getItem(PREFS_KEY);
    if (!raw) return DEFAULT_PREFS;
    return { ...DEFAULT_PREFS, ...(JSON.parse(raw) as Partial<Prefs>) };
  } catch {
    return DEFAULT_PREFS;
  }
}

function Toggle({ on, onClick, label }: { on: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={onClick}
      className={cn(
        "relative h-6 w-11 shrink-0 rounded-full border transition-colors",
        on ? "border-green/50 bg-green/30" : "border-white/15 bg-black/40",
      )}
    >
      <span
        className={cn(
          "absolute top-0.5 h-4 w-4 rounded-full transition-all",
          on ? "left-6 bg-green" : "left-0.5 bg-neutral-400",
        )}
      />
    </button>
  );
}

function WalletRow({ w }: { w: LinkedWalletInfo }) {
  return (
    <div className={cn(GLASS_PANEL, "flex items-center gap-3 p-4")}>
      <span className="text-2xl" aria-hidden>{w.emoji}</span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-foreground">{w.name}</p>
        <p className="truncate font-mono text-[11px] text-neutral-500">{w.short}</p>
      </div>
      <p className="font-display text-lg font-bold text-gold">{w.balance}</p>
    </div>
  );
}

export function SecurityDashboard({ notify }: { notify: (msg: string, kind?: "ok" | "err") => void }) {
  const [wallet, setWallet] = useState<WalletBalance | null>(null);
  const [keys, setKeys] = useState<ApiKey[] | null>(null);
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS);
  const sessions: ActiveSession[] = DEMO_SESSIONS;
  const linked: LinkedWalletInfo[] = DEMO_LINKED_WALLETS;

  useEffect(() => {
    setPrefs(readPrefs());
  }, []);

  useEffect(() => {
    void (async () => {
      const [w, k] = await Promise.allSettled([profileApi.wallet(), profileApi.apiKeyList()]);
      if (w.status === "fulfilled") setWallet(w.value);
      if (k.status === "fulfilled") setKeys(k.value.api_keys ?? []);
    })();
  }, []);

  const togglePref = useCallback(
    (key: keyof Prefs) => {
      setPrefs((prev) => {
        const next = { ...prev, [key]: !prev[key] };
        try {
          window.localStorage.setItem(PREFS_KEY, JSON.stringify(next));
        } catch {
          /* private mode */
        }
        notify(`${key === "emailNotifications" ? "Email notifications" : "Privacy mode"} ${next[key] ? "on" : "off"}.`);
        return next;
      });
    },
    [notify],
  );

  const chips = wallet?.balance_cents ?? 5_000_000;
  const activeKeys = keys?.filter((k) => !k.revoked).length ?? 0;

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      {/* Profile & Edit */}
      <section className={cn(GLASS_PANEL, "p-5")}>
        <p className={cn(HEADING_SM, "text-gold/80")}>Profile &amp; Edit</p>
        <div className="mt-3 flex flex-wrap gap-2 text-[11px] uppercase tracking-wide">
          <span className="rounded-full border border-white/10 bg-black/30 px-3 py-1 text-neutral-400">Profile &amp; Edit</span>
          <Link href="/profile/security" className="rounded-full border border-gold/40 bg-gold/[0.06] px-3 py-1 text-gold">
            Security Settings
          </Link>
          <span className="rounded-full border border-white/10 bg-black/30 px-3 py-1 text-neutral-400">Preferences</span>
        </div>
        <div className="mt-4 space-y-3">
          <div className="flex items-center justify-between rounded-xl border border-white/10 bg-black/30 px-4 py-3">
            <span className="text-sm text-neutral-300">Password Reset</span>
            <Link href="/profile/security" className="text-xs font-semibold uppercase tracking-wide text-gold hover:text-gold/80">
              Reset →
            </Link>
          </div>
          <div className="flex items-center justify-between rounded-xl border border-white/10 bg-black/30 px-4 py-3">
            <span className="text-sm text-neutral-300">Account Recovery</span>
            <Link href="/profile/security" className="text-xs font-semibold uppercase tracking-wide text-gold hover:text-gold/80">
              Manage →
            </Link>
          </div>
        </div>
      </section>

      {/* Security & Privacy */}
      <section className={cn(GLASS_PANEL, "p-5")}>
        <p className={cn(HEADING_SM, "text-gold/80")}>Security &amp; Privacy</p>

        {/* 2FA status — managed on the built /profile/security screen */}
        <div className="mt-4 rounded-xl border border-white/10 bg-black/30 p-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-neutral-300">Two-Factor Auth (2FA)</span>
            <span className="rounded-full border border-neutral-600 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-widest text-neutral-400">
              Managed
            </span>
          </div>
          <Link
            href="/profile/security"
            className={cn(BTN_GOLD, "mt-3 flex w-full items-center justify-center rounded-xl px-4 py-2.5 text-sm uppercase tracking-wide")}
          >
            Set up / Manage 2FA
          </Link>
        </div>

        {/* Linked social accounts */}
        <p className="mt-5 text-[11px] uppercase tracking-[0.2em] text-neutral-500">Linked Social Accounts</p>
        <div className="mt-2 flex gap-2">
          {[
            { id: "google", label: "G", bg: "bg-white text-black" },
            { id: "facebook", label: "f", bg: "bg-[#1877f2] text-white" },
          ].map((s) => (
            <span key={s.id} className={cn("flex h-9 w-9 items-center justify-center rounded-full font-display text-sm font-bold", s.bg)}>
              {s.label}
            </span>
          ))}
        </div>

        {/* Preferences */}
        <p className="mt-5 text-[11px] uppercase tracking-[0.2em] text-neutral-500">Preferences</p>
        <div className="mt-2 space-y-2">
          <div className="flex items-center justify-between rounded-xl border border-white/10 bg-black/30 px-4 py-2.5">
            <span className="text-sm text-neutral-300">Email Notifications</span>
            <Toggle on={prefs.emailNotifications} onClick={() => togglePref("emailNotifications")} label="Email notifications" />
          </div>
          <div className="flex items-center justify-between rounded-xl border border-white/10 bg-black/30 px-4 py-2.5">
            <span className="text-sm text-neutral-300">Privacy Mode</span>
            <Toggle on={prefs.privacyMode} onClick={() => togglePref("privacyMode")} label="Privacy mode" />
          </div>
        </div>

        {/* API keys summary → deep-linked to the Security tab's key manager */}
        <div className="mt-5 flex items-center justify-between rounded-xl border border-white/10 bg-black/30 px-4 py-3">
          <span className="text-sm text-neutral-300">
            API Keys <span className="text-neutral-500">· {activeKeys} active</span>
          </span>
          <span className="text-[11px] uppercase tracking-widest text-neutral-500">Below ↓</span>
        </div>
      </section>

      {/* Financials & Wallets */}
      <section className={cn(GLASS_PANEL, "p-5")}>
        <p className={cn(HEADING_SM, "text-gold/80")}>Financials &amp; Wallets</p>
        <div className="mt-4 space-y-3">
          {linked.map((w) => (
            <WalletRow key={w.id} w={w} />
          ))}
          <div className={cn(GLASS_PANEL, "flex items-center gap-3 p-4")}>
            <span className="text-2xl" aria-hidden>🪙</span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-foreground">Chips Balance</p>
              <p className="font-mono text-[11px] text-neutral-500">On-platform wallet</p>
            </div>
            <p className="font-display text-lg font-bold text-gold">{money(chips)}</p>
          </div>
        </div>
        <Link
          href="/wallet"
          className={cn(BTN_GOLD, "mt-4 flex w-full items-center justify-center rounded-xl px-4 py-2.5 text-sm uppercase tracking-wide")}
        >
          Add New Wallet
        </Link>
        <p className="mt-3 text-[11px] text-neutral-500">
          Linked crypto wallets are illustrative; the chips balance is your authoritative on-platform wallet.
        </p>
      </section>

      {/* Active sessions — full width */}
      <section className={cn(GLASS_PANEL, "p-5 lg:col-span-3")}>
        <p className={cn(HEADING_SM, "text-gold/80")}>Active Sessions</p>
        <div className="mt-3 space-y-2">
          {sessions.map((s) => (
            <div key={s.id} className="flex items-center gap-3 rounded-xl border border-white/10 bg-black/30 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-foreground">
                  {s.device}
                  {s.current && (
                    <span className="ml-2 rounded-full border border-green/40 bg-green/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-green">
                      This device
                    </span>
                  )}
                </p>
                <p className="text-[11px] text-neutral-500">
                  {s.location} · {s.lastActive === "now" ? "active now" : s.lastActive}
                </p>
              </div>
              {!s.current && (
                <Link href="/profile/security" className="text-xs font-semibold uppercase tracking-wide text-brand hover:text-red-300">
                  Revoke
                </Link>
              )}
            </div>
          ))}
        </div>
        <p className="mt-3 text-[11px] text-neutral-500">
          Sign out of individual sessions from the Security Center. Suspicious activity? Reset your password there.
        </p>
      </section>
    </div>
  );
}
