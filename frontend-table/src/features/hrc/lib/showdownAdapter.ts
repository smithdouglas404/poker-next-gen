// Adapter: our Nakama ShowdownMessage -> ShowdownOverlay's Player/ShowdownResult
// props. Same seam-only-translation rule as adapter.ts — the server stays
// authoritative (CLAUDE.md non-negotiable #3), so this file never computes a
// hand's category client-side; it only reshapes what the server already sent.
//
// backend-core's real "show or muck" rule (handler.go broadcastShowdownFromResult):
// actual winners are always revealed with a server-computed hand category
// (rs_poker); everyone else may muck. A non-winner who DID show still has no
// server-computed category (the backend never ranks a losing hand) — that's
// reflected here by simply leaving ShowdownResult.hand undefined for them,
// never guessed at.

import type { ShowdownMessage, TableSnapshot } from "@/features/game/protocol";
import type { Player } from "./poker-types";
import { toCards } from "../adapter";
import type { ShowdownResult } from "../components/ShowdownOverlay";

export function adaptShowdown(
  showdown: ShowdownMessage,
  snapshot: TableSnapshot,
  basePlayers: Player[],
): { players: Player[]; results: ShowdownResult[] } {
  const muckedCardCount = snapshot.variant === "plo" ? 4 : 2;

  const userIdBySeat = new Map<number, string>();
  for (const seat of snapshot.seats ?? []) {
    if (seat.user_id) userIdBySeat.set(seat.index, seat.user_id);
  }

  const winnerIds = new Set<string>();
  const winnerHandById = new Map<string, string>();
  for (const w of showdown.winners ?? []) {
    const uid = userIdBySeat.get(w.seat);
    if (!uid) continue;
    winnerIds.add(uid);
    if (w.hand) winnerHandById.set(uid, w.hand);
  }

  const revealed = showdown.hands ?? {};

  // Every contender at the table, not just the ones the server revealed —
  // a mucked seat still needs a face-down placeholder so ShowdownOverlay's
  // "Other Hands" row shows the real set of players, not only the shown ones.
  const players: Player[] = basePlayers.map((base) => {
    const cardViews = revealed[base.id];
    if (cardViews) {
      return { ...base, cards: toCards(cardViews) };
    }
    // Mucked (or folded before showdown): face-down placeholder, count only
    // — never real ranks/suits, since the server never sent any.
    return {
      ...base,
      cards: Array.from({ length: muckedCardCount }, () => ({
        rank: "A" as const,
        suit: "spades" as const,
        hidden: true,
      })),
    };
  });

  const results: ShowdownResult[] = players.map((p) => ({
    playerId: p.id,
    isWinner: winnerIds.has(p.id),
    hand: winnerHandById.has(p.id) ? { description: winnerHandById.get(p.id)! } : undefined,
  }));

  return { players, results };
}
