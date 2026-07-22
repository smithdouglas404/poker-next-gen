"use client";

// Table-owner / club-host session state for the cinematic full-table screen.
//
// This hook is the single wiring point between the in-table admin chrome
// (Admin Control menu, Waiting List, Financial Summary) and the authoritative
// backend. Every control here binds to a real registered RPC (CLAUDE.md
// non-negotiable #4 — no dead buttons):
//
//   • me_roles            → who may see the Admin Control / Waiting List chrome
//   • OpHostAction (socket)→ pause / resume / kick / blinds / table settings
//   • club_requests_list  → pending seat requests feeding the Waiting List
//   • club_request_review → Approve a pending seat request
//   • balance_allocate    → seed the approved player's club buy-in credit
//   • hand_history        → per-hand log + per-player financial summary
//   • hand_replay         → per-hand replay (optimistic; falls back to
//                           hand_history when the RPC is not yet registered)
//
// Offline / guest (no live match) falls back to clearly-labelled DEMO data so
// the screen reads like the owner's HRC master without ever presenting fake
// numbers as live (rule #2).

import { useCallback, useEffect, useMemo, useState } from "react";

import { callSessionRpc } from "@/lib/nakama/sessionRpc";
import { useGame } from "@/features/game/GameProvider";
import { avatarDef, avatarForKey, avatarSrc, type AvatarTier } from "@/features/table/avatars";

/** Resolve any user/character key to a portrait URL for the DOM chrome. */
function avatarUrl(key: string): string {
  return avatarSrc(avatarForKey(key));
}

/** Resolve any user/character key to its catalog rarity tier (Approve card). */
function rarityOf(key: string): AvatarTier {
  return avatarDef(avatarForKey(key)).tier;
}

/* ------------------------------- types ------------------------------- */

export interface WaitingEntry {
  invitationId: string;
  clubId: string;
  userId: string;
  name: string;
  handle: string;
  avatar: string;
  /** Requested buy-in / credit line, minor units. */
  buyInCents: number;
  /** Player's connected-wallet balance, minor units (0 when unknown live). */
  walletCents: number;
  /** Catalog rarity tier of the requesting player's avatar (Approve card). */
  rarity: AvatarTier;
}

export interface FinancialRow {
  userId: string;
  name: string;
  handle: string;
  avatar: string;
  /** Net across the session, minor units. `null` when not exposed to this
   *  client (live tables only expose the caller's own net). */
  netCents: number | null;
}

export interface HandRow {
  handId: string;
  handNo: number;
  potCents: number;
  winnerName: string;
  winnerAvatar: string;
  winningHand: string;
}

export interface SessionSummary {
  totalChipsCents: number;
  totalRakeCents: number;
  players: FinancialRow[];
  hands: HandRow[];
  /** true = real backend data; false = demo fallback. */
  live: boolean;
}

export interface TableAdmin {
  /** Whether the caller may operate this table (host / platform / club admin). */
  canAdmin: boolean;
  demo: boolean;
  paused: boolean;
  clubId: string | null;
  waiting: WaitingEntry[];
  summary: SessionSummary | null;
  seated: Array<{ seat: number; name: string; stackCents: number; userId: string; avatar: string }>;
  pauseResume: () => Promise<void>;
  kick: (seat: number) => Promise<void>;
  setBlinds: (smallCents: number, bigCents: number) => Promise<void>;
  saveSettings: (settings: TableSettingsValues) => Promise<void>;
  approve: (entry: WaitingEntry) => Promise<void>;
  decline: (entry: WaitingEntry) => Promise<void>;
  loadWaiting: () => Promise<void>;
  loadSummary: () => Promise<void>;
  replayHand: (handId: string) => Promise<HandRow | null>;
}

export interface TableSettingsValues {
  // Blinds Configuration (HRC full_body master) — the primary panel.
  smallBlindCents: number;
  bigBlindCents: number;
  anteOn: boolean;
  anteCents: number;
  /** Decision clock in seconds (15–60 slider on the master). */
  turnTimeSecs: number;
  buyInMinCents: number;
  buyInMaxCents: number;
  /** Table Privacy — false = Public, true = Private. */
  isPrivate: boolean;
  // Extended host config (carried over the same authoritative channel).
  walletLimitCents: number;
  autoBuyBackPrivate: boolean;
  autoStart: boolean;
  showdownSecs: 3 | 6 | 9;
  dealToAway: boolean;
  decisionSecs: number;
  timeBankSecs: number;
  handsToFillTimeBank: number;
  revealAllHands: boolean;
  spectatorMode: boolean;
}

export const DEFAULT_TABLE_SETTINGS: TableSettingsValues = {
  smallBlindCents: 500_000,
  bigBlindCents: 1_000_000,
  anteOn: true,
  anteCents: 100_000,
  turnTimeSecs: 30,
  buyInMinCents: 10_000_000,
  buyInMaxCents: 100_000_000,
  isPrivate: false,
  walletLimitCents: 500_000_000,
  autoBuyBackPrivate: true,
  autoStart: false,
  showdownSecs: 3,
  dealToAway: true,
  decisionSecs: 30,
  timeBankSecs: 50,
  handsToFillTimeBank: 0,
  revealAllHands: true,
  spectatorMode: true,
};

/* ------------------------------- demo -------------------------------- */

const DEMO_WAITING: WaitingEntry[] = [
  { invitationId: "demo-w1", clubId: "demo-club", userId: "neon-viper", name: "ShadowRunner", handle: "User_A", avatar: avatarUrl("neon-viper"), buyInCents: 50_000_000, walletCents: 250_000_000, rarity: rarityOf("neon-viper") },
  { invitationId: "demo-w2", clubId: "demo-club", userId: "shadow-king", name: "IronVault", handle: "User_B", avatar: avatarUrl("shadow-king"), buyInCents: 75_000_000, walletCents: 100_000_000, rarity: rarityOf("shadow-king") },
  { invitationId: "demo-w3", clubId: "demo-club", userId: "steel-ghost", name: "PixelDrifter", handle: "User_C", avatar: avatarUrl("steel-ghost"), buyInCents: 40_000_000, walletCents: 325_000_000, rarity: rarityOf("steel-ghost") },
];

const DEMO_SUMMARY: SessionSummary = {
  totalChipsCents: 500_000_000,
  totalRakeCents: 17_000_000,
  live: false,
  players: [
    { userId: "cyber-samurai", name: "Cyber Samurai", handle: "User_A", avatar: avatarUrl("cyber-samurai"), netCents: -100_000_000 },
    { userId: "neon-viper", name: "Neon Viper", handle: "User_b", avatar: avatarUrl("neon-viper"), netCents: -70_000_000 },
    { userId: "shadow-king", name: "Shadow King", handle: "User_C", avatar: avatarUrl("shadow-king"), netCents: -15_000_000 },
    { userId: "ice-queen", name: "Ice Queen", handle: "User_C", avatar: avatarUrl("ice-queen"), netCents: -15_000_000 },
    { userId: "void-witch", name: "Mystic FS", handle: "User_C", avatar: avatarUrl("void-witch"), netCents: -1_100_000 },
    { userId: "gold-phantom", name: "Gold Phantom", handle: "User_A", avatar: avatarUrl("gold-phantom"), netCents: 201_100_000 },
  ],
  hands: [
    { handId: "34261706343384", handNo: 12847, potCents: 7_000_000, winnerName: "Cyber Samurai", winnerAvatar: avatarUrl("cyber-samurai"), winningHand: "Full House, Aces over Kings" },
    { handId: "34261706043561", handNo: 12846, potCents: 3_200_000, winnerName: "Neon Viper", winnerAvatar: avatarUrl("neon-viper"), winningHand: "Flush, King high" },
    { handId: "34261706839603", handNo: 12845, potCents: 2_000_000, winnerName: "Gold Phantom", winnerAvatar: avatarUrl("gold-phantom"), winningHand: "Straight, Ten to Ace" },
    { handId: "34261706733434", handNo: 12844, potCents: 2_500_000, winnerName: "Cyber Samurai", winnerAvatar: avatarUrl("cyber-samurai"), winningHand: "Three of a Kind, Queens" },
    { handId: "34261706732106", handNo: 12843, potCents: 2_500_000, winnerName: "Shadow King", winnerAvatar: avatarUrl("shadow-king"), winningHand: "Two Pair, Aces & Kings" },
    { handId: "34261706611200", handNo: 12842, potCents: 1_800_000, winnerName: "Ice Queen", winnerAvatar: avatarUrl("ice-queen"), winningHand: "Full House, Nines over Twos" },
  ],
};

/* ----------------------------- backend shapes ----------------------------- */

interface MeRolesResp {
  platform_admin?: boolean;
  club_admin_of?: string[];
}
interface ClubInvitationDTO {
  id?: string;
  club_id?: string;
  user_id?: string;
  username?: string;
  credit_limit_cents?: number;
  wallet_cents?: number;
}
interface HandIndexDTO {
  id?: string;
  hand_no?: number;
  pot?: number;
  rake?: number;
  net_cents?: number;
  won?: boolean;
  winner_seats?: number[] | string;
  user_ids?: string[] | string;
}

function num(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}
function parseArr<T>(v: T[] | string | undefined): T[] {
  if (Array.isArray(v)) return v;
  if (typeof v === "string" && v) {
    try {
      const p = JSON.parse(v);
      return Array.isArray(p) ? (p as T[]) : [];
    } catch {
      return [];
    }
  }
  return [];
}

/* ------------------------------- hook -------------------------------- */

export function useTableAdmin(demo: boolean): TableAdmin {
  const { snapshot, profile, matchId, hostAction } = useGame();

  const [roles, setRoles] = useState<MeRolesResp | null>(null);
  const [waiting, setWaiting] = useState<WaitingEntry[]>([]);
  const [summary, setSummary] = useState<SessionSummary | null>(null);

  const isHost = !!snapshot?.host_user_id && snapshot.host_user_id === profile.userId;
  const clubId = roles?.club_admin_of?.[0] ?? null;
  const canAdmin = demo || isHost || !!roles?.platform_admin || !!(roles?.club_admin_of?.length);
  const paused = !!snapshot?.host_paused;

  // Who may operate this table.
  useEffect(() => {
    if (demo) {
      setRoles({ platform_admin: false, club_admin_of: ["demo-club"] });
      return;
    }
    let alive = true;
    void callSessionRpc("me_roles", {})
      .then((r) => {
        if (alive) setRoles(r as MeRolesResp);
      })
      .catch(() => {
        if (alive) setRoles({ platform_admin: false, club_admin_of: [] });
      });
    return () => {
      alive = false;
    };
  }, [demo]);

  const loadWaiting = useCallback(async () => {
    if (demo) {
      setWaiting(DEMO_WAITING);
      return;
    }
    if (!clubId) {
      setWaiting([]);
      return;
    }
    try {
      const data = (await callSessionRpc("club_requests_list", { club_id: clubId, status: "pending" })) as {
        requests?: ClubInvitationDTO[];
      };
      const rows = (data.requests ?? []).map<WaitingEntry>((r) => {
        const uid = r.user_id ?? "";
        return {
          invitationId: r.id ?? "",
          clubId: r.club_id ?? clubId,
          userId: uid,
          name: r.username ?? "Player",
          handle: (r.username ?? "player").toLowerCase(),
          avatar: avatarUrl(uid || "neon-viper"),
          buyInCents: num(r.credit_limit_cents),
          walletCents: num(r.wallet_cents),
          rarity: rarityOf(uid || r.username || "neon-viper"),
        };
      });
      setWaiting(rows);
    } catch {
      setWaiting([]);
    }
  }, [demo, clubId]);

  const loadSummary = useCallback(async () => {
    if (demo) {
      setSummary(DEMO_SUMMARY);
      return;
    }
    if (!matchId) {
      setSummary(null);
      return;
    }
    try {
      const data = (await callSessionRpc("hand_history", { match_id: matchId, limit: 100 })) as {
        hands?: HandIndexDTO[];
      };
      const rows = data.hands ?? [];
      let totalPot = 0;
      let totalRake = 0;
      let heroNet = 0;
      const seatName = (seat: number): { name: string; avatar: string } => {
        const s = snapshot?.seats.find((x) => x.index === seat);
        const uid = s?.user_id ?? `seat-${seat}`;
        return { name: s?.username ?? `Seat ${seat + 1}`, avatar: avatarUrl(uid) };
      };
      const hands = rows.map<HandRow>((h) => {
        totalPot += num(h.pot);
        totalRake += num(h.rake);
        heroNet += num(h.net_cents);
        const winners = parseArr<number>(h.winner_seats);
        const w = winners.length ? seatName(winners[0]) : { name: "—", avatar: avatarUrl("neon-viper") };
        return {
          handId: h.id ?? "",
          handNo: num(h.hand_no),
          potCents: num(h.pot),
          winnerName: w.name,
          winnerAvatar: w.avatar,
          winningHand: "",
        };
      });
      // Live tables only expose the caller's own realised net; seated opponents
      // show "—" rather than a fabricated figure (rule #2).
      const players: FinancialRow[] = (snapshot?.seats ?? [])
        .filter((s) => s.user_id && s.status !== "empty")
        .map((s) => ({
          userId: s.user_id!,
          name: s.username ?? `Seat ${s.index + 1}`,
          handle: (s.username ?? `seat${s.index}`).toLowerCase(),
          avatar: avatarUrl(s.user_id!),
          netCents: s.user_id === profile.userId ? heroNet : null,
        }));
      setSummary({ totalChipsCents: totalPot, totalRakeCents: totalRake, players, hands, live: true });
    } catch {
      setSummary(null);
    }
  }, [demo, matchId, snapshot, profile.userId]);

  const pauseResume = useCallback(async () => {
    if (demo) return;
    await hostAction({ action: paused ? "resume" : "pause" });
  }, [demo, paused, hostAction]);

  const kick = useCallback(
    async (seat: number) => {
      if (demo) return;
      await hostAction({ action: "kick", seat });
    },
    [demo, hostAction],
  );

  const setBlinds = useCallback(
    async (smallCents: number, bigCents: number) => {
      if (demo) return;
      await hostAction({ action: "set_blinds", small_blind: smallCents, big_blind: bigCents });
    },
    [demo, hostAction],
  );

  const saveSettings = useCallback(
    async (settings: TableSettingsValues) => {
      if (demo) return;
      // Blinds are a first-class, server-honoured host action (handleHostAction
      // "set_blinds") — route them there so the change actually takes effect
      // from the next hand rather than being silently ignored.
      if (settings.smallBlindCents > 0 && settings.bigBlindCents >= settings.smallBlindCents) {
        await hostAction({
          action: "set_blinds",
          small_blind: settings.smallBlindCents,
          big_blind: settings.bigBlindCents,
        });
      }
      // The wider table config rides the same authoritative OpHostAction channel
      // so the server stays the single source of truth (never client-optimistic).
      await hostAction({
        action: "table_settings",
        ante_on: settings.anteOn,
        ante_cents: settings.anteCents,
        turn_time_secs: settings.turnTimeSecs,
        buy_in_min_cents: settings.buyInMinCents,
        buy_in_max_cents: settings.buyInMaxCents,
        is_private: settings.isPrivate,
        wallet_limit_cents: settings.walletLimitCents,
        auto_buy_back_private: settings.autoBuyBackPrivate,
        auto_start: settings.autoStart,
        showdown_secs: settings.showdownSecs,
        deal_to_away: settings.dealToAway,
        decision_secs: settings.decisionSecs,
        time_bank_secs: settings.timeBankSecs,
        hands_to_fill_time_bank: settings.handsToFillTimeBank,
        reveal_all_hands: settings.revealAllHands,
        spectator_mode: settings.spectatorMode,
      });
    },
    [demo, hostAction],
  );

  const approve = useCallback(
    async (entry: WaitingEntry) => {
      if (demo) {
        setWaiting((prev) => prev.filter((w) => w.invitationId !== entry.invitationId));
        return;
      }
      await callSessionRpc("club_request_review", {
        invitation_id: entry.invitationId,
        action: "approve",
      });
      // Seed the approved player's club buy-in credit line so they can sit.
      if (entry.clubId && entry.userId && entry.buyInCents > 0) {
        try {
          await callSessionRpc("balance_allocate", {
            club_id: entry.clubId,
            user_id: entry.userId,
            balance: entry.buyInCents,
            currency: "USD",
          });
        } catch {
          /* allocation is best-effort; approval already succeeded */
        }
      }
      await loadWaiting();
    },
    [demo, loadWaiting],
  );

  const decline = useCallback(
    async (entry: WaitingEntry) => {
      if (demo) {
        setWaiting((prev) => prev.filter((w) => w.invitationId !== entry.invitationId));
        return;
      }
      await callSessionRpc("club_request_review", {
        invitation_id: entry.invitationId,
        action: "reject",
      });
      await loadWaiting();
    },
    [demo, loadWaiting],
  );

  const replayHand = useCallback(
    async (handId: string): Promise<HandRow | null> => {
      const local = summary?.hands.find((h) => h.handId === handId) ?? null;
      if (demo) return local;
      // Prefer a dedicated replay RPC when the backend exposes one; otherwise
      // re-derive the hand from the authoritative hand_history log. Either way
      // this is a real backend round-trip, never a dead button.
      try {
        const data = (await callSessionRpc("hand_replay", { hand_id: handId, match_id: matchId })) as {
          hand?: HandIndexDTO;
        };
        if (data?.hand) {
          return {
            handId,
            handNo: num(data.hand.hand_no),
            potCents: num(data.hand.pot),
            winnerName: local?.winnerName ?? "—",
            winnerAvatar: local?.winnerAvatar ?? avatarUrl("neon-viper"),
            winningHand: local?.winningHand ?? "",
          };
        }
      } catch {
        /* fall through to hand_history-derived row */
      }
      await loadSummary();
      return local;
    },
    [demo, summary, matchId, loadSummary],
  );

  const seated = useMemo(
    () =>
      (snapshot?.seats ?? [])
        .filter((s) => s.user_id && s.status !== "empty" && s.user_id !== profile.userId)
        .map((s) => ({
          seat: s.index,
          name: s.username ?? `Seat ${s.index + 1}`,
          stackCents: s.stack,
          userId: s.user_id!,
          avatar: avatarUrl(s.user_id!),
        })),
    [snapshot, profile.userId],
  );

  return {
    canAdmin,
    demo,
    paused,
    clubId,
    waiting,
    summary,
    seated,
    pauseResume,
    kick,
    setBlinds,
    saveSettings,
    approve,
    decline,
    loadWaiting,
    loadSummary,
    replayHand,
  };
}
