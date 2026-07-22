"use client";

// Wiring hook for the four genuinely-missing in-table overlay states. Every
// control binds to a real registered backend-core RPC (CLAUDE.md non-negotiable
// #4 — no dead buttons); offline / demo falls back to clearly-labelled demo data
// so the screens read like the HRC master without presenting fake numbers as
// live (rule #2 / #3 — the display is a pure projection of server truth).
//
//   • Game Paused        → OpHostAction {action:"pause"|"resume"} + snapshot.host_paused
//   • Player Game Report → player_stats (aggregate) + hand_history (per-hand log)
//   • Player Kick / Ban  → club_kick {club_id,user_id} / admin_ban {user_id,reason}
//   • Breaking News       → announcement_list (read) + announcement_create (admin write)

import { useCallback, useState } from "react";

import { callSessionRpc } from "@/lib/nakama/sessionRpc";
import { useGame } from "@/features/game/GameProvider";
import { avatarForKey, avatarSrc } from "@/features/table/avatars";
import type { TableAdmin } from "../adminSession";

function avatarUrl(key: string): string {
  return avatarSrc(avatarForKey(key));
}
function num(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

/* --------------------------------- types --------------------------------- */

export interface ReportHand {
  handNo: number;
  hole: string[]; // e.g. ["Ah","Ks"] — demo only; hand_history does not expose hole cards
  board: string[]; // up to 5 community cards — demo only
  outcome: string; // "WIN - Straight" | "LOSS"
  won: boolean;
  netCents: number;
}

export interface PlayerReport {
  live: boolean;
  netCents: number;
  handsWon: number;
  handsLost: number;
  winRatePct: number;
  biggestPotCents: number;
  hands: ReportHand[];
}

export interface NewsItem {
  id: string;
  title: string;
  body: string;
  severity: string;
}

export interface KickTarget {
  userId: string;
  name: string;
  handle: string;
  avatar: string;
  /** Seat index at this table, or null when the target is off-table. */
  seat: number | null;
}

export interface TableOverlays {
  demo: boolean;
  canAdmin: boolean;
  /** True when the table is paused by the host (blocking overlay). */
  showPaused: boolean;
  /** Only a host/admin may resume; seated players just wait. */
  canResume: boolean;
  resume: () => Promise<void>;
  quit: () => Promise<void>;

  report: PlayerReport | null;
  reportLoading: boolean;
  loadReport: (userId?: string) => Promise<void>;

  activeNews: NewsItem | null;
  dismissNews: () => void;
  loadNews: () => Promise<void>;
  broadcastNews: (title: string, body: string, durationHours: number) => Promise<void>;

  kick: (target: KickTarget) => Promise<void>;
  ban: (target: KickTarget, reason: string) => Promise<void>;

  /** Dev-control hooks (demo only) to force a state open. */
  setDemoPaused: (v: boolean) => void;
  showDemoNews: () => void;
}

/* ---------------------------------- demo ---------------------------------- */

// Matches the HRC "Player Game Report" master: +$875,000 session, 24/18, biggest
// pot $1,250,000, straight-heavy personal hand history.
const DEMO_REPORT: PlayerReport = {
  live: false,
  netCents: 87_500_000,
  handsWon: 24,
  handsLost: 18,
  winRatePct: 57,
  biggestPotCents: 125_000_000,
  hands: [
    { handNo: 142, hole: ["Ah", "Ks"], board: ["Jc", "Th", "7d", "Qc", "2s"], outcome: "WIN - Straight", won: true, netCents: 60_000_000 },
    { handNo: 141, hole: ["Ad", "Kd"], board: ["Jc", "Th", "7d", "Qs", "2c"], outcome: "WIN - Straight", won: true, netCents: 60_000_000 },
    { handNo: 140, hole: ["Jh", "Kh"], board: ["Jc", "Th", "7d", "Qc", "2c"], outcome: "WIN - Straight", won: true, netCents: 60_000_000 },
    { handNo: 139, hole: ["Ah", "Ks"], board: ["Jc", "Th", "7d", "Qc", "2s"], outcome: "WIN - Straight", won: true, netCents: 60_000_000 },
    { handNo: 138, hole: ["9c", "9d"], board: ["2h", "5s", "Kd", "Qh", "3c"], outcome: "LOSS", won: false, netCents: -22_000_000 },
    { handNo: 137, hole: ["As", "Qs"], board: ["Ac", "7h", "3d", "Ts", "Jc"], outcome: "WIN - Pair of Aces", won: true, netCents: 41_000_000 },
  ],
};

// Matches the HRC kick/ban master (Avatar 1 [User_A]).
export const DEMO_KICK_TARGET: KickTarget = {
  userId: "cyber-samurai",
  name: "Cyber Samurai",
  handle: "User_A",
  avatar: avatarUrl("cyber-samurai"),
  seat: 0,
};

const DEMO_NEWS: NewsItem = {
  id: "demo-news",
  title: "Breaking News",
  body: "ATTENTION ALL PLAYERS: SPECIAL TOURNAMENT STARTS IN 1 HOUR!\nDOUBLE XP EVENT IS NOW LIVE!",
  severity: "high",
};

/* ---------------------------- backend shapes ------------------------------ */

interface PlayerStatsResp {
  hands?: number;
  win_rate_pct?: number;
  net_cents?: number;
}
interface HandIndexDTO {
  hand_no?: number;
  pot?: number;
  net_cents?: number;
  won?: boolean;
}
interface AnnouncementDTO {
  id?: string;
  title?: string;
  body?: string;
  severity?: string;
}

/* ---------------------------------- hook ---------------------------------- */

export function useTableOverlays(demo: boolean, admin: TableAdmin): TableOverlays {
  const { snapshot, matchId, profile, standUp } = useGame();

  const [demoPaused, setDemoPaused] = useState(false);
  const [report, setReport] = useState<PlayerReport | null>(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [activeNews, setActiveNews] = useState<NewsItem | null>(null);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  const showPaused = demo ? demoPaused : !!snapshot?.host_paused;
  const canResume = admin.canAdmin;

  const resume = useCallback(async () => {
    if (demo) {
      setDemoPaused(false);
      return;
    }
    if (canResume) await admin.pauseResume();
  }, [demo, canResume, admin]);

  const quit = useCallback(async () => {
    if (demo) {
      setDemoPaused(false);
      return;
    }
    await standUp();
  }, [demo, standUp]);

  const loadReport = useCallback(
    async (userId?: string) => {
      if (demo) {
        setReport(DEMO_REPORT);
        return;
      }
      setReportLoading(true);
      try {
        const target = userId ?? profile.userId;
        const [stats, history] = await Promise.all([
          callSessionRpc("player_stats", target ? { user_id: target } : {}) as Promise<PlayerStatsResp>,
          callSessionRpc("hand_history", { match_id: matchId ?? "", limit: 50 }) as Promise<{ hands?: HandIndexDTO[] }>,
        ]);
        const totalHands = num(stats.hands);
        const winRate = num(stats.win_rate_pct);
        const handsWon = Math.round((winRate / 100) * totalHands);
        const rows = history.hands ?? [];
        let biggest = 0;
        const hands = rows.map<ReportHand>((h) => {
          if (h.won && num(h.pot) > biggest) biggest = num(h.pot);
          // hand_history does not expose per-hand hole/board cards to this
          // client; live rows show the authoritative outcome only (no fabricated
          // cards — rule #3).
          return {
            handNo: num(h.hand_no),
            hole: [],
            board: [],
            outcome: h.won ? "WIN" : "LOSS",
            won: !!h.won,
            netCents: num(h.net_cents),
          };
        });
        setReport({
          live: true,
          netCents: num(stats.net_cents),
          handsWon,
          handsLost: Math.max(0, totalHands - handsWon),
          winRatePct: winRate,
          biggestPotCents: biggest,
          hands,
        });
      } catch {
        setReport(null);
      } finally {
        setReportLoading(false);
      }
    },
    [demo, matchId, profile.userId],
  );

  const loadNews = useCallback(async () => {
    if (demo) return;
    try {
      const data = (await callSessionRpc("announcement_list", {})) as { announcements?: AnnouncementDTO[] };
      const first = (data.announcements ?? [])[0];
      if (first?.id && !dismissed.has(first.id)) {
        setActiveNews({
          id: first.id,
          title: first.title ?? "Breaking News",
          body: first.body ?? "",
          severity: first.severity ?? "info",
        });
      }
    } catch {
      /* no active announcements */
    }
  }, [demo, dismissed]);

  const dismissNews = useCallback(() => {
    setActiveNews((n) => {
      if (n) setDismissed((prev) => new Set(prev).add(n.id));
      return null;
    });
  }, []);

  const showDemoNews = useCallback(() => {
    setActiveNews(DEMO_NEWS);
  }, []);

  const broadcastNews = useCallback(
    async (title: string, body: string, durationHours: number) => {
      if (demo) {
        setActiveNews({ id: `demo-${Date.now()}`, title: title || "Breaking News", body, severity: "high" });
        return;
      }
      const data = (await callSessionRpc("announcement_create", {
        title,
        body,
        severity: "high",
        audience: "all",
        duration_hours: durationHours,
      })) as { id?: string };
      setActiveNews({ id: data.id ?? `local-${Date.now()}`, title, body, severity: "high" });
    },
    [demo],
  );

  const kick = useCallback(
    async (target: KickTarget) => {
      if (demo) return;
      if (admin.clubId) {
        await callSessionRpc("club_kick", { club_id: admin.clubId, user_id: target.userId });
      } else if (target.seat !== null) {
        // Non-club (public) table: remove via the authoritative host action.
        await admin.kick(target.seat);
      }
    },
    [demo, admin],
  );

  const ban = useCallback(
    async (target: KickTarget, reason: string) => {
      if (demo) return;
      await callSessionRpc("admin_ban", { user_id: target.userId, reason });
      // A ban also removes them from the club/table when possible.
      try {
        await kick(target);
      } catch {
        /* ban already recorded */
      }
    },
    [demo, kick],
  );

  return {
    demo,
    canAdmin: admin.canAdmin,
    showPaused,
    canResume,
    resume,
    quit,
    report,
    reportLoading,
    loadReport,
    activeNews,
    dismissNews,
    loadNews,
    broadcastNews,
    kick,
    ban,
    setDemoPaused,
    showDemoNews,
  };
}
