"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

import { DEFAULT_MAX_SEATS, MAX_SEATS, MIN_SEATS, type SeatView } from "@/features/game/protocol";
import { formatCents, useGame } from "@/features/game/GameProvider";
import { seatPointFromFelt, FELT_SURFACE_ATTR } from "@/features/hud/feltLayout";
import { avatarDef, avatarForKey } from "@/features/table/avatars";
import { ChipStack } from "@/features/hud/ChipStack";
import { formatStack, useStackUnit } from "@/features/table/stackDisplay";
import { Character3D } from "@/features/table/Character3D";
import { Character3DGL } from "@/features/table/Character3DGL";
import { useRenderMode } from "@/features/table/renderMode";
import {
  useRoomPanelOpen,
  ROOM_PANEL_WIDTH_PX,
  SHOW_LEFT_PANEL_COLUMN,
} from "@/features/hud/roomPanelState";

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
 * with the flat felt and drifted on resize. Now seats are mapped through the
 * felt's own measured rect (`seatPointFromFelt`), the single coordinate system
 * every table layer shares. They sit on the felt ring for any seat
 * count (2–9) and rescale correctly on resize — no hardcoded per-count layouts.
 */
export function SeatHud() {
  const { snapshot, sitDown, profile, buyInCents, maxSeats, showdown } = useGame();
  const buyInLabel = formatCents(buyInCents);

  const [mode] = useRenderMode();
  const [stackUnit] = useStackUnit();
  const bigBlind = snapshot?.big_blind ?? 0;
  const activeSeat = snapshot?.action_seat;
  const winnerSeats = new Set((showdown?.winners ?? []).map((w) => w.seat));

  // RoomPanel (the "Room Control" drawer) sits above the seat layer (z-40 vs
  // z-10), so while it is open the ring shifts right rather than leaving the
  // left-hand seats unreachable underneath it. Must match useFeltStyle()
  // exactly — the felt and the ring move together or they land on different
  // coordinate systems (see CLAUDE.md > the felt-coordinate rule).
  const demo = useSearchParams().get("demo") === "1";
  const [roomPanelOpen] = useRoomPanelOpen(true);
  // No `!demo` here either — must stay byte-identical to useFeltStyle()'s
  // insetLeft, or the felt and the seat ring land on different coordinate
  // systems (CLAUDE.md > the felt-coordinate rule).
  const insetLeft = SHOW_LEFT_PANEL_COLUMN && roomPanelOpen ? ROOM_PANEL_WIDTH_PX : 0;

  // The felt's REAL rendered rect, and the ONLY geometry this component has.
  // The seat ring is inscribed in it so the sit-down boxes stay locked to the
  // table image at every window size — previously the ring was computed from
  // the raw viewport while the felt was positioned by static CSS, two
  // coordinate systems that only agreed at one size. Null until the felt has
  // mounted, and then nothing renders (see `positions` below) rather than
  // falling back to viewport maths.
  const [feltRect, setFeltRect] = useState<DOMRect | null>(null);
  useEffect(() => {
    const update = () => {
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

  // The measured felt is exact and automatically tracks any future change to
  // FELT_BOUNDS — no second geometry to keep in sync.
  // Empty-seat cards must land exactly where the avatar appears once the seat
  // is taken. Occupied seats use TABLE_SEATS percentages inside FELT_BOUNDS
  // (HrcTable), so map those same percentages through the felt's measured rect
  // rather than placing these on a separate computed ellipse — that mismatch is
  // why the "SIT HERE" squares sat apart from the avatars. Indexed by REAL seat
  // index, hero-rotated the same way HrcTable rotates.
  // In ?demo=1 the table is driven by DEMO_SNAPSHOT inside HrcTable, which
  // SeatHud never sees — so it would treat every seat as empty and stamp a
  // "SIT HERE" card on top of each demo avatar. Those cards are also dead in
  // demo (no match to sitDown into), so render none: HrcTable owns the demo
  // table completely.
  const heroIdx = heroSeat ?? 0;
  // THE felt rect or nothing. There is no viewport-derived fallback.
  //
  // This used to fall back to
  // `getSeatPositions(computeTableLayout(viewport.w, viewport.h, insetLeft), …)`
  // when feltRect was null — a seat ring computed from the raw VIEWPORT while
  // the felt itself was placed by CSS. Two coordinate systems with different
  // centres and different aspect ratios (1.833 vs 1.786) that agreed at exactly
  // one window size; that is the bug CLAUDE.md's felt-coordinate rule was
  // written about. Unreachable today only because TableFeltBackdrop always
  // mounts and always carries FELT_SURFACE_ATTR — one deleted component away
  // from being live again.
  //
  // Rendering nothing for the one frame before the felt is measured costs a
  // single frame of empty seat markers. Rendering them in the WRONG PLACE costs
  // a day.
  const positions = demo
    ? []
    : feltRect
      ? Array.from({ length: seatCount }, (_, index) => {
          const visual = (index - heroIdx + seatCount) % seatCount;
          const p = seatPointFromFelt(feltRect, visual, seatCount);
          return { index, x: p.x, y: p.y, angle: 0 };
        })
      : [];

  return (
    <div className="pointer-events-none fixed inset-0 z-10">
      {/* The avatar-mode (2D/3D/Mix) switcher used to float here — moved into
          TableSettings.tsx (still the only place to change it; CLAUDE.md
          requires all three AVATAR modes stay switchable) so this top-right
          corner is free for GameStatusRail's Current Bet / Hand Strength
          pills. */}
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
                bigBlind={bigBlind}
                stackUnit={stackUnit}
              />
            </div>
          );
        })}
    </div>
  );
}
