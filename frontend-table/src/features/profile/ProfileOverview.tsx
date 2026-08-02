"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { callSessionRpc } from "@/lib/nakama/sessionRpc";
import { RankBadge } from "./RankBadge";
import { AVATARS, avatarSrc } from "@/features/table/avatars";
import { BTN_GOLD, GLASS_PANEL, GLASS_PANEL_HOVER, HEADING_SM, RARITY, cn } from "@/features/ui/tokens";

import {
  DEMO_ACHIEVEMENTS,
  DEMO_TRANSACTIONS,
  compact,
  money,
  profileApi,
  tierStyle,
  vipTier,
  type Achievement,
  type PlayerStats,
  type Profile,
  type Verification,
  type WalletBalance,
} from "./profileRpc";

// loyalty_get's real achievement catalog has no rarity concept, just an HRP
// cost — bucket it into the same tiers DEMO_ACHIEVEMENTS/RARITY use so real
// and demo rows render identically.
function tierForHRP(hrp: number): Achievement["tier"] {
  if (hrp >= 1000) return "legendary";
  if (hrp >= 500) return "epic";
  if (hrp >= 200) return "rare";
  return "common";
}

const AVATAR_KEY = "poker.profile.avatar";

// Player-selectable identity portraits (the detailed_15 "Initial Avatar
// Selection" strip). Persisted per-device, mirroring renderMode.ts.
const PICKS = AVATARS.slice(0, 8);

function readAvatar(): string {
  if (typeof window === "undefined") return PICKS[0].id;
  return window.localStorage.getItem(AVATAR_KEY) || PICKS[0].id;
}

function Portrait({ id, className }: { id: string; className?: string }) {
  const [broken, setBroken] = useState(false);
  const def = AVATARS.find((a) => a.id === id) ?? PICKS[0];
  if (broken) {
    return (
      <div
        className={cn("flex items-center justify-center font-display text-4xl font-bold text-black", className)}
        style={{ background: `linear-gradient(135deg, ${def.border}, #262d38)` }}
      >
        {def.name.slice(0, 1)}
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={avatarSrc(id)}
      alt={def.name}
      className={cn("h-full w-full object-cover", className)}
      onError={() => setBroken(true)}
    />
  );
}

function StatRow({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="flex items-center justify-between border-b border-white/[0.05] py-2 last:border-0">
      <span className="text-sm text-neutral-400">{label}</span>
      <span className={cn("font-display text-sm font-bold text-foreground", tone)}>{value}</span>
    </div>
  );
}

// Battle record for the equipped avatar — rounds played + win rate accrued to
// that character (avatar_battle_stats). Renders nothing until data arrives.
function AvatarBattleRecord({ avatarId }: { avatarId: string }) {
  const [rec, setRec] = useState<{ hands: number; win_rate_pct: number } | null>(null);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const data = await profileApi.avatarBattle();
        const match = data.avatars.find((a) => a.avatar_id === avatarId);
        if (!cancelled) setRec(match ? { hands: match.hands, win_rate_pct: match.win_rate_pct } : { hands: 0, win_rate_pct: 0 });
      } catch {
        /* offline → hide */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [avatarId]);
  if (!rec) return null;
  return (
    <div className="flex items-center justify-between rounded-xl border border-white/[0.06] bg-black/30 px-3 py-2">
      <div>
        <p className="text-[9px] uppercase tracking-[0.2em] text-white/40">Battle Record</p>
        <p className="font-display text-sm font-bold text-white">{compact(rec.hands)} hands</p>
      </div>
      <div className="text-right">
        <p className="text-[9px] uppercase tracking-[0.2em] text-white/40">Win Rate</p>
        <p className="font-display text-sm font-bold text-green">{rec.win_rate_pct}%</p>
      </div>
    </div>
  );
}

// Real HRC badge art for the achievement codes whose criteria genuinely match
// the art's concept (loyalty.go's Catalog codes → /public/badges). "century"
// and "quad_squad" have no honest match among the 8 HRC badges and
// intentionally fall back to the plain rarity dot below rather than wearing
// one that means something else.
const ACHIEVEMENT_BADGE_IMG: Record<string, string> = {
  first_blood: "/badges/badge_first_win.webp",
  millennium: "/badges/badge_club_legend.webp",
  iron_player: "/badges/badge_iron_player.webp",
  straight_flush: "/badges/badge_royal_flush.webp",
  high_roller: "/badges/badge_high_roller.webp",
  bluff_master: "/badges/badge_bluff_master.webp",
  streak_fire: "/badges/badge_streak_fire.webp",
  tournament_champ: "/badges/badge_tournament_champ.webp",
};

function AchievementBadge({ a }: { a: Achievement }) {
  const r = RARITY[a.tier];
  const img = ACHIEVEMENT_BADGE_IMG[a.id];
  return (
    <div
      className={cn(
        "rounded-xl border bg-black/30 p-3",
        a.earned ? r.border : "border-white/[0.05] opacity-45",
      )}
      style={a.earned ? { boxShadow: `0 0 16px -6px ${r.glow}` } : undefined}
    >
      <div className="flex items-center gap-2">
        {img ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={img}
            alt=""
            className={cn("h-6 w-6 rounded-full object-cover", !a.earned && "grayscale")}
          />
        ) : (
          <span className={cn("h-2 w-2 rounded-full", a.earned ? "" : "bg-neutral-700")} style={a.earned ? { background: r.glow } : undefined} />
        )}
        <span className={cn("font-display text-xs font-bold uppercase tracking-wide", a.earned ? r.text : "text-neutral-500")}>
          {a.name}
        </span>
      </div>
      <p className="mt-1 text-[11px] text-neutral-500">{a.desc}</p>
    </div>
  );
}

export function ProfileOverview({ notify }: { notify: (msg: string, kind?: "ok" | "err") => void }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [wallet, setWallet] = useState<WalletBalance | null>(null);
  const [stats, setStats] = useState<PlayerStats | null>(null);
  const [ver, setVer] = useState<Verification | null>(null);
  const [avatar, setAvatar] = useState<string>(PICKS[0].id);
  const [loading, setLoading] = useState(true);
  const [txns, setTxns] = useState<Array<{ kind: string; amount: string; date: string; positive: boolean }>>(
    DEMO_TRANSACTIONS,
  );
  const [hrp, setHrp] = useState(0); // High Roller Points → "Tournament Points"
  const [achievements, setAchievements] = useState<Achievement[]>(DEMO_ACHIEVEMENTS);

  // Real HRP points + achievement progress (loyalty_get already returns both —
  // this used to read hrp_total only and let the Achievements section below
  // always render DEMO_ACHIEVEMENTS regardless of connection, which showed
  // every player the exact same fake "earned" badges).
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const d = (await callSessionRpc("loyalty_get", {})) as {
          hrp_total?: number;
          achievements?: Array<{ code: string; name: string; description: string; hrp: number; unlocked: boolean }>;
        };
        if (cancelled) return;
        if (typeof d.hrp_total === "number") setHrp(d.hrp_total);
        if (Array.isArray(d.achievements) && d.achievements.length > 0) {
          setAchievements(
            d.achievements.map((a) => ({
              id: a.code,
              name: a.name,
              desc: a.description,
              tier: tierForHRP(a.hrp),
              earned: a.unlocked,
            })),
          );
        }
      } catch {
        /* offline → keep demo rows */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setAvatar(readAvatar());
  }, []);

  // Real recent transactions from the wallet ledger (falls back to demo rows).
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const data = (await callSessionRpc("wallet_ledger", { limit: 8 })) as {
          ledger?: Array<{ delta?: number; reason?: string; created_at?: string }>;
        };
        if (cancelled) return;
        const rows = (data.ledger ?? []).map((e) => {
          const delta = e.delta ?? 0;
          return {
            kind: (e.reason ?? "transaction").replace(/_/g, " "),
            amount: `${delta >= 0 ? "+" : "−"}${money(Math.abs(delta))}`,
            date: e.created_at ? new Date(e.created_at).toLocaleDateString() : "",
            positive: delta >= 0,
          };
        });
        if (rows.length > 0) setTxns(rows);
      } catch {
        /* guest / offline → keep demo rows */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    void (async () => {
      // Each field is loaded independently so a single unavailable RPC does not
      // blank the dashboard — missing values fall back to a labelled demo.
      const [p, w, s, v] = await Promise.allSettled([
        profileApi.get(),
        profileApi.wallet(),
        profileApi.stats(),
        profileApi.verification(),
      ]);
      if (p.status === "fulfilled") setProfile(p.value);
      if (w.status === "fulfilled") setWallet(w.value);
      if (s.status === "fulfilled") setStats(s.value);
      if (v.status === "fulfilled") setVer(v.value);
      if (p.status === "rejected") {
        notify("Showing demo profile — backend unreachable.", "err");
      }
      setLoading(false);
    })();
  }, [notify]);

  const chooseAvatar = useCallback((id: string) => {
    setAvatar(id);
    try {
      window.localStorage.setItem(AVATAR_KEY, id);
      window.dispatchEvent(new StorageEvent("storage", { key: AVATAR_KEY, newValue: id }));
    } catch {
      /* private mode — non-fatal */
    }
    // Persist server-side so the choice follows the player across devices.
    void callSessionRpc("profile_meta_set", { avatar: id }).catch(() => {});
  }, []);

  // Seed the avatar from the server (falls back to the local cache set above).
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const data = (await callSessionRpc("profile_meta_get", {})) as { meta?: { avatar?: string } };
        if (!cancelled && data.meta?.avatar) setAvatar(data.meta.avatar);
      } catch {
        /* guest / offline → keep local */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const tier = useMemo(() => vipTier(ver), [ver]);
  const ts = tierStyle(tier);
  const chips = wallet?.balance_cents ?? profile?.balance_cents ?? 5_000_000;
  const hands = stats?.hands ?? 25_000;
  const winPct = stats ? Math.round(stats.win_rate_pct) : 65;
  const reputation = winPct >= 55 ? "Excellent" : winPct >= 48 ? "Solid" : "Developing";

  return (
    <div className="space-y-6">
      {/* Top: identity + performance (detailed_16) */}
      <div className="grid gap-6 lg:grid-cols-[300px_1fr]">
        {/* Avatar card */}
        <section className={cn(GLASS_PANEL, "flex flex-col overflow-hidden")}>
          <div className="relative aspect-[3/4] w-full overflow-hidden bg-black/40">
            <Portrait id={avatar} />
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-4">
              <span
                className={cn("inline-flex rounded-full border px-3 py-1 text-[10px] font-bold uppercase tracking-widest", ts.border, ts.text)}
                style={{ boxShadow: `0 0 18px -6px ${ts.glow}` }}
              >
                {tier} VIP
              </span>
            </div>
          </div>
          <div className="space-y-3 p-4">
            <AvatarBattleRecord avatarId={avatar} />
            <Link href="/profile/security" className={cn(BTN_GOLD, "flex w-full items-center justify-center rounded-xl px-4 py-2.5 text-sm uppercase tracking-wide")}>
              Edit Avatar
            </Link>
          </div>
        </section>

        {/* Bio + performance */}
        <div className="space-y-6">
          <div className="grid gap-6 sm:grid-cols-2">
            <section className={cn(GLASS_PANEL, "p-5")}>
              <p className={cn(HEADING_SM, "text-gold/80")}>Personal Bio &amp; Stats</p>
              <div className="mt-3">
                <StatRow label="Member Since" value={profile?.member_since || "—"} />
                <StatRow label="VIP Tier" value={tier} tone={ts.text} />
                <StatRow label="Username" value={profile?.username || (loading ? "…" : "Player")} />
              </div>
            </section>
            <section className={cn(GLASS_PANEL, "p-5")}>
              <p className={cn(HEADING_SM, "text-gold/80")}>Performance Dashboard</p>
              <div className="mt-3">
                <StatRow label="Total Hands Played" value={compact(hands)} />
                <StatRow label="Win/Loss Ratio" value={`${winPct}%`} tone="text-green" />
                <StatRow
                  label="Biggest Pot Won"
                  value={stats?.biggest_pot_display ?? money(stats?.biggest_pot ?? 0)}
                  tone="text-gold"
                />
                <StatRow label="Tournament Points" value={compact(hrp)} />
              </div>
            </section>
            {/* Service rank — a US-military pay grade earned from real play. */}
            <RankBadge />
          </div>

          {/* Recent transactions */}
          <section className={cn(GLASS_PANEL, "p-5")}>
            <div className="flex items-center justify-between">
              <p className={cn(HEADING_SM, "text-gold/80")}>Recent Transactions</p>
              <Link href="/wallet" className="text-[11px] uppercase tracking-widest text-neutral-500 hover:text-foreground">
                Full ledger →
              </Link>
            </div>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[360px] text-sm">
                <thead>
                  <tr className="text-[11px] uppercase tracking-[0.15em] text-neutral-500">
                    <th className="py-1 text-left font-medium">Ledger</th>
                    <th className="py-1 text-right font-medium">Amount</th>
                    <th className="py-1 text-right font-medium">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {txns.map((t, i) => (
                    <tr key={`${t.kind}-${i}`} className="border-t border-white/[0.05]">
                      <td className="py-2 capitalize text-neutral-300">{t.kind}</td>
                      <td className={cn("py-2 text-right font-display font-bold", t.positive ? "text-green" : "text-brand")}>
                        {t.amount}
                      </td>
                      <td className="py-2 text-right text-neutral-500">{t.date}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </div>

      {/* Wallet + social */}
      <div className="grid gap-6 sm:grid-cols-2">
        <section className={cn(GLASS_PANEL, GLASS_PANEL_HOVER, "flex items-center justify-between p-5")}>
          <div>
            <p className={cn(HEADING_SM, "text-gold/80")}>Chip Balance</p>
            <p className="font-display mt-1 text-3xl font-bold text-gold">{money(chips)}</p>
          </div>
          <Link href="/wallet" className={cn(BTN_GOLD, "rounded-xl px-4 py-2.5 text-sm uppercase tracking-wide")}>
            Cashier
          </Link>
        </section>
        <section className={cn(GLASS_PANEL, "p-5")}>
          <p className={cn(HEADING_SM, "text-gold/80")}>Social &amp; Behavior</p>
          <div className="mt-3">
            {/* "Recent Chat History" / "Mutual Members" used to render here as
                static text styled like links ("View Logs" / "List") with no
                onClick and no backing feature (no chat-log or friends/mutual-
                members RPC exists anywhere) — dead controls. Removed rather
                than left as decoration; re-add once those features are real. */}
            <StatRow label="Table Reputation" value={reputation} tone="text-green" />
          </div>
        </section>
      </div>

      {/* Achievements */}
      <section className={cn(GLASS_PANEL, "p-5")}>
        <div className="flex items-center justify-between">
          <p className={cn(HEADING_SM, "text-gold/80")}>Achievements</p>
          <Link href="/loyalty" className="text-[11px] uppercase tracking-widest text-neutral-500 hover:text-foreground">
            All rewards →
          </Link>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {achievements.map((a) => (
            <AchievementBadge key={a.id} a={a} />
          ))}
        </div>
      </section>

      {/* Avatar selection (detailed_15) */}
      <section className={cn(GLASS_PANEL, "p-5")}>
        <div className="flex items-center justify-between">
          <div>
            <p className={cn(HEADING_SM, "text-gold/80")}>Avatar Selection</p>
            <h3 className="font-display mt-1 text-lg font-bold uppercase tracking-wide">Choose Your Look</h3>
          </div>
          <Link href="/marketplace" className={cn(BTN_GOLD, "rounded-xl px-4 py-2.5 text-sm uppercase tracking-wide")}>
            Proceed to Customization
          </Link>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
          {PICKS.map((a) => {
            const active = a.id === avatar;
            return (
              <button
                key={a.id}
                type="button"
                onClick={() => chooseAvatar(a.id)}
                aria-pressed={active}
                className={cn(
                  "group relative aspect-[3/4] overflow-hidden rounded-xl border-2 transition",
                  active ? "border-gold" : "border-white/[0.06] hover:border-white/25",
                )}
                style={active ? { boxShadow: `0 0 20px -4px ${a.glow}` } : undefined}
              >
                <Portrait id={a.id} />
                <span className="absolute inset-x-0 bottom-0 truncate bg-black/70 px-1.5 py-1 text-center text-[10px] font-semibold text-neutral-200">
                  {a.name}
                </span>
                {active && (
                  <span className="absolute right-1 top-1 rounded-full bg-gold px-1.5 py-0.5 text-[9px] font-bold uppercase text-black">
                    ✓
                  </span>
                )}
              </button>
            );
          })}
        </div>
        <p className="mt-3 text-[11px] text-neutral-500">
          Selection is saved to this device. Unlock premium 3D characters and skins in the marketplace.
        </p>
      </section>
    </div>
  );
}
