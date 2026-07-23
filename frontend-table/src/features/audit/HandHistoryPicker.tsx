"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { GLASS_PANEL, GLASS_PANEL_HOVER, HEADING_SM, STATUS_CHIP, cn } from "@/features/ui/tokens";
import type { HandIndexRow } from "@/features/provably/types";
import { DEMO_MATCH_ID } from "./auditDemo";
import { handHistory } from "./auditRpc";

interface Row {
  matchId: string;
  handNo: number;
  tableLabel: string;
  potCents: number;
  won: boolean;
  netCents: number;
  anchored: boolean;
  commit: string;
  createdAt: string;
}

function fromIndex(h: HandIndexRow): Row {
  return {
    matchId: h.match_id,
    handNo: h.hand_no,
    tableLabel: h.table_label || `Table ${h.hand_no}`,
    potCents: h.pot ?? 0,
    won: Boolean(h.won),
    netCents: h.net_cents ?? 0,
    anchored: Boolean(h.anchored),
    commit: h.deck_commit || "",
    createdAt: h.created_at || "",
  };
}

// Offline / guest fallback so the picker is never an empty shell. Every row is
// deep-linkable into the audit detail route (which itself demos when unauthed).
function demoRows(): Row[] {
  const labels = ["Diamond Vault 200/400", "High Rollers 5/10", "Diamond Cup #14", "Vault Sit & Go"];
  return Array.from({ length: 6 }, (_, i) => {
    const handNo = 9982 - i;
    return {
      matchId: DEMO_MATCH_ID,
      handNo,
      tableLabel: labels[i % labels.length],
      potCents: 124500 - i * 8100,
      won: i % 3 === 0,
      netCents: i % 3 === 0 ? 62400 - i * 3000 : -(4200 + i * 900),
      anchored: i > 1,
      commit: `0x${(handNo * 2654435761 >>> 0).toString(16).padStart(8, "0")}`,
      createdAt: `2023-11-24 02:1${(9 - i + 10) % 10}:0${i}`,
    };
  });
}

function fmt(cents: number): string {
  const v = Math.abs(cents) / 100;
  return `$${v.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

export function HandHistoryPicker() {
  const [rows, setRows] = useState<Row[]>([]);
  const [demo, setDemo] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await handHistory(30);
        const hands = res.hands ?? [];
        if (cancelled) return;
        if (hands.length === 0) {
          setRows(demoRows());
          setDemo(true);
        } else {
          setRows(hands.map(fromIndex));
          setDemo(false);
        }
      } catch {
        if (!cancelled) {
          setRows(demoRows());
          setDemo(true);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className={cn(HEADING_SM, "text-muted")}>Hand History</p>
          <h1 className="mt-2 font-display text-3xl font-bold uppercase tracking-wide">
            Your Recent Hands
          </h1>
          <p className="mt-1 text-sm text-neutral-400">
            Open any hand for its full cryptographic proof and deck reproduction.
          </p>
        </div>
        {demo && (
          <span className="rounded-full border border-gold/40 bg-gold/10 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-gold">
            Demo · offline
          </span>
        )}
      </div>

      {loading && rows.length === 0 ? (
        <div className="py-16 text-center text-sm text-neutral-500">Loading hand index…</div>
      ) : (
        <div className={cn(GLASS_PANEL, "overflow-hidden")}>
          {/* Header row (desktop) */}
          <div className="hidden grid-cols-[1.4fr_0.8fr_0.9fr_0.9fr_auto] gap-4 border-b border-white/[0.06] px-5 py-3 text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-500 md:grid">
            <span>Table · Hand</span>
            <span>Pot</span>
            <span>Result</span>
            <span>Anchor</span>
            <span className="text-right">Proof</span>
          </div>

          <ul className="divide-y divide-white/[0.04]">
            {rows.map((r) => {
              const href = `/provably-fair/hand/${encodeURIComponent(r.matchId)}/${r.handNo}`;
              return (
                <li
                  key={`${r.matchId}-${r.handNo}`}
                  className="grid grid-cols-2 gap-3 px-5 py-4 transition hover:bg-white/[0.02] md:grid-cols-[1.4fr_0.8fr_0.9fr_0.9fr_auto] md:items-center md:gap-4"
                >
                  <div className="min-w-0">
                    <div className="truncate font-display text-sm font-bold text-foreground">
                      {r.tableLabel}
                    </div>
                    <div className="mt-0.5 font-mono text-[11px] text-neutral-500">
                      Hand #{r.handNo} · {r.createdAt || "—"}
                    </div>
                  </div>

                  <div className="text-sm font-semibold text-gold md:text-base">{fmt(r.potCents)}</div>

                  <div>
                    <span
                      className={cn(
                        STATUS_CHIP,
                        r.won
                          ? "border border-green/30 bg-green/10 text-green"
                          : "border border-white/10 bg-white/[0.03] text-neutral-400",
                      )}
                    >
                      {r.won ? "Won " : "Lost "}
                      <span className="font-mono">
                        {r.netCents >= 0 ? "+" : "-"}
                        {fmt(r.netCents)}
                      </span>
                    </span>
                  </div>

                  <div>
                    <span
                      className={cn(
                        STATUS_CHIP,
                        r.anchored
                          ? "border border-brand/30 bg-brand/10 text-brand"
                          : "border border-white/10 bg-white/[0.03] text-neutral-500",
                      )}
                    >
                      {r.anchored ? "On-chain" : "Pending"}
                    </span>
                  </div>

                  <div className="col-span-2 md:col-span-1 md:text-right">
                    <Link
                      href={href}
                      className={cn(
                        GLASS_PANEL,
                        GLASS_PANEL_HOVER,
                        "inline-flex items-center gap-1.5 px-3.5 py-2 text-[11px] font-bold uppercase tracking-wider text-white",
                      )}
                    >
                      Verify hand →
                    </Link>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
