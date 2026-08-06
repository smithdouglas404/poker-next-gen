"use client";

// Coded-guest sit-down approvals — the operator's side of the gate.
//
// A visitor holding a table code but no registered account can watch the table
// immediately; taking a seat waits on someone here. Without this panel the
// backend gate would simply strand them, so this is not optional polish — it is
// the other half of the feature.
//
// Distinct from GuestSessions.tsx next door, which settles guests who ALREADY
// sat. This queue is the gate in front of that one.
//
// Wired to guest_approvals_pending / guest_approval_decide.

import { useCallback, useEffect, useState } from "react";

import { ownerApi, relTime } from "./ownerRpc";
import type { GuestApproval } from "./types";

export function GuestApprovals({ clubId, canManage }: { clubId?: string; canManage: boolean }) {
  const [rows, setRows] = useState<GuestApproval[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!clubId || !canManage) return;
    try {
      const r = await ownerApi.guestApprovalsPending(clubId);
      setRows(r.pending ?? []);
    } catch {
      /* non-owner or offline */
    }
  }, [clubId, canManage]);

  useEffect(() => {
    void reload();
    // Someone is sitting at a table waiting on this. Poll so an operator with
    // the hub already open doesn't leave them staring at a spinner.
    const t = setInterval(() => void reload(), 15_000);
    return () => clearInterval(t);
  }, [reload]);

  const decide = useCallback(
    async (row: GuestApproval, approve: boolean) => {
      if (!clubId) return;
      setBusy(row.id);
      setMsg(null);
      try {
        await ownerApi.guestApprovalDecide(clubId, row.match_id, row.user_id, approve);
        setMsg(`${row.username || "Guest"} ${approve ? "approved" : "denied"}.`);
        await reload();
      } catch (e) {
        // Most likely another operator decided it first — the backend reports
        // that as a conflict rather than silently overwriting.
        setMsg(e instanceof Error ? e.message : "Could not record that decision.");
        await reload();
      } finally {
        setBusy(null);
      }
    },
    [clubId, reload],
  );

  if (!canManage) return null;

  return (
    <div className="rounded-2xl border border-white/10 bg-surface p-5">
      <div className="flex items-baseline justify-between">
        <h3 className="font-display text-lg font-bold uppercase tracking-wider">Guest approvals</h3>
        <span className="text-[11px] uppercase tracking-[0.2em] text-muted">
          {rows.length} waiting
        </span>
      </div>
      <p className="mt-1 text-sm text-muted">
        Visitors who joined with a table code but have no account. They can watch now; approving
        lets them take a seat and hold chips.
      </p>

      {msg && <p className="mt-3 text-sm text-gold">{msg}</p>}

      {rows.length === 0 ? (
        <p className="mt-4 text-sm text-muted">Nobody is waiting.</p>
      ) : (
        <ul className="mt-4 flex flex-col gap-2">
          {rows.map((r) => (
            <li
              key={r.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-surface-2 p-3"
            >
              <div className="min-w-0">
                <p className="truncate font-semibold text-foreground">
                  {r.username || "Unnamed guest"}
                  {r.email && <span className="ml-2 text-sm font-normal text-muted">{r.email}</span>}
                </p>
                <p className="mt-0.5 text-[11px] uppercase tracking-[0.15em] text-muted">
                  code {r.join_code || "—"} · asked {relTime(r.created_at)}
                </p>
                {/* The signal actually worth reading before approving. */}
                {r.same_device_seated > 0 && (
                  <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.15em] text-gold-lite">
                    ⚠ same device as {r.same_device_seated} other guest
                    {r.same_device_seated === 1 ? "" : "s"} at this club
                  </p>
                )}
              </div>
              <div className="flex shrink-0 gap-2">
                <button
                  type="button"
                  disabled={busy === r.id}
                  onClick={() => void decide(r, false)}
                  className="rounded-lg border border-white/15 px-3 py-1.5 text-sm font-semibold text-muted transition hover:border-gold/50 hover:text-foreground disabled:opacity-50"
                >
                  Deny
                </button>
                <button
                  type="button"
                  disabled={busy === r.id}
                  onClick={() => void decide(r, true)}
                  className="rounded-lg bg-green px-3 py-1.5 text-sm font-bold text-black transition hover:brightness-110 disabled:opacity-50"
                >
                  Approve
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
