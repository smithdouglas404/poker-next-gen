"use client";

// Seat sessions (Tier-1 C) — owner visibility into hit-and-run / ratholing. Lists
// recent sittings at the club's tables with buy-in, hands played, duration, net,
// and advisory flags. Read-only: nothing here blocks play — it surfaces behaviour
// for the operator to act on out-of-band. Wired to seat_sessions_list.

import { useCallback, useEffect, useState } from "react";

import { ownerApi } from "./ownerRpc";
import type { SeatSession } from "./types";

const usd = (c: number) => `$${(c / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
const signed = (c: number) => `${c >= 0 ? "+" : "−"}${usd(Math.abs(c))}`;

function duration(sat: string, left?: string | null): string {
  const start = new Date(sat).getTime();
  const end = left ? new Date(left).getTime() : Date.now();
  const mins = Math.max(0, Math.round((end - start) / 60000));
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

export function SeatSessions({ clubId, canManage }: { clubId?: string; canManage: boolean }) {
  const [rows, setRows] = useState<SeatSession[]>([]);

  const reload = useCallback(async () => {
    if (!clubId || !canManage) return;
    try {
      const r = await ownerApi.seatSessionsList(clubId);
      setRows(r.sessions ?? []);
    } catch {
      /* non-owner or offline */
    }
  }, [clubId, canManage]);

  useEffect(() => {
    void reload();
  }, [reload]);

  if (!canManage) return null;

  const flagged = rows.filter((r) => r.hit_and_run || r.ratholed).length;

  return (
    <section className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-5">
      <div className="flex items-center justify-between">
        <h3 className="font-display text-lg font-bold uppercase tracking-wide text-white">Seat Sessions</h3>
        <span className="text-[11px] uppercase tracking-wider text-white/40">
          {rows.length} recent{flagged > 0 ? ` · ${flagged} flagged` : ""}
        </span>
      </div>
      <p className="mt-1 text-xs text-white/50">
        Every sitting at your tables — buy-in, hands, duration and net. Advisory{" "}
        <span className="text-gold">hit-and-run</span> (won and left after very few hands) and{" "}
        <span className="text-gold">rathole</span> (left bigger, re-bought short) flags are surfaced,
        never auto-enforced.
      </p>

      <div className="mt-4 space-y-2">
        {rows.length === 0 ? (
          <p className="rounded-xl border border-white/[0.06] bg-black/20 px-4 py-6 text-center text-sm text-white/40">
            No seat sessions recorded yet.
          </p>
        ) : (
          rows.map((r) => (
            <div
              key={r.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/[0.06] bg-black/25 px-4 py-3"
            >
              <div className="min-w-0">
                <p className="flex items-center gap-2 truncate font-semibold text-white">
                  {r.username || r.user_id}
                  {r.status === "open" && (
                    <span className="rounded-full bg-green/15 px-2 py-0.5 text-[9px] uppercase tracking-wider text-green">
                      seated
                    </span>
                  )}
                  {r.hit_and_run && (
                    <span className="rounded-full bg-brand/15 px-2 py-0.5 text-[9px] uppercase tracking-wider text-brand">
                      hit &amp; run
                    </span>
                  )}
                  {r.ratholed && (
                    <span className="rounded-full bg-gold/15 px-2 py-0.5 text-[9px] uppercase tracking-wider text-gold">
                      rathole
                    </span>
                  )}
                </p>
                <p className="text-[11px] text-white/50">
                  In {usd(r.buy_in_minor)} · {r.hands_played} hand{r.hands_played === 1 ? "" : "s"} ·{" "}
                  {duration(r.sat_at, r.left_at)} · {new Date(r.sat_at).toLocaleDateString()}
                </p>
              </div>
              <div className="text-right">
                <span
                  className={`font-display text-lg font-bold ${r.net_minor >= 0 ? "text-green" : "text-brand"}`}
                  title="Net this sitting (stack on leave − buy-in)"
                >
                  {r.status === "open" ? "—" : signed(r.net_minor)}
                </span>
                {r.status === "closed" && (
                  <p className="text-[10px] text-white/40">left {usd(r.stack_at_leave_minor)}</p>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
