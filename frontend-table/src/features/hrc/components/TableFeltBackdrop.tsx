import { FELT_BOUNDS } from "@/features/hrc/lib/table-constants";

// The felt/table image is pure decoration — no game state — so unlike
// ImageTable (which HrcTable refuses to mount without a real snapshot, per
// CLAUDE.md's "no fake state" rule), it's safe to always show. Without this,
// the pre-seat screen (TableEmptyState's "This table is open" card + SeatHud's
// "Sit Here" markers, both mounted independently of a live snapshot) floats
// over a plain dark background with no table visible at all.
export function TableFeltBackdrop() {
  return (
    <div className="pointer-events-none absolute inset-0 z-0">
      <div style={FELT_BOUNDS}>
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
