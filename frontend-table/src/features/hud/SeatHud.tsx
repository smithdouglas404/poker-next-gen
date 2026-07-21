"use client";

import { useEffect, useState } from "react";

import { DEFAULT_MAX_SEATS, MAX_SEATS, MIN_SEATS, type SeatView } from "@/features/game/protocol";
import { formatCents, useGame } from "@/features/game/GameProvider";
import { computeTableLayout } from "@/features/table/tableLayout";
import { getSeatPositions } from "@/features/table/seatLayout";
import { avatarDef, avatarForKey } from "@/features/table/avatars";
import { ChipStack } from "@/features/hud/ChipStack";
import { Character3D } from "@/features/table/Character3D";
import { Character3DGL } from "@/features/table/Character3DGL";
import { useRenderMode } from "@/features/table/renderMode";

function SeatCard({
  seat,
  buyInLabel,
  onSit,
  active,
  winner,
  mode,
}: {
  seat: SeatView;
  buyInLabel: string;
  onSit: () => void;
  active?: boolean;
  winner?: boolean;
  mode: "2d" | "3d";
}) {
  const empty = seat.status === "empty" || !seat.user_id;

  if (empty) {
    return (
      <button
        type="button"
        onClick={onSit}
        className="group flex w-32 flex-col items-center gap-1.5 rounded-2xl border border-dashed border-amber-400/40 bg-white/[0.03] px-3 py-3 text-amber-200/80 backdrop-blur-xl transition-all duration-300 hover:border-amber-300/70 hover:bg-amber-400/[0.06] hover:shadow-[0_0_22px_rgba(212,175,55,0.25)]"
      >
        <span className="text-2xl leading-none text-amber-300/90 transition group-hover:scale-110">+</span>
        <span className="text-xs font-bold uppercase tracking-wider">Sit Here</span>
        <span className="text-[10px] text-neutral-500">Seat {seat.index + 1}</span>
        <span className="text-[10px] font-semibold text-amber-300/80">{buyInLabel}</span>
      </button>
    );
  }

  const identity = seat.user_id || `seat-${seat.index}`;
  const def = avatarDef(avatarForKey(identity));
  const accent = seat.is_hero ? "#fbbf24" : def.border;
  const glow = seat.is_hero ? "rgba(251,191,36,0.35)" : def.glow;
  const folded = (seat.last_action ?? "").toLowerCase() === "fold";

  return (
    <div
      className="flex w-36 flex-col items-center rounded-2xl border border-white/[0.08] bg-white/[0.03] px-3 py-3 backdrop-blur-xl"
      style={{ boxShadow: `0 0 0 1px ${accent}55, 0 8px 26px ${glow}` }}
    >
      {mode === "3d" ? (
        <Character3DGL
          identity={identity}
          name={seat.username}
          hero={!!seat.is_hero}
          active={active}
          winner={winner}
          folded={folded}
          modelUrl={seat.model_url}
        />
      ) : (
        <Character3D
          identity={identity}
          name={seat.username}
          hero={!!seat.is_hero}
          active={active}
          winner={winner}
          folded={folded}
        />
      )}
      <p
        className="mt-2 max-w-full truncate text-sm font-bold tracking-wide"
        style={{ color: seat.is_hero ? "#fde68a" : "#ffffff" }}
      >
        {seat.username}
      </p>
      <p className="text-xs font-semibold text-emerald-300">{formatCents(seat.stack)}</p>
      {!folded && <ChipStack cents={seat.stack} />}
      {seat.last_action && (
        <span
          className="mt-1 rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest"
          style={{ color: accent, borderColor: `${accent}66`, backgroundColor: `${accent}12` }}
        >
          {seat.last_action}
        </span>
      )}
    </div>
  );
}

/**
 * Seat overlay anchored to the *table*, not the HUD box.
 *
 * The previous version positioned seats inside a flex box (offset + smaller than
 * the screen) using a hardcoded near-circular ellipse — so they never lined up
 * with the flat felt and drifted on resize. Now seats use the SAME geometry the
 * Pixi renderer uses (`computeTableLayout` + `getSeatPositions`) measured against
 * the full viewport the canvas fills. They sit on the felt ring for any seat
 * count (2–9) and rescale correctly on resize — no hardcoded per-count layouts.
 */
export function SeatHud() {
  const { snapshot, sitDown, profile, buyInCents, maxSeats, showdown } = useGame();
  const buyInLabel = formatCents(buyInCents);

  const [mode, setMode] = useRenderMode();
  const activeSeat = snapshot?.action_seat;
  const winnerSeats = new Set((showdown?.winners ?? []).map((w) => w.seat));

  const [viewport, setViewport] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const update = () => setViewport({ w: window.innerWidth, h: window.innerHeight });
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  // Authoritative seat count from the table snapshot when seated/created;
  // otherwise the count the hero picked in the create form (live preview).
  const seatCount = Math.min(
    MAX_SEATS,
    Math.max(MIN_SEATS, snapshot?.max_seats ?? snapshot?.seats.length ?? maxSeats ?? DEFAULT_MAX_SEATS),
  );

  const seats: SeatView[] =
    snapshot?.seats ??
    Array.from({ length: seatCount }, (_, index) => ({ index, stack: 0, status: "empty" }));

  const heroSeat = seats.find((s) => s.user_id === profile.userId)?.index;

  // orbitScale 1.04 pushes plaques just onto the rail so they read as "on the
  // table" without crowding the community cards.
  const positions =
    viewport.w > 0
      ? getSeatPositions(computeTableLayout(viewport.w, viewport.h), seatCount, 1.04)
      : [];

  return (
    <div className="pointer-events-none fixed inset-0 z-10">
      <div className="pointer-events-auto absolute right-4 top-20 z-20 flex overflow-hidden rounded-full border border-white/15 bg-black/60 text-[11px] font-bold backdrop-blur-md">
        <button
          type="button"
          onClick={() => setMode("2d")}
          className={`px-3 py-1 ${mode === "2d" ? "bg-amber-500 text-black" : "text-neutral-300"}`}
        >
          2.5D
        </button>
        <button
          type="button"
          onClick={() => setMode("3d")}
          className={`px-3 py-1 ${mode === "3d" ? "bg-amber-500 text-black" : "text-neutral-300"}`}
        >
          3D
        </button>
      </div>
      {positions.length > 0 &&
        seats.slice(0, seatCount).map((seat) => {
          const pos = positions[seat.index] ?? positions[seat.index % positions.length];
          if (!pos) return null;
          return (
            <div
              key={seat.index}
              className="pointer-events-auto absolute"
              style={{ left: pos.x, top: pos.y, transform: "translate(-50%, -50%)" }}
            >
              <SeatCard
                seat={{ ...seat, is_hero: seat.index === heroSeat }}
                buyInLabel={buyInLabel}
                onSit={() => void sitDown(seat.index, buyInCents)}
                active={activeSeat === seat.index && seat.status !== "empty"}
                winner={winnerSeats.has(seat.index)}
                mode={mode}
              />
            </div>
          );
        })}
    </div>
  );
}
