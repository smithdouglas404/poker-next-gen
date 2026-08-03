"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

import { DEFAULT_MAX_SEATS, MAX_SEATS, MIN_SEATS, type SeatView } from "@/features/game/protocol";
import { formatCents, useGame } from "@/features/game/GameProvider";
import { computeTableLayout } from "@/features/table/tableLayout";
import { getSeatPositions } from "@/features/table/seatLayout";
import { layoutFromFeltRect, seatPointFromFelt, FELT_SURFACE_ATTR } from "@/features/hud/feltLayout";
import { avatarDef, avatarForKey } from "@/features/table/avatars";
import { ChipStack } from "@/features/hud/ChipStack";
import { formatStack, useStackUnit } from "@/features/table/stackDisplay";
import { Character3D } from "@/features/table/Character3D";
import { Character3DGL } from "@/features/table/Character3DGL";
import { useRenderMode } from "@/features/table/renderMode";
import { useTableGraphics } from "@/features/table/tableGraphics";
import { useRoomPanelOpen, ROOM_PANEL_WIDTH_PX } from "@/features/hud/roomPanelState";
import { getTableGraphics } from "@/features/table/tableGraphics";

function SeatCard({
  seat,
  buyInLabel,
  onSit,
  active,
  winner,
  mode,
  bigBlind,
  stackUnit,
}: {
  seat: SeatView;
  buyInLabel: string;
  onSit: () => void;
  active?: boolean;
  winner?: boolean;
  mode: "2d" | "3d" | "mix";
  bigBlind: number;
  stackUnit: "chips" | "bb";
}) {
  const empty = seat.status === "empty" || !seat.user_id;

  if (empty) {
    return (
      <button
        type="button"
        onClick={onSit}
        className="group flex w-32 flex-col items-center gap-1.5 rounded-2xl border border-dashed border-white/15 bg-surface px-3 py-3 text-neutral-200 shadow-[0_2px_12px_rgba(0,0,0,0.4)] transition-all duration-300 hover:border-brand/60 hover:bg-white/[0.04]"
      >
        <span className="text-2xl leading-none text-gold transition group-hover:scale-110">+</span>
        <span className="text-xs font-bold uppercase tracking-wider">Sit Here</span>
        <span className="text-[10px] text-neutral-500">Seat {seat.index + 1}</span>
        <span className="text-[10px] font-semibold text-gold">{buyInLabel}</span>
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
      className="flex w-36 flex-col items-center rounded-2xl border border-white/[0.06] bg-surface px-3 py-3"
      style={{ boxShadow: `0 0 0 1px ${accent}55, 0 8px 26px ${glow}` }}
    >
      {mode === "3d" || (mode === "mix" && !!seat.model_url) ? (
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
      <p className="text-xs font-semibold text-green">
        {formatStack(seat.stack, bigBlind, stackUnit, formatCents)}
      </p>
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

  const [mode] = useRenderMode();
  const [graphics] = useTableGraphics();
  const cinematic = graphics === "cinematic";
  const [stackUnit] = useStackUnit();
  const bigBlind = snapshot?.big_blind ?? 0;
  const activeSeat = snapshot?.action_seat;
  const winnerSeats = new Set((showdown?.winners ?? []).map((w) => w.seat));

  // RoomPanel (the "Room Control" drawer) renders only when !demo and sits
  // above the seat layer (z-40 vs z-10) — when it's open, reserve its width
  // so the ring shifts right instead of leaving left-side seats unreachable
  // underneath it.
  const demo = useSearchParams().get("demo") === "1";
  const [roomPanelOpen] = useRoomPanelOpen(getTableGraphics() !== "cinematic");
  const insetLeft = !demo && roomPanelOpen ? ROOM_PANEL_WIDTH_PX : 0;

  const [viewport, setViewport] = useState({ w: 0, h: 0 });
  // The felt's REAL rendered rect. The seat ring is inscribed in it so the
  // sit-down boxes stay locked to the table image at every window size —
  // previously the ring was computed from the raw viewport while the felt was
  // positioned by static CSS, two coordinate systems that only agreed at one
  // size. Null in cinematic mode (no ImageTable), where we fall back to the
  // viewport math below.
  const [feltRect, setFeltRect] = useState<DOMRect | null>(null);
  useEffect(() => {
    const update = () => {
      setViewport({ w: window.innerWidth, h: window.innerHeight });
      const el = document.querySelector(`[${FELT_SURFACE_ATTR}]`);
      setFeltRect(el ? el.getBoundingClientRect() : null);
    };
    update();
    // rAF catches the first paint, when the felt image has laid out but the
    // effect has already run.
    const raf = requestAnimationFrame(update);
    window.addEventListener("resize", update);
    // The felt also moves when the Room drawer opens/closes, which is a layout
    // change rather than a window resize — observe the element itself.
    const ro = new ResizeObserver(update);
    const el = document.querySelector(`[${FELT_SURFACE_ATTR}]`);
    if (el) ro.observe(el);
    ro.observe(document.body);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", update);
      ro.disconnect();
    };
    // insetLeft is a dependency because opening/closing the Room drawer MOVES
    // the felt without resizing it — ResizeObserver fires on size, not
    // position, so without this the ring keeps a stale rect and drifts off the
    // rail the moment the drawer is toggled.
  }, [insetLeft]);

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
  // Prefer the measured felt (exact, and automatically tracks any future
  // change to FELT_BOUNDS); fall back to the viewport computation only when
  // no felt is on screen (cinematic mode).
  // Empty-seat cards must land exactly where the avatar appears once the seat
  // is taken. Occupied seats use TABLE_SEATS percentages inside FELT_BOUNDS
  // (HrcTable), so map those same percentages through the felt's measured rect
  // rather than placing these on a separate computed ellipse — that mismatch is
  // why the "SIT HERE" squares sat apart from the avatars. Indexed by REAL seat
  // index, hero-rotated the same way HrcTable rotates.
  const heroIdx = heroSeat ?? 0;
  const positions = feltRect
    ? Array.from({ length: seatCount }, (_, index) => {
        const visual = (index - heroIdx + seatCount) % seatCount;
        const p = seatPointFromFelt(feltRect, visual);
        return { index, x: p.x, y: p.y, angle: 0 };
      })
    : viewport.w > 0
      ? getSeatPositions(computeTableLayout(viewport.w, viewport.h, insetLeft), seatCount, 1.04)
      : [];

  return (
    <div className="pointer-events-none fixed inset-0 z-10">
      {/* The render-mode (2.5D/3D/Mix) switcher used to float here — moved into
          TableSettings.tsx (still the only place to change it; CLAUDE.md
          requires all three modes stay switchable) so this top-right corner is
          free for GameStatusRail's Current Bet / Hand Strength pills.
          Cinematic mode: the R3F scene draws seats/avatars/stacks, so nothing
          else renders here. Classic mode: full seat plaques. */}
      {!cinematic &&
        positions.length > 0 &&
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
                bigBlind={bigBlind}
                stackUnit={stackUnit}
              />
            </div>
          );
        })}
    </div>
  );
}
