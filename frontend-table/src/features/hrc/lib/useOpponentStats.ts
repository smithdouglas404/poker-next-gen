import { useEffect, useRef, useState, useCallback } from 'react';
import type { GameState, Player } from './poker-types';

export interface OpponentHudStats {
  handsPlayed: number;
  vpipCount: number;
  pfrCount: number;
  aggressiveActions: number;
  passiveActions: number;
}

interface RawCounts {
  handsPlayed: number;
  vpipCount: number;
  pfrCount: number;
  aggressiveActions: number;
  passiveActions: number;
  /** Track if this player already acted voluntarily this hand (for VPIP dedup per hand) */
  vpipThisHand: boolean;
  /** Track if this player already raised preflop this hand (for PFR dedup per hand) */
  pfrThisHand: boolean;
}

export function useOpponentStats(
  gameState: GameState,
  players: Player[],
  heroId: string,
) {
  const countsRef = useRef<Map<string, RawCounts>>(new Map());
  const lastActionNumberRef = useRef<number>(-1);
  const lastHandNumberRef = useRef<number>(-1);
  const [hudEnabled, setHudEnabled] = useState(false);
  const [snapshot, setSnapshot] = useState<Map<string, OpponentHudStats>>(new Map());

  // Track hand changes — increment handsPlayed for each active player
  useEffect(() => {
    const handNum = gameState.handNumber ?? 0;
    if (handNum > 0 && handNum !== lastHandNumberRef.current) {
      lastHandNumberRef.current = handNum;
      const counts = countsRef.current;

      for (const p of players) {
        if (p.id === heroId) continue;
        if (!counts.has(p.id)) {
          counts.set(p.id, { handsPlayed: 0, vpipCount: 0, pfrCount: 0, aggressiveActions: 0, passiveActions: 0, vpipThisHand: false, pfrThisHand: false });
        }
        const c = counts.get(p.id)!;
        c.handsPlayed++;
        c.vpipThisHand = false;
        c.pfrThisHand = false;
      }

      // Update snapshot
      updateSnapshot();
    }
  }, [gameState.handNumber, players, heroId]);

  // Track actions — update VPIP/PFR/AF
  useEffect(() => {
    const action = gameState.lastAction;
    const actionNum = gameState.actionNumber ?? -1;
    if (!action || actionNum <= lastActionNumberRef.current) return;
    lastActionNumberRef.current = actionNum;

    const { playerId, action: act } = action;
    if (playerId === heroId) return;

    const counts = countsRef.current;
    if (!counts.has(playerId)) {
      counts.set(playerId, { handsPlayed: 0, vpipCount: 0, pfrCount: 0, aggressiveActions: 0, passiveActions: 0, vpipThisHand: false, pfrThisHand: false });
    }
    const c = counts.get(playerId)!;

    const lowerAct = act.toLowerCase();

    // VPIP: call or raise (voluntary put money in pot)
    if ((lowerAct === 'call' || lowerAct === 'raise') && !c.vpipThisHand) {
      c.vpipCount++;
      c.vpipThisHand = true;
    }

    // PFR: raise during preflop
    if (lowerAct === 'raise' && gameState.phase === 'pre-flop' && !c.pfrThisHand) {
      c.pfrCount++;
      c.pfrThisHand = true;
    }

    // Aggression: raise/bet = aggressive, call/check = passive
    if (lowerAct === 'raise') {
      c.aggressiveActions++;
    } else if (lowerAct === 'call' || lowerAct === 'check') {
      c.passiveActions++;
    }

    updateSnapshot();
  }, [gameState.lastAction, gameState.actionNumber, gameState.phase, heroId]);

  const updateSnapshot = useCallback(() => {
    const next = new Map<string, OpponentHudStats>();
    countsRef.current.forEach((c, id) => {
      next.set(id, {
        handsPlayed: c.handsPlayed,
        vpipCount: c.vpipCount,
        pfrCount: c.pfrCount,
        aggressiveActions: c.aggressiveActions,
        passiveActions: c.passiveActions,
      });
    });
    setSnapshot(next);
  }, []);

  return { opponentStats: snapshot, hudEnabled, setHudEnabled };
}
