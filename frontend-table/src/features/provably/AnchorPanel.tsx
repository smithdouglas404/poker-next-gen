"use client";

import { useCallback, useEffect, useState } from "react";

import { Button } from "@/features/ui";
import { GLASS_PANEL, HEADING_SM, cn } from "@/features/ui/tokens";

import { anchorRun, anchorStatus } from "./provablyRpc";
import type { AnchorStatusResult } from "./types";

/** On-chain anchor status (anchor_status) plus an on-demand anchor trigger
 *  (anchor_run — admin-gated server-side; non-admins get a graceful notice). */
export function AnchorPanel() {
  const [status, setStatus] = useState<AnchorStatusResult | null>(null);
  const [running, setRunning] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [msgKind, setMsgKind] = useState<"ok" | "err">("ok");

  const load = useCallback(async () => {
    try {
      setStatus(await anchorStatus());
    } catch {
      /* keep prior status; status is best-effort */
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const runAnchor = useCallback(async () => {
    setRunning(true);
    setMsg(null);
    try {
      const res = await anchorRun();
      if (res.configured === false) {
        setMsgKind("ok");
        setMsg(res.message ?? "On-chain anchoring isn't configured on this deployment.");
      } else if ((res.anchored ?? 0) > 0) {
        setMsgKind("ok");
        setMsg(`Anchored ${res.anchored} events · tx ${res.tx_hash?.slice(0, 12)}…`);
      } else {
        setMsgKind("ok");
        setMsg(res.message ?? "Nothing new to anchor.");
      }
      await load();
    } catch (e) {
      setMsgKind("err");
      const raw = e instanceof Error ? e.message : "Anchor run failed";
      setMsg(/forbidden/i.test(raw) ? "Anchoring runs are operator-only — status is public above." : raw);
    } finally {
      setRunning(false);
    }
  }, [load]);

  const latest = status?.latest ?? null;

  return (
    <div className={cn(GLASS_PANEL, "overflow-hidden")}>
      <div className="flex items-center justify-between gap-3 border-b border-white/[0.06] bg-white/[0.02] px-5 py-4">
        <div>
          <p className={cn(HEADING_SM, "text-gold/80")}>On-chain Anchor</p>
          <p className="mt-0.5 text-sm text-neutral-400">
            A Merkle root of the audit chain is committed to Polygon in batches.
          </p>
        </div>
        <span
          className={cn(
            "rounded-full border px-3 py-1 text-[10px] font-bold uppercase tracking-[0.2em]",
            status?.configured
              ? "border-emerald-400/40 bg-emerald-500/10 text-emerald-300"
              : "border-white/15 text-neutral-400",
          )}
        >
          {status?.configured ? "Configured" : "Not enabled"}
        </span>
      </div>

      <div className="space-y-4 p-5">
        {latest ? (
          <div className="grid grid-cols-1 gap-3 rounded-xl border border-white/[0.07] bg-black/30 p-3 sm:grid-cols-3">
            <div>
              <p className="text-[10px] uppercase tracking-[0.2em] text-neutral-500">Events</p>
              <p className="mt-0.5 font-display text-lg text-white">{latest.event_count}</p>
            </div>
            <div className="min-w-0 sm:col-span-2">
              <p className="text-[10px] uppercase tracking-[0.2em] text-neutral-500">Merkle root</p>
              <p className="mt-0.5 break-all font-mono text-[11px] text-gold" title={latest.merkle_root}>
                {latest.merkle_root}
              </p>
            </div>
            <div className="min-w-0 sm:col-span-3">
              <p className="text-[10px] uppercase tracking-[0.2em] text-neutral-500">Anchor tx</p>
              <p className="mt-0.5 break-all font-mono text-[11px] text-cyan" title={latest.tx_hash}>
                {latest.tx_hash || "—"}
              </p>
            </div>
          </div>
        ) : (
          <p className="rounded-xl border border-white/[0.07] bg-black/30 p-3 text-sm text-neutral-500">
            {status?.configured
              ? "Anchoring is configured — awaiting the first batch."
              : "On-chain anchoring is not enabled here. The commit / reveal / audit-chain guarantees are always active."}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <Button variant="outline" size="sm" onClick={() => void load()}>
            Refresh status
          </Button>
          <Button
            variant="gold"
            size="sm"
            onClick={runAnchor}
            disabled={running}
            title="Batch and anchor pending audit events (operator only)"
          >
            {running ? "Anchoring…" : "Anchor pending batch"}
          </Button>
          {msg && (
            <span className={cn("text-xs", msgKind === "ok" ? "text-neutral-400" : "text-red-300")}>{msg}</span>
          )}
        </div>
      </div>
    </div>
  );
}
