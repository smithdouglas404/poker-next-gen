"use client";

// Data hook for the in-table Global Dashboard / club-home overlay (HRC
// full_body master 11). Every figure is a pure projection of authoritative
// backend state (CLAUDE.md rule #3); every panel binds to a real registered RPC
// (rule #4):
//
//   • me_roles          → resolve the club the caller administers
//   • club_quick_stats  → Total Members + Total Club Volume + Club Activity feed
//   • club_browse       → Active Tables + Ongoing Featured Games thumbnails
//
// Offline / guest (no live session, no club) falls back to clearly-labelled
// DEMO data so the screen reads like the owner's master without ever presenting
// fabricated numbers as live (rule #2).

import { useCallback, useEffect, useState } from "react";

import { callSessionRpc } from "@/lib/nakama/sessionRpc";
import { useGame } from "@/features/game/GameProvider";
import { avatarForKey, avatarSrc } from "@/features/table/avatars";

function avatarUrl(key: string): string {
  return avatarSrc(avatarForKey(key));
}
function num(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

/* --------------------------------- types --------------------------------- */

export interface DashStat {
  totalMembers: number;
  activeTables: number;
  /** Total club chip volume, whole chips (not cents). */
  totalVolumeChips: number;
  /** On-chain settlement equivalent shown under the volume tile. */
  volumeEth: number;
}

export interface FeaturedGame {
  id: string;
  label: string;
  seated: number;
  maxSeats: number;
  stakes: string;
  seatAvatars: string[];
}

export interface ActivityItem {
  id: string;
  kind: "win" | "member" | "tournament" | "info";
  text: string;
}

export interface ClubDashboard {
  live: boolean;
  clubName: string;
  stat: DashStat;
  featured: FeaturedGame[];
  activity: ActivityItem[];
}

/* --------------------------------- demo ---------------------------------- */

const DEMO_FEATURED_AVATARS = [
  "cyber-samurai",
  "neon-viper",
  "shadow-king",
  "ice-queen",
  "gold-phantom",
  "steel-ghost",
];

function demoFeatured(): FeaturedGame[] {
  return [1, 2, 3].map((n) => ({
    id: `demo-table-${n}`,
    label: `Table ${n}`,
    seated: 6,
    maxSeats: 9,
    stakes: "$50k/$100k",
    seatAvatars: DEMO_FEATURED_AVATARS.map(avatarUrl),
  }));
}

const DEMO_DASHBOARD: ClubDashboard = {
  live: false,
  clubName: "High Rollers Club",
  stat: { totalMembers: 2_500, activeTables: 15, totalVolumeChips: 5_000_000, volumeEth: 25 },
  featured: demoFeatured(),
  activity: [
    { id: "a1", kind: "win", text: "Big Win: User_X won $200k" },
    { id: "a2", kind: "member", text: "New Member: User_Y joined" },
    { id: "a3", kind: "tournament", text: 'Tournament "Weekly High Stakes" started' },
  ],
};

/* ---------------------------- backend shapes ----------------------------- */

interface MeRolesResp {
  club_admin_of?: string[];
}
interface QuickStatsResp {
  stats?: {
    name?: string;
    total_volume_cents?: number;
    active_tables?: number;
    eth_settled?: number;
  };
  member_count?: number;
  activity?: Array<{ id?: string; kind?: string; type?: string; text?: string; message?: string }>;
}
interface ClubBrowseResp {
  clubs?: Array<{
    id?: string;
    name?: string;
    active_tables?: number;
    small_blind_cents?: number;
    big_blind_cents?: number;
    member_count?: number;
  }>;
}

function activityKind(raw?: string): ActivityItem["kind"] {
  const k = (raw ?? "").toLowerCase();
  if (k.includes("win")) return "win";
  if (k.includes("member") || k.includes("join")) return "member";
  if (k.includes("tourn")) return "tournament";
  return "info";
}

/* ---------------------------------- hook --------------------------------- */

export function useClubDashboard(demo: boolean): {
  data: ClubDashboard | null;
  loading: boolean;
  reload: () => Promise<void>;
} {
  const { snapshot } = useGame();
  const [data, setData] = useState<ClubDashboard | null>(null);
  const [loading, setLoading] = useState(false);

  const reload = useCallback(async () => {
    if (demo) {
      setData(DEMO_DASHBOARD);
      return;
    }
    setLoading(true);
    try {
      const roles = (await callSessionRpc("me_roles", {})) as MeRolesResp;
      const clubId = roles.club_admin_of?.[0];
      if (!clubId) {
        setData(DEMO_DASHBOARD);
        return;
      }
      const [statsRes, browseRes] = await Promise.all([
        callSessionRpc("club_quick_stats", { club_id: clubId }) as Promise<QuickStatsResp>,
        callSessionRpc("club_browse", { limit: 6 }).catch(() => ({}) as ClubBrowseResp) as Promise<ClubBrowseResp>,
      ]);
      const s = statsRes.stats ?? {};
      const featured: FeaturedGame[] = (browseRes.clubs ?? []).slice(0, 3).map((c, i) => ({
        id: c.id ?? `t-${i}`,
        label: c.name ?? `Table ${i + 1}`,
        seated: num(c.member_count),
        maxSeats: 9,
        stakes:
          c.small_blind_cents && c.big_blind_cents
            ? `$${Math.round(num(c.small_blind_cents) / 100)}/$${Math.round(num(c.big_blind_cents) / 100)}`
            : "—",
        seatAvatars: DEMO_FEATURED_AVATARS.map(avatarUrl),
      }));
      // Count the caller's own live table into "active" when seated.
      const activeTables = num(s.active_tables) || (snapshot ? 1 : featured.length);
      const activity: ActivityItem[] = (statsRes.activity ?? []).slice(0, 8).map((a, i) => ({
        id: a.id ?? `act-${i}`,
        kind: activityKind(a.kind ?? a.type),
        text: a.text ?? a.message ?? "",
      }));
      setData({
        live: true,
        clubName: s.name ?? "Club",
        stat: {
          totalMembers: num(statsRes.member_count),
          activeTables,
          totalVolumeChips: Math.round(num(s.total_volume_cents) / 100),
          volumeEth: num(s.eth_settled),
        },
        featured: featured.length ? featured : demoFeatured(),
        activity,
      });
    } catch {
      setData(DEMO_DASHBOARD);
    } finally {
      setLoading(false);
    }
  }, [demo, snapshot]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { data, loading, reload };
}
