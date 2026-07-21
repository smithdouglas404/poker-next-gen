"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { callSessionRpc } from "@/lib/nakama/sessionRpc";
import { useGame } from "@/features/game/GameProvider";

interface AuditEvent {
  event_type: string;
  hand_no: number;
  payload: Record<string, unknown>;
  payload_hash?: string;
}

function readableEvent(ev: AuditEvent): string {
  const p = ev.payload || {};
  switch (ev.event_type) {
    case "hand_started": {
      const sb = p.small_blind ?? p.sb;
      const bb = p.big_blind ?? p.bb;
      return `Hand #${ev.hand_no} dealt${sb && bb ? ` — blinds ${sb}/${bb}` : ""}`;
    }
    case "player_action": {
      const who = (p.player as string) || (p.username as string) || `Seat ${p.seat ?? "?"}`;
      const action = (p.action as string) || (p.type as string) || "acts";
      const amount = p.amount as number | undefined;
      return `${who} ${action}${amount ? ` ${amount}` : ""}`;
    }
    case "hand_settled": {
      const board = Array.isArray(p.board) ? (p.board as string[]).join(" ") : "";
      const pot = p.pot as number | undefined;
      const payouts = p.payouts as Record<string, number> | undefined;
      const winners = payouts ? Object.keys(payouts).length : 0;
      return `Showdown${board ? ` — board ${board}` : ""}${pot ? ` · pot ${pot}` : ""}${winners ? ` · ${winners} paid` : ""}`;
    }
    default:
      return ev.event_type;
  }
}

/** Hand-history replay: step through every action of past hands at this table,
 *  reconstructed from the tamper-evident audit chain (audit_list). */
export function HandHistoryPanel() {
  const { matchId } = useGame();
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [handNo, setHandNo] = useState<number | null>(null);
  const [step, setStep] = useState(0);
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    if (!matchId) return;
    try {
      const data = (await callSessionRpc("audit_list", { match_id: matchId, limit: 300 })) as {
        events?: AuditEvent[];
      };
      setEvents(data.events ?? []);
    } catch {
      /* ignore */
    }
  }, [matchId]);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  const hands = useMemo(() => {
    const set = new Set<number>();
    for (const e of events) if (e.hand_no > 0) set.add(e.hand_no);
    return Array.from(set).sort((a, b) => b - a);
  }, [events]);

  const handEvents = useMemo(
    () =>
      events
        .filter((e) => e.hand_no === handNo)
        .slice()
        .reverse(), // oldest → newest for replay order
    [events, handNo],
  );

  const selectHand = (n: number) => {
    setHandNo(n);
    setStep(0);
  };

  if (!matchId) return null;

  return (
    <aside className="pointer-events-auto flex w-full max-w-xs flex-col rounded-2xl border border-white/10 bg-black/60 backdrop-blur-md">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center justify-between px-4 py-3 text-left"
      >
        <span className="text-xs uppercase tracking-[0.25em] text-amber-300/80">Hand History</span>
        <span className="text-neutral-500">{open ? "▾" : "▸"}</span>
      </button>

      {open && (
        <div className="border-t border-white/10 p-3">
          {hands.length === 0 ? (
            <p className="text-xs text-neutral-500">No hands recorded yet.</p>
          ) : (
            <>
              <div className="flex flex-wrap gap-1">
                {hands.slice(0, 12).map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => selectHand(n)}
                    className={`rounded px-2 py-0.5 text-[11px] font-semibold ${
                      handNo === n ? "bg-amber-500 text-black" : "bg-white/5 text-neutral-300"
                    }`}
                  >
                    #{n}
                  </button>
                ))}
              </div>

              {handNo !== null && handEvents.length > 0 && (
                <div className="mt-3">
                  <ol className="space-y-1">
                    {handEvents.map((ev, i) => (
                      <li
                        key={i}
                        className={`rounded px-2 py-1 text-[11px] ${
                          i === step
                            ? "bg-amber-400/15 text-amber-100"
                            : i < step
                              ? "text-neutral-400"
                              : "text-neutral-600"
                        }`}
                      >
                        {readableEvent(ev)}
                      </li>
                    ))}
                  </ol>
                  <div className="mt-2 flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => setStep((s) => Math.max(0, s - 1))}
                      disabled={step === 0}
                      className="rounded border border-white/15 px-2 py-0.5 text-[11px] disabled:opacity-40"
                    >
                      ◀ Prev
                    </button>
                    <span className="text-[10px] text-neutral-500">
                      {step + 1}/{handEvents.length}
                    </span>
                    <button
                      type="button"
                      onClick={() => setStep((s) => Math.min(handEvents.length - 1, s + 1))}
                      disabled={step >= handEvents.length - 1}
                      className="rounded border border-white/15 px-2 py-0.5 text-[11px] disabled:opacity-40"
                    >
                      Next ▶
                    </button>
                  </div>
                  <p className="mt-2 text-[9px] text-neutral-600">
                    Reconstructed from the tamper-evident audit chain.
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </aside>
  );
}
