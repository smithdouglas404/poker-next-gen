"use client";

import type { TableListItem } from "@/features/game/protocol";

/** OddSlingers-inspired lobby table thumbnail (see core/js/pages/tables.js). */
export function TableCard({
  table,
  buyInLabel,
  onJoin,
  busy,
}: {
  table: TableListItem;
  buyInLabel: string;
  onJoin: () => void;
  busy: boolean;
}) {
  const seated = table.seated ?? 0;
  const open = table.open_seats ?? 6 - seated;

  return (
    <article className="flex flex-col rounded-2xl border border-white/[0.06] bg-surface p-5 shadow-[0_2px_12px_rgba(0,0,0,0.4)] transition hover:border-white/[0.12] hover:bg-white/[0.02]">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-lg font-semibold text-white">
            {table.room_id ?? table.label ?? "Hold'em 6-Max"}
          </h3>
          <p className="mt-1 text-xs text-neutral-500">$1 / $2 blinds · buy-in {buyInLabel}</p>
        </div>
        <span className="rounded-full bg-green/15 px-2 py-0.5 text-[10px] font-semibold uppercase text-green">
          Live
        </span>
      </div>

      <div className="mt-6 flex flex-1 flex-col items-center justify-center rounded-xl bg-white/[0.02] py-8">
        <div className="flex -space-x-2">
          {Array.from({ length: Math.min(seated, 6) }).map((_, i) => (
            <div
              key={i}
              className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-neutral-900 bg-gradient-to-br from-slate-500 to-slate-700 text-xs font-bold text-white"
            />
          ))}
          {seated === 0 && <p className="text-sm text-neutral-500">Empty table</p>}
        </div>
        <p className="mt-3 text-sm text-neutral-300">
          {seated}/6 seated · {open} open
        </p>
      </div>

      <button
        type="button"
        disabled={busy || open <= 0}
        onClick={onJoin}
        className="mt-4 w-full rounded-xl bg-brand py-2.5 text-sm font-semibold uppercase tracking-wider text-white hover:bg-[#ff2d3f] disabled:opacity-40"
      >
        {open > 0 ? "Join Table" : "Full"}
      </button>
      <p className="mt-2 truncate font-mono text-[9px] text-neutral-600">{table.match_id}</p>
    </article>
  );
}
