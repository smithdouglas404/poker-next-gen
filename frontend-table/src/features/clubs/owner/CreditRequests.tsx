"use client";

// Over-limit buy-in credit requests (#63) — owner review queue. Lists a club's
// pending requests and approves (which allocates the credit to the player's club
// balance) or denies, wired to credit_requests_pending / credit_request_review.

import { useCallback, useEffect, useState } from "react";

import { ownerApi } from "./ownerRpc";
import type { CreditRequest } from "./types";

const usd = (c: number) => `$${(c / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;

export function CreditRequests({ clubId, canManage }: { clubId?: string; canManage: boolean }) {
  const [rows, setRows] = useState<CreditRequest[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!clubId || !canManage) return;
    try {
      const r = await ownerApi.creditRequestsPending(clubId);
      setRows(r.requests ?? []);
    } catch {
      /* non-owner or offline */
    }
  }, [clubId, canManage]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const review = useCallback(
    async (id: string, approve: boolean) => {
      setBusy(id);
      setMsg(null);
      try {
        await ownerApi.creditRequestReview(id, approve);
        setMsg(approve ? "Credit approved and allocated." : "Request denied.");
        await reload();
      } catch (e) {
        setMsg(e instanceof Error ? e.message : "Action failed");
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
        <h3 className="font-display text-lg font-bold uppercase tracking-wide text-white">Credit Requests</h3>
        <span className="text-[11px] uppercase tracking-wider text-white/40">{rows.length} pending</span>
      </div>
      <p className="mt-1 text-xs text-white/50">
        Players requesting buy-in credit beyond their allocated balance. Approving allocates the amount
        to their club balance.
      </p>
      {msg && <p className="mt-2 text-xs text-gold">{msg}</p>}

      <div className="mt-4 space-y-2">
        {rows.length === 0 ? (
          <p className="rounded-xl border border-white/[0.06] bg-black/20 px-4 py-6 text-center text-sm text-white/40">
            No pending credit requests.
          </p>
        ) : (
          rows.map((r) => (
            <div
              key={r.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/[0.06] bg-black/25 px-4 py-3"
            >
              <div className="min-w-0">
                <p className="truncate font-semibold text-white">{r.username || r.user_id}</p>
                <p className="text-[11px] text-white/50">
                  {r.reason || "Credit request"} · {new Date(r.created_at).toLocaleDateString()}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-display text-lg font-bold text-gold">{usd(r.amount_minor)}</span>
                <button
                  type="button"
                  disabled={busy === r.id}
                  onClick={() => void review(r.id, true)}
                  className="rounded-lg bg-green/85 px-3 py-1.5 text-xs font-bold text-black hover:bg-green disabled:opacity-40"
                >
                  Approve
                </button>
                <button
                  type="button"
                  disabled={busy === r.id}
                  onClick={() => void review(r.id, false)}
                  className="rounded-lg border border-gold/40 px-3 py-1.5 text-xs font-semibold text-gold-lite hover:bg-gold/10 disabled:opacity-40"
                >
                  Deny
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
