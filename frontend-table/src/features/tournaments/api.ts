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
export async function createTournament(draft: DraftForm): Promise<Tournament> {
  const payload = {
    name: draft.name,
    variant: draft.variant,
    buy_in_minor: Math.round(draft.buyIn * 100),
    fee_minor: Math.round(draft.fee * 100),
    starting_stack: Math.round(draft.startingStack),
    max_players: Math.round(draft.maxPlayers),
    max_seats_per_table: Math.round(draft.maxSeatsPerTable),
    scheduled_at: draft.scheduledAt ? new Date(draft.scheduledAt).toISOString() : new Date().toISOString(),
  };
  return (await callSessionRpc("tournament_create", payload)) as Tournament;
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

/** leaderboard_top → global ranked ladder (chips/winnings). */
export async function leaderboardTop(metric = "chips", limit = 5): Promise<LeaderEntry[]> {
  const data = (await callSessionRpc("leaderboard_top", { metric, limit })) as {
    entries?: LeaderEntry[];
  };
  return data.entries ?? [];
}
