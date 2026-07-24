"use client";

import { useEffect, useState } from "react";

import { callSessionRpc } from "@/lib/nakama/sessionRpc";
import { GLASS_PANEL, cn } from "@/features/ui/tokens";

import { compact, relTime, usdCompact } from "./ownerRpc";
import type { QuickStats as QuickStatsData } from "./types";

interface HighlightRow {
  icon: string;
  label: string;
  value: string;
  note: string;
}

/** Right-rail "Quick Stats" panel from the owner master: most-active table, top
 * tournament, and the club rollup metrics. Metrics come from club_quick_stats;
 * the two highlight rows are derived live from table_list / tournament_list. */
export function QuickStats({ data }: { data: QuickStatsData }) {
  const s = data.stats;
  const winPct = s ? (s.win_rate_bps / 100).toFixed(1) : "—";

  const [rows, setRows] = useState<HighlightRow[]>([
    { icon: "▤", label: "Most Active Table", value: "No live tables", note: "—" },
    { icon: "♛", label: "Top Tournament", value: "None scheduled", note: "—" },
  ]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const next: HighlightRow[] = [
        { icon: "▤", label: "Most Active Table", value: "No live tables", note: "—" },
        { icon: "♛", label: "Top Tournament", value: "None scheduled", note: "—" },
      ];
      try {
        const t = (await callSessionRpc("table_list", {})) as { matches?: Array<{ label?: string }> };
        let best: { room: string; sb: number; bb: number; seated: number } | null = null;
        for (const m of t.matches ?? []) {
          let l: { room_id?: string; sb?: number; bb?: number; seated?: number } = {};
          try { l = JSON.parse(m.label ?? "{}"); } catch { /* skip */ }
          if (!best || (l.seated ?? 0) > best.seated) best = { room: l.room_id || "Table", sb: l.sb ?? 0, bb: l.bb ?? 0, seated: l.seated ?? 0 };
        }
        if (best && best.seated >= 0 && (t.matches?.length ?? 0) > 0) {
          next[0] = { icon: "▤", label: "Most Active Table", value: best.room, note: `$${best.sb / 100} / $${best.bb / 100} · ${best.seated} seated` };
        }
      } catch { /* offline */ }
      try {
        const tr = (await callSessionRpc("tournament_list", {})) as { tournaments?: Array<{ name: string; buy_in_minor?: number; status: string }> };
        const top = (tr.tournaments ?? []).filter((x) => x.status !== "finished").sort((a, b) => (b.buy_in_minor ?? 0) - (a.buy_in_minor ?? 0))[0];
        if (top) next[1] = { icon: "♛", label: "Top Tournament", value: top.name, note: usdCompact(top.buy_in_minor ?? 0) + " buy-in" };
      } catch { /* offline */ }
      if (!cancelled) setRows(next);
    })();
    return () => { cancelled = true; };
  }, []);

  const metrics = [
    { label: "Hands played", value: compact(s?.hands ?? 0) },
    { label: "Active (7d)", value: compact(s?.active_7d ?? 0) },
    { label: "Win rate", value: `${winPct}%` },
    { label: "Tourney wins", value: `${s?.tourney_wins ?? 0}` },
    { label: "Chips won", value: usdCompact(s?.chips_won ?? 0) },
    { label: "Members", value: compact(data.member_count) },
  ];

  return (
    <div className="space-y-4">
      <div className={cn(GLASS_PANEL, "p-5")}>
        <p className="font-display text-[11px] font-bold uppercase tracking-[0.25em] text-gold/80">
          Quick Stats
        </p>
        <div className="mt-4 space-y-4">
          {rows.map((r) => (
            <div key={r.label} className="flex gap-3">
              <span
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-lg text-gold"
                style={{ background: "rgba(212,175,55,0.1)" }}
              >
                {r.icon}
              </span>
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/40">
                  {r.label}
                </p>
                <p className="truncate text-sm font-semibold text-white">{r.value}</p>
                <p className="text-[11px] text-green">{r.note}</p>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2 border-t border-white/[0.06] pt-4">
          {metrics.map((m) => (
            <div key={m.label} className="rounded-lg bg-white/[0.02] px-3 py-2">
              <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-white/40">
                {m.label}
              </p>
              <p className="font-display text-base font-bold text-white">{m.value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Recent activity feed */}
      <div className={cn(GLASS_PANEL, "p-5")}>
        <p className="font-display text-[11px] font-bold uppercase tracking-[0.25em] text-gold/80">
          Recent Activity
        </p>
        <div className="mt-3 space-y-3">
          {data.activity.length === 0 ? (
            <p className="text-sm text-white/40">No recent activity.</p>
          ) : (
            data.activity.slice(0, 6).map((a) => (
              <div key={a.id} className="flex gap-2.5">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand" />
                <div className="min-w-0">
                  <p className="text-[13px] leading-snug text-white/80">{a.detail}</p>
                  <p className="text-[10px] text-white/35">{relTime(a.created_at)}</p>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
