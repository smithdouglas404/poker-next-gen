"use client";

import type { CSSProperties } from "react";
import { FELT_BOUNDS } from "@/features/hrc/lib/table-constants";
import { FELT_SURFACE_ATTR, useFeltStyle } from "@/features/hud/feltLayout";

// The felt/table image is pure decoration — no game state — so unlike
// ImageTable (which HrcTable refuses to mount without a real snapshot, per
// CLAUDE.md's "no fake state" rule), it's safe to always show. Without this,
// the pre-seat screen (TableEmptyState's "This table is open" card + SeatHud's
// "Sit Here" markers, both mounted independently of a live snapshot) floats
// over a plain dark background with no table visible at all.
//
// This is ALSO the felt a player looks at while choosing a seat — HrcTable
// (and therefore ImageTable) doesn't mount until a real snapshot exists — so
// it carries FELT_SURFACE_ATTR: SeatHud measures this element and inscribes
// the "Sit Here" ring in it. Previously the ring was computed from the raw
// viewport while this image was placed by static CSS, two independent
// coordinate systems that only agreed at one window size.
export function TableFeltBackdrop() {
  // Match SeatHud's shift when the Room Control drawer overlays the left edge,
  // so the table and its seat ring move together instead of drifting apart.
  const { style: feltStyle } = useFeltStyle();

  return (
    <div className="pointer-events-none absolute inset-0 z-0">
      <div style={feltStyle} {...{ [FELT_SURFACE_ATTR]: "" }}>
        <img
          src="/images/poker-table-felt.webp"
          alt=""
          className="absolute inset-0 h-full w-full object-fill select-none"
          draggable={false}
          style={{
            filter: "drop-shadow(0 12px 50px rgba(0,0,0,0.8)) drop-shadow(0 0 80px rgba(0,0,0,0.4))",
          }}
        />
      </div>
    </div>
  );
}
