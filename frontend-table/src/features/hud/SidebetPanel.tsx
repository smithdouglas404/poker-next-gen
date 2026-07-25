"use client";

import { useCallback, useEffect, useState } from "react";

import { useGame } from "@/features/game/GameProvider";
import { callSessionRpc } from "@/lib/nakama/sessionRpc";

// Side-bet panel (#85): player-vs-player wagers at the table. Offer a proposition
// + stake (escrowed), others accept, and either party settles by conceding or via
// engine-math equity of both showdown hands. Every control hits a real RPC.

interface Sidebet {
  id: string;
  proposer: string;
  proposer_name: string;
  acceptor: string;
  acceptor_name: string;
  proposition: string;
  stake_minor: number;
  status: string;
  winner: string;
}

const usd = (c: number) => `$${(c / 100).toFixed(2)}`;

export function SidebetPanel() {
  const { matchId, profile } = useGame();
  const me = profile?.userId ?? "";
  const [bets, setBets] = useState<Sidebet[]>([]);
  const [prop, setProp] = useState("");
  const [stake, setStake] = useState(5);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!matchId) return;
    try {
      const r = (await callSessionRpc("sidebet_list", { match_id: matchId })) as { sidebets: Sidebet[] };
      setBets(r.sidebets ?? []);
    } catch {
      /* offline */
    }
  }, [matchId]);

  useEffect(() => {
    void reload();
    const t = window.setInterval(reload, 6000);
    return () => window.clearInterval(t);
  }, [reload]);

  const act = useCallback(
    async (fn: () => Promise<unknown>, ok: string) => {
      setBusy(true);
      setMsg(null);
      try {
        await fn();
        setMsg(ok);
        await reload();
      } catch (e) {
        setMsg(e instanceof Error ? e.message : "Action failed");
      } finally {
        setBusy(false);
      }
    },
    [reload],
  );

  if (!matchId) return null;

  return (
    <div className="pointer-events-auto rounded-xl border border-white/[0.06] bg-surface px-3 py-2 text-xs shadow-[0_2px_12px_rgba(0,0,0,0.4)]">
      <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-gold/70">Side Bets</p>

      {/* Offer */}
      <div className="flex items-center gap-1.5">
        <input
          value={prop}
          onChange={(e) => setProp(e.target.value)}
          placeholder="e.g. AA holds"
          className="min-w-0 flex-1 rounded border border-white/10 bg-black/40 px-2 py-1 text-[11px] outline-none focus:border-gold/40"
        />
        <input
          type="number"
          min={1}
          value={stake}
          onChange={(e) => setStake(Math.max(1, Number(e.target.value)))}
          className="w-12 rounded border border-white/10 bg-black/40 px-1.5 py-1 text-[11px] outline-none"
        />
        <button
          type="button"
          disabled={busy}
          onClick={() => void act(() => callSessionRpc("sidebet_offer", { match_id: matchId, proposition: prop, stake_minor: Math.round(stake * 100) }), "Offer posted")}
          className="rounded bg-gold/90 px-2 py-1 text-[11px] font-bold text-black hover:bg-gold disabled:opacity-40"
        >
          Offer
        </button>
      </div>

      {msg && <p className="mt-1 text-[10px] text-muted">{msg}</p>}

      {/* List */}
      <div className="mt-2 max-h-40 space-y-1 overflow-y-auto">
        {bets.length === 0 ? (
          <p className="py-1 text-[10px] text-neutral-500">No side bets yet.</p>
        ) : (
          bets.map((b) => {
            const mine = b.proposer === me;
            const party = mine || b.acceptor === me;
            return (
              <div key={b.id} className="rounded border border-white/[0.06] bg-black/30 px-2 py-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-[11px] text-white">{b.proposition || "Side bet"}</span>
                  <span className="shrink-0 font-semibold text-gold">{usd(b.stake_minor)}</span>
                </div>
                <div className="mt-0.5 flex items-center justify-between">
                  <span className="text-[9px] uppercase tracking-wide text-neutral-500">
                    {b.status}
                    {b.status === "settled" && b.winner && ` · ${b.winner === me ? "you won" : "you lost"}`}
                  </span>
                  <div className="flex gap-1">
                    {b.status === "offered" && !mine && (
                      <button type="button" disabled={busy} onClick={() => void act(() => callSessionRpc("sidebet_accept", { sidebet_id: b.id }), "Accepted")} className="rounded bg-green/80 px-1.5 py-0.5 text-[10px] font-bold text-black hover:bg-green">
                        Accept
                      </button>
                    )}
                    {b.status === "offered" && mine && (
                      <button type="button" disabled={busy} onClick={() => void act(() => callSessionRpc("sidebet_cancel", { sidebet_id: b.id }), "Cancelled")} className="rounded border border-white/15 px-1.5 py-0.5 text-[10px] hover:border-white/30">
                        Cancel
                      </button>
                    )}
                    {b.status === "accepted" && party && (
                      <button type="button" disabled={busy} onClick={() => void act(() => callSessionRpc("sidebet_settle", { sidebet_id: b.id, concede: true }), "Conceded")} className="rounded border border-brand/40 px-1.5 py-0.5 text-[10px] text-brand hover:bg-brand/10">
                        Concede
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
