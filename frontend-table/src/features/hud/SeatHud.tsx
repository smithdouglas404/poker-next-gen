"use client";

import { formatCents, useGame } from "@/features/game/GameProvider";
import type { SeatView } from "@/features/game/protocol";

/** Seat positions as % of viewport — clockwise from bottom (seat 0). */
const SEAT_POSITIONS = [
  { left: "50%", top: "88%", transform: "translate(-50%, -50%)" },
  { left: "14%", top: "72%", transform: "translate(-50%, -50%)" },
  { left: "10%", top: "38%", transform: "translate(-50%, -50%)" },
  { left: "50%", top: "12%", transform: "translate(-50%, -50%)" },
  { left: "90%", top: "38%", transform: "translate(-50%, -50%)" },
  { left: "86%", top: "72%", transform: "translate(-50%, -50%)" },
];

function SeatCard({
  seat,
  buyInLabel,
  onSit,
}: {
  seat: SeatView;
  buyInLabel: string;
  onSit: () => void;
}) {
  const empty = seat.status === "empty" || !seat.user_id;

  if (empty) {
    return (
      <button
        type="button"
        onClick={onSit}
        className="flex w-36 flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-emerald-500/50 bg-black/50 px-3 py-4 text-emerald-300 transition hover:border-emerald-400 hover:bg-emerald-950/40"
      >
        <span className="text-2xl leading-none">+</span>
        <span className="text-xs font-bold uppercase tracking-wider">Sit Here</span>
        <span className="text-[10px] text-neutral-500">Seat {seat.index + 1}</span>
        <span className="text-[10px] font-medium text-emerald-400/80">{buyInLabel}</span>
      </button>
    );
  }

  return (
    <div
      className={`flex w-40 flex-col items-center rounded-2xl border px-3 py-3 backdrop-blur-md ${
        seat.is_hero
          ? "border-amber-400/70 bg-amber-950/40"
          : "border-white/15 bg-black/55"
      }`}
    >
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-slate-600 to-slate-800 text-sm font-bold text-white ring-2 ring-amber-500/40">
        {seat.username?.slice(0, 2).toUpperCase() ?? "??"}
      </div>
      <p className="mt-2 truncate text-sm font-semibold text-white">{seat.username}</p>
      <p className="text-xs font-medium text-emerald-300">{formatCents(seat.stack)}</p>
      {seat.last_action && (
        <p className="mt-1 text-[10px] uppercase tracking-wider text-amber-200/70">{seat.last_action}</p>
      )}
    </div>
  );
}

export function SeatHud() {
  const { snapshot, sitDown, profile, buyInCents } = useGame();
  const buyInLabel = formatCents(buyInCents);
  const seats: SeatView[] =
    snapshot?.seats ??
    Array.from({ length: 6 }, (_, index) => ({ index, stack: 0, status: "empty" }));

  const heroSeat = seats.find((s) => s.user_id === profile.userId)?.index;

  return (
    <div className="pointer-events-none absolute inset-0">
      {seats.map((seat, i) => (
        <div
          key={seat.index}
          className="pointer-events-auto absolute"
          style={{
            left: SEAT_POSITIONS[i].left,
            top: SEAT_POSITIONS[i].top,
            transform: SEAT_POSITIONS[i].transform,
          }}
        >
          <SeatCard
            seat={{
              ...seat,
              is_hero: seat.index === heroSeat,
            }}
            buyInLabel={buyInLabel}
            onSit={() => void sitDown(seat.index, buyInCents)}
          />
        </div>
      ))}
    </div>
  );
}
