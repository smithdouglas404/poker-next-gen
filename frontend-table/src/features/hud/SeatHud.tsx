"use client";

import { useEffect, useState } from "react";

import { DEFAULT_MAX_SEATS, MAX_SEATS, MIN_SEATS, type SeatView } from "@/features/game/protocol";
import { formatCents, useGame } from "@/features/game/GameProvider";
import { computeTableLayout } from "@/features/table/tableLayout";
import { getSeatPositions } from "@/features/table/seatLayout";
import { avatarDef, avatarForKey, avatarGradient, avatarSrc } from "@/features/table/avatars";

/** A glowing character portrait for a seated player (falls back to a monogram). */
function AvatarPortrait({ name, identity, hero }: { name?: string; identity: string; hero: boolean }) {
  const [failed, setFailed] = useState(false);
  const monogram = (name?.slice(0, 2).toUpperCase() ?? "??");
  const def = avatarDef(avatarForKey(identity));
  // The hero is always framed in gold; everyone else wears their character's neon color.
  const ring = hero ? "#fbbf24" : def.border;
  const glow = hero ? "rgba(251,191,36,0.7)" : def.glow;
  return (
    <div className="relative h-14 w-14">
      {/* neon glow ring, tinted to the character */}
      <div
        className="absolute -inset-1 rounded-full blur-[7px]"
        style={{ backgroundColor: glow }}
      />
      <div
        className="relative h-14 w-14 overflow-hidden rounded-full"
        style={{ boxShadow: `0 0 0 2px ${ring}, 0 0 12px ${glow}` }}
      >
        {failed ? (
          <div
            className="flex h-full w-full items-center justify-center text-sm font-bold text-white"
            style={{ background: avatarGradient(identity) }}
          >
            {monogram}
          </div>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={avatarSrc(def.id)}
            alt={name ?? "player"}
            onError={() => setFailed(true)}
            className="h-full w-full object-cover"
          />
        )}
      </div>
    </div>
  );
}

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
        className="flex w-32 flex-col items-center gap-1.5 rounded-2xl border-2 border-dashed border-emerald-500/50 bg-black/50 px-3 py-3 text-emerald-300 transition hover:border-emerald-400 hover:bg-emerald-950/40"
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
      className={`flex w-36 flex-col items-center rounded-2xl border px-3 py-3 backdrop-blur-md ${
        seat.is_hero ? "border-amber-400/70 bg-amber-950/40" : "border-white/15 bg-black/55"
      }`}
    >
      <AvatarPortrait
        name={seat.username}
        identity={seat.user_id || `seat-${seat.index}`}
        hero={!!seat.is_hero}
      />
      <p className="mt-2 truncate text-sm font-semibold text-white">{seat.username}</p>
      <p className="text-xs font-medium text-emerald-300">{formatCents(seat.stack)}</p>
      {seat.last_action && (
        <p className="mt-1 text-[10px] uppercase tracking-wider text-amber-200/70">{seat.last_action}</p>
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
  const { snapshot, sitDown, profile, buyInCents, maxSeats } = useGame();
  const buyInLabel = formatCents(buyInCents);

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
              />
            </div>
          );
        })}
    </div>
  );
}
