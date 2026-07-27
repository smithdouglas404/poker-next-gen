// Thin RPC layer for the tournaments surface. Every function maps 1:1 to a
// registered backend-core RPC (see backend-core/main.go). The page falls back
// to demo.ts only when these throw (guest / offline) — never mixing demo rows
// into a successful live response.

import { callSessionRpc } from "@/lib/nakama/sessionRpc";

import type {
  BlindLevel,
  DraftForm,
  LeaderEntry,
  Prize,
  Tournament,
  TournamentAnalytics,
  TournamentStatus,
} from "./types";

/** tournament_list → all tournaments (registering/running/finished). */
export async function listTournaments(): Promise<Tournament[]> {
  const data = (await callSessionRpc("tournament_list", {})) as { tournaments?: Tournament[] };
  return data.tournaments ?? [];
}

/** tournament_create → creates a bracket from the draft form. Returns the row. */
/**
 * Late-registration window in seconds, derived from the builder's scheduled
 * start and registration-close time. 0 means registration shuts at the start.
 */
function lateRegSecsOf(draft: DraftForm): number {
  if (!draft.lateReg || !draft.regCloseAt || !draft.scheduledAt) return 0;
  const start = new Date(draft.scheduledAt).getTime();
  const close = new Date(draft.regCloseAt).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(close) || close <= start) return 0;
  return Math.round((close - start) / 1000);
}

export async function createTournament(draft: DraftForm): Promise<Tournament> {
  const payload = {
    name: draft.name,
    // Bind the tournament to a club (empty => platform tournament). Previously
    // never sent, so the rich panel could only make platform tournaments.
    club_id: draft.clubId || undefined,
    variant: draft.variant,
    buy_in_minor: Math.round(draft.buyIn * 100),
    fee_minor: Math.round(draft.fee * 100),
    starting_stack: Math.round(draft.startingStack),
    max_players: Math.round(draft.maxPlayers),
    max_seats_per_table: Math.round(draft.maxSeatsPerTable),
    // Knockout (PKO): part of each buy-in becomes a head bounty won on elimination.
    knockout: draft.knockout || undefined,
    bounty_minor: draft.knockout ? Math.round((draft.bounty ?? 0) * 100) : undefined,
    scheduled_at: draft.scheduledAt ? new Date(draft.scheduledAt).toISOString() : new Date().toISOString(),
    // Financials / Rules. These used to be collected by the builder and then
    // dropped here — `guaranteedPrize`, `lateReg` and `regCloseAt` were on the
    // draft and never left the browser, so the operator configured an event and
    // got a different one. They map to real columns now and the server consumes
    // each: admin fee and guarantee feed store.TournamentMoney, the operating
    // window and late-reg feed store.RegistrationOpen, and the time bank and
    // auto-away are passed to every table the tournament starts.
    admin_fee_bps: Math.round(draft.adminFeePct * 100),
    guarantee_minor: Math.round(draft.guaranteedPrize * 100),
    late_reg_secs: lateRegSecsOf(draft),
    time_bank_secs: Math.round(draft.timeBankSecs),
    time_bank_per_hand_secs: Math.round(draft.timeBankPerHandSecs),
    auto_away_on_timeout: draft.autoAway,
    operating_start_min: Math.round(draft.operatingStartMin),
    operating_end_min: Math.round(draft.operatingEndMin),
  };
  return (await callSessionRpc("tournament_create", payload)) as Tournament;
}

/**
 * tournament_rules_set → edit the Financials/Rules of an EXISTING tournament.
 * Authorized as a tournament mutation (creator or a configurer of the owning
 * club), unlike the platform-admin-only `tournament_config`.
 */
export async function setTournamentRules(
  tournamentId: string,
  rules: {
    adminFeePct: number;
    guaranteedPrize: number;
    autoAway: boolean;
    timeBankPerHandSecs: number;
    operatingStartMin: number;
    operatingEndMin: number;
  },
): Promise<unknown> {
  return callSessionRpc("tournament_rules_set", {
    tournament_id: tournamentId,
    admin_fee_bps: Math.round(rules.adminFeePct * 100),
    guarantee_minor: Math.round(rules.guaranteedPrize * 100),
    auto_away_on_timeout: rules.autoAway,
    time_bank_per_hand_secs: Math.round(rules.timeBankPerHandSecs),
    operating_start_min: Math.round(rules.operatingStartMin),
    operating_end_min: Math.round(rules.operatingEndMin),
  });
}

/** tournament_start → seat entrants and launch the director + tables. Requires
 *  ≥1 blind level and prize tiers summing to 100% (server-enforced). */
export async function startTournament(
  tournamentId: string,
): Promise<{ director_match_id?: string; table_match_ids?: string[]; status?: string }> {
  return (await callSessionRpc("tournament_start", { tournament_id: tournamentId })) as {
    director_match_id?: string;
    table_match_ids?: string[];
    status?: string;
  };
}

/** balancing_rule_set → configure multi-table balancing for a tournament. */
export async function setBalancingRule(
  tournamentId: string,
  maxSeatDifference: number,
  breakTableAtOrBelow: number,
  strategy: "balanced" | "random",
): Promise<unknown> {
  return callSessionRpc("balancing_rule_set", {
    tournament_id: tournamentId,
    max_seat_difference: maxSeatDifference,
    break_table_at_or_below: breakTableAtOrBelow,
    strategy,
  });
}

/** tournament_register → buys the current player into a tournament. */
export async function registerTournament(tournamentId: string): Promise<{ ok?: boolean }> {
  return (await callSessionRpc("tournament_register", { tournament_id: tournamentId })) as {
    ok?: boolean;
  };
}

/** tournament_status → live snapshot (standings, players left, prize pool). */
export async function tournamentStatus(tournamentId: string): Promise<TournamentStatus> {
  return (await callSessionRpc("tournament_status", {
    tournament_id: tournamentId,
  })) as TournamentStatus;
}

/** tournament_balance → signal the director to rebalance/merge tables now. */
export async function tournamentBalance(tournamentId: string): Promise<{ ok: boolean }> {
  return (await callSessionRpc("tournament_balance", {
    tournament_id: tournamentId,
  })) as { ok: boolean };
}

/** tournament_analytics → financials + progress for the owner center. */
export async function tournamentAnalytics(tournamentId: string): Promise<TournamentAnalytics> {
  return (await callSessionRpc("tournament_analytics", {
    tournament_id: tournamentId,
  })) as TournamentAnalytics;
}

/** prize_pool_list → payout ladder tiers. */
export async function prizePool(tournamentId: string): Promise<Prize[]> {
  const data = (await callSessionRpc("prize_pool_list", { tournament_id: tournamentId })) as {
    prizes?: Prize[];
  };
  return data.prizes ?? [];
}

/** blind_level_list → blind structure. */
export async function blindLevels(tournamentId: string): Promise<BlindLevel[]> {
  const data = (await callSessionRpc("blind_level_list", { tournament_id: tournamentId })) as {
    levels?: BlindLevel[];
  };
  return data.levels ?? [];
}

/** leaderboard_top → global ranked ladder (chips/winnings). period "season"
 *  reads the monthly-resetting bankroll-season board; anything else = all-time. */
export async function leaderboardTop(
  metric = "chips",
  limit = 5,
  period: "all" | "season" = "all",
): Promise<LeaderEntry[]> {
  const data = (await callSessionRpc("leaderboard_top", { metric, limit, period })) as {
    entries?: LeaderEntry[];
  };
  return data.entries ?? [];
}

/** season_current → active bankroll-season window + top standings. */
export async function seasonCurrent(
  metric = "winnings",
  limit = 20,
): Promise<{ starts_at: number; ends_at: number; entries: LeaderEntry[] }> {
  const data = (await callSessionRpc("season_current", { metric, limit })) as {
    starts_at?: number;
    ends_at?: number;
    entries?: LeaderEntry[];
  };
  return { starts_at: data.starts_at ?? 0, ends_at: data.ends_at ?? 0, entries: data.entries ?? [] };
}

/** blind_level_add → persist a single blind level onto a tournament structure. */
export async function blindLevelAdd(tournamentId: string, level: BlindLevel): Promise<BlindLevel> {
  return (await callSessionRpc("blind_level_add", {
    tournament_id: tournamentId,
    level: level.level,
    small_blind: level.small_blind,
    big_blind: level.big_blind,
    ante: level.ante,
    duration_secs: level.duration_secs,
    is_break: level.is_break ?? false,
  })) as BlindLevel;
}

/** prize_pool_add → persist a single payout tier onto a tournament. */
export async function prizePoolAdd(tournamentId: string, prize: Prize): Promise<Prize> {
  return (await callSessionRpc("prize_pool_add", {
    tournament_id: tournamentId,
    rank_from: prize.rank_from,
    rank_to: prize.rank_to,
    payout_bps: prize.payout_bps,
    guaranteed_minor: prize.guaranteed_minor,
  })) as Prize;
}

/** tournament_finalize → settle payouts and mark the event finished (admin). */
export async function finalizeTournament(tournamentId: string): Promise<{ ok?: boolean }> {
  return (await callSessionRpc("tournament_finalize", {
    tournament_id: tournamentId,
  })) as { ok?: boolean };
}
