"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

import { GLASS_PANEL } from "@/features/ui/tokens";
import { CinematicScene, type AvatarMode, type SceneSeat } from "@/features/table3d/CinematicScene";
import { bakedPlate } from "@/features/table/bakedTable";
import { PROOF_SEATS, PROOF_BOARD, PROOF_HERO_HOLE, POT_LABEL, type ProofSeat } from "./proofData";

/* ---------------- proof data -> scene props ---------------- */

// Resolve the seat ring exactly as the original proof did, so the refactor to
// the shared CinematicScene stays pixel-identical.
function proofRing(seat: ProofSeat): string {
  return seat.state === "active"
    ? "#f3c14b"
    : seat.state === "allin"
      ? "#ff3b46"
      : seat.state === "folded"
        ? "#3a4250"
        : seat.ring;
}

function toSceneSeat(seat: ProofSeat): SceneSeat {
  return {
    index: seat.index,
    name: seat.name,
    stack: seat.stack,
    ringColor: proofRing(seat),
    state: seat.state,
    action: seat.action,
    hole: seat.hole,
    avatar: seat.avatar,
    model_url: seat.model,
    use3d: seat.use3d,
    isButton: seat.isButton,
  };
}

/* ---------------- DOM HUD (proof showcase — static demo data) ---------------- */

function HeroCard({ code }: { code: string }) {
  const rank = code.slice(0, -1).toUpperCase();
  const suit = code.slice(-1);
  const red = suit === "h";
  const glyph = suit === "h" ? "♥" : suit === "s" ? "♠" : suit === "d" ? "♦" : "♣";
  const color = suit === "h" ? "#e5484d" : suit === "s" ? "#101317" : suit === "d" ? "#2f6bff" : "#1fa85a";
  return (
    <div className="relative flex h-[100px] w-[72px] flex-col justify-between rounded-lg bg-white p-1.5 shadow-lg" style={{ boxShadow: "0 8px 24px rgba(0,0,0,0.55), 0 0 22px rgba(224,30,43,0.28)" }}>
      <span className="text-xl font-bold leading-none" style={{ color }}>{rank}{glyph}</span>
      <span className="self-end text-2xl leading-none" style={{ color }}>{glyph}</span>
      <span className="sr-only">{red}</span>
    </div>
  );
}

// Hand-history log. HRC ships this as a DRAWER (components/poker/HandHistoryDrawer.tsx),
// not a pinned panel, and that turns out to matter: this box is fixed-pixel at
// left:20 top:20, so it owns screen x 20-280, while the 3D-projected left-hand seats
// land around x 63-203 - entirely inside that band. Once the seat tiles grew to
// 160x189 they slid underneath it. Collapsed by default, it cannot cover a player.
function HandHistoryDrawer() {
  const [open, setOpen] = useState(true);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div style={{ position: "absolute", left: 20, top: 20, pointerEvents: "auto" }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        style={{
          display: "flex", alignItems: "center", gap: 5, height: 24, padding: "0 9px",
          borderRadius: 999, border: "1px solid #2AC6D0", background: "rgba(15,23,42,0.72)",
          backdropFilter: "blur(10px)", color: "#4DEEEA", fontSize: 10, fontWeight: 700,
          letterSpacing: "0.16em", textTransform: "uppercase", cursor: "pointer",
        }}
      >
        <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#1CB5C9",
          boxShadow: "0 0 8px rgba(28,181,201,0.9)" }} />
        Hand History
        <span style={{ opacity: 0.7 }}>{open ? "\u2039" : "\u203a"}</span>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, x: -12, height: 0 }}
            animate={{ opacity: 1, x: 0, height: 210 }}
            exit={{ opacity: 0, x: -12, height: 0 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            style={{
              marginTop: 6, width: 200, borderRadius: 10,
              background: "rgba(15,23,42,0.72)", backdropFilter: "blur(10px)",
              border: "1px solid #2AC6D0", overflow: "hidden", padding: "8px 6px 6px 0",
              position: "relative", fontSize: 11,
            }}
          >
          {/* vertical timeline rail */}
          <div style={{ position: "absolute", left: 17, top: 10, bottom: 14, width: 2,
            background: "#1CB5C9", boxShadow: "0 0 8px rgba(28,181,201,0.8)" }} />
          <div style={{ position: "relative", height: "100%", overflow: "hidden" }}>
            <div style={{ position: "relative", paddingLeft: 26, marginBottom: 7 }}>
              <div style={{ position: "absolute", left: 13, top: 3, width: 8, height: 8, borderRadius: "50%",
                background: "#1CB5C9", boxShadow: "0 0 8px rgba(28,181,201,0.9)" }} />
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", color: "#4DEEEA" }}>PRE-FLOP</div>
              <div style={{ fontSize: 10, color: "#FFFFFF", lineHeight: 1.3 }}>
                Player 1: <b>RAISE</b> $550<span style={{ color: "#94A3B8" }}> (Pot $600)</span>
              </div>
              <div style={{ fontSize: 10, color: "#FFFFFF", lineHeight: 1.3 }}>
                Player 3: <b>CALL</b> $550<span style={{ color: "#94A3B8" }}> (Pot $1,150)</span>
              </div>
              <div style={{ fontSize: 10, color: "#FFFFFF", lineHeight: 1.3 }}>
                Player 5: <b>FOLD</b>
              </div>
            </div>
            <div style={{ position: "relative", paddingLeft: 26, marginBottom: 7 }}>
              <div style={{ position: "absolute", left: 13, top: 3, width: 8, height: 8, borderRadius: "50%",
                background: "#1CB5C9", boxShadow: "0 0 8px rgba(28,181,201,0.9)" }} />
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", color: "#4DEEEA" }}>FLOP</div>
              <div style={{ fontSize: 10, color: "#FFFFFF", lineHeight: 1.3 }}>
                Player 1: <b>BET</b> $400<span style={{ color: "#94A3B8" }}> (Pot $1,550)</span>
              </div>
              <div style={{ fontSize: 10, color: "#FFFFFF", lineHeight: 1.3 }}>
                Player 3: <b>CALL</b> $400<span style={{ color: "#94A3B8" }}> (Pot $1,950)</span>
              </div>
            </div>
            <div style={{ position: "relative", paddingLeft: 26, marginBottom: 7 }}>
              <div style={{ position: "absolute", left: 13, top: 3, width: 8, height: 8, borderRadius: "50%",
                background: "#1CB5C9", boxShadow: "0 0 8px rgba(28,181,201,0.9)" }} />
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", color: "#4DEEEA" }}>TURN</div>
              <div style={{ fontSize: 10, color: "#FFFFFF", lineHeight: 1.3 }}>
                Player 1: <b>CHECK</b><span style={{ color: "#94A3B8" }}> (Pot $1,950)</span>
              </div>
              <div style={{ fontSize: 10, color: "#FFFFFF", lineHeight: 1.3 }}>
                Player 3: <b>BET</b> $800<span style={{ color: "#94A3B8" }}> (Pot $2,750)</span>
              </div>
            </div>
            <div style={{ position: "relative", paddingLeft: 26, marginBottom: 7 }}>
              <div style={{ position: "absolute", left: 13, top: 3, width: 8, height: 8, borderRadius: "50%",
                background: "#1CB5C9", boxShadow: "0 0 8px rgba(28,181,201,0.9)" }} />
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", color: "#4DEEEA" }}>SHOWDOWN</div>
              <div style={{ fontSize: 10, color: "#FFFFFF", lineHeight: 1.3 }}>
                Player 1: <b>WINS</b> $5,250<span style={{ color: "#94A3B8" }}> (Aces full of Kings)</span>
              </div>
            </div>
          </div>
          {/* bottom indicator arrow 12x10 */}
          <div style={{ position: "absolute", left: 15, bottom: 6, width: 0, height: 0,
            borderLeft: "6px solid transparent", borderRight: "6px solid transparent",
            borderTop: "10px solid #1CB5C9" }} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function HudOverlay({ mode }: { mode: AvatarMode }) {
  const badge = mode === "2d" ? "2.5D · HRC Portrait Avatars" : mode === "3d" ? "3D · GLB Avatars (Tripo pipeline)" : "Mixed · Tripo 3D + HRC portraits";
  return (
    <div className="pointer-events-none absolute inset-0 select-none">
      <HandHistoryDrawer />

      
      
      {/* Tournament Stats (bottom-left), the blockchain verification panel (top-right)
          and Player Analytics (bottom-right) were pinned open here as permanent
          furniture, which crowded the felt. They belong behind the player profile menu
          — HRC gates its equivalents the same way (ProvablyFairPanel sits behind
          showProvablyFair rather than always-on). Removed from the table surface. */}
      {/* ---- Main pot label box, 85x45 (APPROVED spec) ---- */}
      <div style={{ position: "absolute", left: "50%", top: "58%", transform: "translate(-50%,-50%)",
        width: 85, height: 45, borderRadius: 8, background: "rgba(15,23,42,0.72)",
        border: "1px solid #2AC6D0", backdropFilter: "blur(6px)",
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.22em", color: "#94A3B8" }}>POT</div>
        <div style={{ fontSize: 14, fontWeight: 800, color: "#E2F1F1", fontVariantNumeric: "tabular-nums" }}>{POT_LABEL}</div>
      </div>

      {/* ---- Hero action control panel — built to the 1920x1080 spec ----
           panel 540x180 r12 | cards 72x100 fanned -5/+5 peeking 45px above
           buttons 115x44 gap 10 | slider track 440x4, thumb 16x16 cyan     */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2" style={{ width: 540 }}>
        {/* made-hand readout */}
        <div className="mb-1.5 flex justify-center">
          <div
            className="rounded-full border border-gold/60 px-4 py-1 font-display text-[13px] font-bold uppercase tracking-[0.18em] text-gold"
            style={{ background: "rgba(8,10,14,0.88)", backdropFilter: "blur(8px)", boxShadow: "0 0 18px rgba(233,196,106,0.35)" }}
          >
            Trip Aces
          </div>
        </div>

        {/* hero hole cards — peek 45px out of the top of the panel */}
        <div className="relative z-10 flex items-end justify-center gap-1" style={{ marginBottom: -45 }}>
          {PROOF_HERO_HOLE.map((c, i) => (
            <div key={c} style={{ transform: `rotate(${i === 0 ? -5 : 5}deg)` }}>
              <HeroCard code={c} />
            </div>
          ))}
        </div>

        <div
          className="relative"
          style={{
            width: 540, height: 180, borderRadius: 12, paddingTop: 52,
            background: "rgba(17,21,30,0.94)", border: "1px solid rgba(255,255,255,0.10)",
            boxShadow: "0 10px 40px rgba(0,0,0,0.55)",
          }}
        >
          {/* collapse chevron 24x24 r4 */}
          <div
            style={{ position: "absolute", top: 10, right: 10, width: 24, height: 24, borderRadius: 4,
              background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)",
              display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, color: "rgba(255,255,255,0.65)" }}
          >⌄</div>

          {/* action buttons — 115x44, 10px gap, spec colours */}
          <div className="flex justify-center" style={{ gap: 10 }}>
            <button style={{ width: 115, height: 44, borderRadius: 8, background: "#A82424", color: "#fff",
              fontWeight: 700, fontSize: 14, border: "none", boxShadow: "inset 0 -2px 6px rgba(0,0,0,0.35)" }}>FOLD</button>
            <button style={{ width: 115, height: 44, borderRadius: 8, background: "#1CB5C9", color: "#0b1524",
              fontWeight: 700, fontSize: 14, border: "none" }}>CHECK</button>
            <button style={{ width: 115, height: 44, borderRadius: 8, color: "#0b1524", fontWeight: 700, fontSize: 14,
              border: "none", background: "linear-gradient(180deg,#E8B84B,#C28E1E)" }}>RAISE</button>
            <button style={{ width: 115, height: 44, borderRadius: 8, background: "#E51932", color: "#fff",
              fontWeight: 700, fontSize: 14, border: "none", boxShadow: "0 0 18px rgba(229,25,50,0.65)" }}>ALL-IN</button>
          </div>

          {/* bet slider — track 440x4, thumb 16x16 cyan */}
          <div className="mt-4 flex items-center justify-center gap-3">
            <div style={{ position: "relative", width: 440, height: 4, borderRadius: 2, background: "rgba(255,255,255,0.16)" }}>
              <div style={{ position: "absolute", left: 0, top: 0, height: 4, width: "62%", borderRadius: 2, background: "#1CB5C9" }} />
              <div style={{ position: "absolute", left: "62%", top: -6, width: 16, height: 16, marginLeft: -8, borderRadius: "50%",
                background: "#1CB5C9", boxShadow: "0 0 10px rgba(28,181,201,0.8)" }} />
            </div>
            <span style={{ fontSize: 12, color: "rgba(255,255,255,0.55)" }}>Bet</span>
          </div>
        </div>
      </div>

          </div>
  );
}

/* ---------------- root ---------------- */

export default function CinematicTable({ mode, plate }: { mode: AvatarMode; plate?: string }) {
  // Hero (seat 0) renders as the DOM identity cluster in the HUD column — not a
  // 3D-anchored seat — so the scene draws only the opponents.
  const seats = useMemo(() => PROOF_SEATS.map(toSceneSeat), []);
  const backdrop = bakedPlate(plate);
  return (
    <CinematicScene
      seats={seats}
      board={PROOF_BOARD}
      potLabel={POT_LABEL}
      heroHole={PROOF_HERO_HOLE}
      mode={mode}
      feltText={["HAND 812,847 | POT: $16,400", "WINNER: Player 1 (Full House) | TIMESTAMP: 2024-08-24"]}
      maxSeats={backdrop?.seats ?? 10} // spec: ten seats; unoccupied render VACANT
      backdrop={backdrop}
    >
      <HudOverlay mode={mode} />
    </CinematicScene>
  );
}
