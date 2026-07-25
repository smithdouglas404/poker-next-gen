"use client";

// Guest table reconciliation (P7) — owner review queue. Lists a club's OPEN guest
// sessions (a guest with no registered account who sat at a private/coded table)
// with each guest's live ledger net, and lets the operator reconcile (settle +
// close) each one. Wired to guest_sessions_pending / guest_session_reconcile.

import { useCallback, useEffect, useState } from "react";

import { ownerApi } from "./ownerRpc";
import type { GuestSession } from "./types";

const usd = (c: number) => `$${(c / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
const signed = (c: number) => `${c >= 0 ? "+" : "−"}${usd(Math.abs(c))}`;

export function GuestSessions({ clubId, canManage }: { clubId?: string; canManage: boolean }) {
  const [rows, setRows] = useState<GuestSession[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!clubId || !canManage) return;
    try {
      const r = await ownerApi.guestSessionsPending(clubId);
      setRows(r.sessions ?? []);
    } catch {
      /* non-owner or offline */
    }
  }, [clubId, canManage]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const reconcile = useCallback(
    async (id: string) => {
      setBusy(id);
      setMsg(null);
      try {
        const r = await ownerApi.guestSessionReconcile(id);
        setMsg(`Reconciled — net ${signed(r.net_minor)}.`);
        await reload();
      } catch (e) {
        setMsg(e instanceof Error ? e.message : "Reconcile failed");
      } finally {
        setBusy(null);
      }
    },
    [reload],
  );

  if (!canManage) return null;

  return (
    <section className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-5">
      <div className="flex items-center justify-between">
        <h3 className="font-display text-lg font-bold uppercase tracking-wide text-white">Guest Reconciliation</h3>
        <span className="text-[11px] uppercase tracking-wider text-white/40">{rows.length} open</span>
      </div>
      <p className="mt-1 text-xs text-white/50">
        Guests (no registered account) who sat at your private/coded tables, tracked under your table
        limit until you settle. Net comes from the auditable ledger; reconciling closes the record.
      </p>
      {msg && <p className="mt-2 text-xs text-gold">{msg}</p>}

      <div className="mt-4 space-y-2">
        {rows.length === 0 ? (
          <p className="rounded-xl border border-white/[0.06] bg-black/20 px-4 py-6 text-center text-sm text-white/40">
            No open guest sessions.
          </p>
        ) : (
          rows.map((g) => {
            const net = g.ledger_net_minor ?? 0;
            return (
              <div
                key={g.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/[0.06] bg-black/25 px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate font-semibold text-white">{g.username || g.user_id}</p>
                  <p className="text-[11px] text-white/50">
                    Bought in {usd(g.buy_in_minor)}
                    {g.limit_minor > 0 ? ` · limit ${usd(g.limit_minor)}` : ""} ·{" "}
                    {new Date(g.created_at).toLocaleDateString()}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span
                    className={`font-display text-lg font-bold ${net >= 0 ? "text-green" : "text-brand"}`}
                    title="Live ledger net"
                  >
                    {signed(net)}
                  </span>
                  <button
                    type="button"
                    disabled={busy === g.id}
                    onClick={() => void reconcile(g.id)}
                    className="rounded-lg bg-gold/90 px-3 py-1.5 text-xs font-bold text-black hover:bg-gold disabled:opacity-40"
                  >
                    {busy === g.id ? "…" : "Reconcile"}
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}
