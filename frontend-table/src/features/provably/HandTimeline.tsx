"use client";

import { useEffect, useMemo, useState } from "react";

import { GLASS_PANEL, HEADING_SM, cn } from "@/features/ui/tokens";

import type { AuditEvent, HandRef } from "./types";

function readableEvent(ev: AuditEvent): { text: string; kind: string } {
  const p = ev.payload || {};
  switch (ev.event_type) {
    case "hand_started": {
      const sb = p.small_blind ?? p.sb;
      const bb = p.big_blind ?? p.bb;
      return { text: `Hand #${ev.hand_no} dealt${sb && bb ? ` — blinds ${sb}/${bb}` : ""}`, kind: "deal" };
    }
    case "player_action": {
      const who = (p.player as string) || (p.username as string) || `Seat ${p.seat ?? "?"}`;
      const action = (p.action as string) || (p.type as string) || "acts";
      const amount = p.amount as number | undefined;
      return { text: `${who} ${action}${amount ? ` ${amount}` : ""}`, kind: action };
    }
    case "hand_settled": {
      const board = Array.isArray(p.board) ? (p.board as string[]).join(" ") : "";
      const pot = p.pot as number | undefined;
      const payouts = p.payouts as Record<string, number> | undefined;
      const winners = payouts ? Object.keys(payouts).length : 0;
      return {
        text: `Showdown${board ? ` — board ${board}` : ""}${pot ? ` · pot ${pot}` : ""}${winners ? ` · ${winners} paid` : ""}`,
        kind: "settle",
      };
    }
    default:
      return { text: ev.event_type, kind: "other" };
  }
}

const DOT: Record<string, string> = {
  deal: "bg-cyan",
  settle: "bg-gold",
  fold: "bg-neutral-500",
  other: "bg-white/30",
};
function dotColor(kind: string): string {
  return DOT[kind] ?? "bg-emerald-400";
}

/** Step-through replay of a hand, reconstructed from the tamper-evident audit
 *  chain returned by audit_list. Oldest → newest so it reads as it was played. */
export function HandTimeline({
  active,
  events,
  loading,
}: {
  active: HandRef | null;
  events: AuditEvent[];
  loading: boolean;
}) {
  const ordered = useMemo(() => events.slice().reverse(), [events]);
  const [step, setStep] = useState(0);

  useEffect(() => {
    setStep(0);
  }, [active?.matchId, active?.handNo, events]);

  const max = ordered.length - 1;

  return (
    <div className={cn(GLASS_PANEL, "flex flex-col overflow-hidden")}>
      <div className="flex items-center justify-between gap-3 border-b border-white/[0.06] bg-white/[0.02] px-5 py-4">
        <p className={cn(HEADING_SM, "text-cyan/80")}>Hand Replay</p>
        {ordered.length > 0 && (
          <span className="font-mono text-[11px] text-neutral-500">
            {step + 1}/{ordered.length}
          </span>
        )}
      </div>

      <div className="p-5">
        {loading ? (
          <p className="text-sm text-neutral-500">Loading audit chain…</p>
        ) : !active ? (
          <p className="text-sm text-neutral-500">Select or verify a hand to replay it.</p>
        ) : ordered.length === 0 ? (
          <p className="text-sm text-neutral-500">No audit events for this hand.</p>
        ) : (
          <>
            {/* Scrubber */}
            <input
              type="range"
              min={0}
              max={max}
              value={step}
              onChange={(e) => setStep(Number(e.target.value))}
              className="w-full accent-[#81ecff]"
              aria-label="Replay position"
            />
            <div className="mt-2 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setStep((s) => Math.max(0, s - 1))}
                disabled={step === 0}
                className="rounded-lg border border-white/15 px-3 py-1 text-xs text-neutral-300 hover:bg-white/5 disabled:opacity-40"
              >
                ◀ Prev
              </button>
              <button
                type="button"
                onClick={() => setStep((s) => Math.min(max, s + 1))}
                disabled={step >= max}
                className="rounded-lg border border-white/15 px-3 py-1 text-xs text-neutral-300 hover:bg-white/5 disabled:opacity-40"
              >
                Next ▶
              </button>
            </div>

            {/* Event list */}
            <ol className="mt-4 max-h-72 space-y-1 overflow-y-auto pr-1">
              {ordered.map((ev, i) => {
                const r = readableEvent(ev);
                return (
                  <li
                    key={ev.id ?? i}
                    className={cn(
                      "flex items-start gap-2 rounded-lg px-2.5 py-1.5 text-xs transition-colors",
                      i === step
                        ? "bg-white/[0.06] text-white"
                        : i < step
                          ? "text-neutral-400"
                          : "text-neutral-600",
                    )}
                  >
                    <span className={cn("mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full", dotColor(r.kind))} />
                    <span className="min-w-0 flex-1">{r.text}</span>
                    {ev.payload_hash && (
                      <span
                        className="shrink-0 font-mono text-[9px] text-neutral-600"
                        title={ev.payload_hash}
                      >
                        {ev.payload_hash.slice(0, 6)}
                      </span>
                    )}
                  </li>
                );
              })}
            </ol>
            <p className="mt-3 text-[10px] text-neutral-600">
              Each row commits to the previous by hash — reordering or editing any event breaks the
              chain the verifier checks.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
