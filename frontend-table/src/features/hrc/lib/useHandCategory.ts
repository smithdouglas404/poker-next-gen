"use client";

// The hero's made-hand category, from engine-math (rs_poker) and nowhere else.
//
// CLAUDE.md Golden rule 4: "Shuffle, hand rank, showdown, and equity always go
// through engine-math (rs_poker) ... must not silently use local eval." The pill
// above the hero's hole cards used to be computed by
// `hrc/lib/hand-evaluator.ts`, a second, independent hand evaluator running in
// the browser — so the number a player read off the felt came from a different
// implementation than the one that actually awards the pot. This is the
// server-backed replacement.
//
// There is deliberately NO local fallback. If the sidecar is unreachable the
// hook returns null and the caller renders nothing, per non-negotiable 3: the
// display reflects server truth or it shows nothing.

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

import type { CardType } from "./poker-types";
import { callSessionRpc } from "@/lib/nakama/sessionRpc";

const SUIT_LETTER: Record<CardType["suit"], string> = {
  hearts: "h",
  diamonds: "d",
  clubs: "c",
  spades: "s",
};

/** CardType -> the engine's card code. Inverse of adapter.ts `toCard`, which
 *  spells the ten "10" on the HRC side and "T" on the wire. */
export function toEngineCode(card: CardType): string {
  return `${card.rank === "10" ? "T" : card.rank}${SUIT_LETTER[card.suit]}`;
}

/**
 * rs_poker's `Rank` category, Debug-formatted by engine-math
 * (`server.rs`: `format!("{:?}", rank.category())`), so it arrives PascalCase:
 * `HighCard`, `OnePair`, `ThreeOfAKind`, `StraightFlush`, ...
 *
 * Split on every capital, not on lower->upper. `/([a-z])([A-Z])/` leaves
 * consecutive capitals joined and renders `ThreeOfAKind` as "THREE OF AKIND".
 */
export function handCategoryLabel(raw: string): string {
  return raw.replace(/_/g, " ").replace(/([A-Z])/g, " $1").trim().toUpperCase();
}

/**
 * Hold'em goes to `hand_rank`, PLO to `omaha_rank`.
 *
 * This split is not cosmetic: Omaha requires EXACTLY two hole cards plus three
 * board cards, and `hand_rank` just takes the best five of everything it is
 * given. Feeding a 4-card PLO hand to `hand_rank` returns a hand the player does
 * not actually hold. `omaha_rank` (backend-core `rpc/omaha.go` -> engine-math
 * `/omaha/rank`) applies the real rule.
 *
 * Both need at least five cards to rank, so this returns null until the flop —
 * pre-flop there is no made hand for the engine to name, and inventing one
 * locally is the exact fallback this hook exists to remove.
 */
export function useHandCategory(
  holeCards: CardType[] | undefined,
  communityCards: CardType[],
): string | null {
  const demo = useSearchParams().get("demo") === "1";
  const [category, setCategory] = useState<string | null>(null);

  const hole = (holeCards ?? []).map(toEngineCode).join("");
  const board = communityCards.map(toEngineCode).join("");
  const holeCount = holeCards?.length ?? 0;
  const boardCount = communityCards.length;

  useEffect(() => {
    // ?demo=1 has no backend by design. DEMO_SNAPSHOT deals Ah/Ad against a
    // board holding As, so this is an honest label for what is on the felt
    // rather than a placeholder — and it is a fixture, not a fallback: it is
    // never reachable at a real table. Same treatment as GameStatusRail.
    if (demo) {
      setCategory("THREE OF A KIND");
      return;
    }
    if (holeCount < 2 || boardCount < 3) {
      setCategory(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const res = (await (holeCount === 4
          ? callSessionRpc("omaha_rank", { hole, board })
          : callSessionRpc("hand_rank", { cards: hole + board }))) as {
          category?: string;
        };
        if (cancelled) return;
        setCategory(res.category ? handCategoryLabel(res.category) : null);
      } catch {
        // Sidecar down or RPC rejected: show nothing. Never guess locally.
        if (!cancelled) setCategory(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [demo, hole, board, holeCount, boardCount]);

  return category;
}
