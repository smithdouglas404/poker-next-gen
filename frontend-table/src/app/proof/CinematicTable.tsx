"use client";

import { useMemo } from "react";

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

function HudOverlay({ mode }: { mode: AvatarMode }) {
  const badge = mode === "2d" ? "2.5D · HRC Portrait Avatars" : mode === "3d" ? "3D · GLB Avatars (Tripo pipeline)" : "Mixed · Tripo 3D + HRC portraits";
  return (
    <div className="pointer-events-none absolute inset-0 select-none">
      {/* ---- Hand-history timeline log (top-left) — 1920x1080 spec ----
           260x310 panel, rgba(15,23,42,.65) + blur, 1px cyan border, r12
           2px cyan rail 24px from left, 10px nodes, 14px cyan phase titles */}
      <div
        style={{
          position: "absolute", left: 20, top: 20, width: 260, height: 310, borderRadius: 12,
          background: "rgba(15,23,42,0.65)", backdropFilter: "blur(10px)",
          border: "1px solid rgba(77,238,234,0.45)", overflow: "hidden", padding: "12px 10px 10px 0",
        }}
      >
        {/* vertical timeline rail */}
        <div style={{ position: "absolute", left: 24, top: 16, bottom: 24, width: 2,
          background: "#1CB5C9", boxShadow: "0 0 8px rgba(28,181,201,0.8)" }} />
        <div style={{ position: "relative", height: "100%", overflow: "hidden" }}>
          <div style={{ position: "relative", paddingLeft: 34, marginBottom: 12 }}>
            <div style={{ position: "absolute", left: 19, top: 4, width: 10, height: 10, borderRadius: "50%",
              background: "#1CB5C9", boxShadow: "0 0 8px rgba(28,181,201,0.9)" }} />
            <div style={{ fontSize: 14, fontWeight: 700, letterSpacing: "0.06em", color: "#4DEEEA" }}>PRE-FLOP</div>
            <div style={{ fontSize: 12, color: "#FFFFFF", lineHeight: 1.5 }}>
              Player 1: <b>RAISE</b> $550<span style={{ color: "#94A3B8" }}> (Pot $600)</span>
            </div>
            <div style={{ fontSize: 12, color: "#FFFFFF", lineHeight: 1.5 }}>
              Player 3: <b>CALL</b> $550<span style={{ color: "#94A3B8" }}> (Pot $1,150)</span>
            </div>
            <div style={{ fontSize: 12, color: "#FFFFFF", lineHeight: 1.5 }}>
              Player 5: <b>FOLD</b>
            </div>
          </div>
          <div style={{ position: "relative", paddingLeft: 34, marginBottom: 12 }}>
            <div style={{ position: "absolute", left: 19, top: 4, width: 10, height: 10, borderRadius: "50%",
              background: "#1CB5C9", boxShadow: "0 0 8px rgba(28,181,201,0.9)" }} />
            <div style={{ fontSize: 14, fontWeight: 700, letterSpacing: "0.06em", color: "#4DEEEA" }}>FLOP</div>
            <div style={{ fontSize: 12, color: "#FFFFFF", lineHeight: 1.5 }}>
              Player 1: <b>BET</b> $400<span style={{ color: "#94A3B8" }}> (Pot $1,550)</span>
            </div>
            <div style={{ fontSize: 12, color: "#FFFFFF", lineHeight: 1.5 }}>
              Player 3: <b>CALL</b> $400<span style={{ color: "#94A3B8" }}> (Pot $1,950)</span>
            </div>
          </div>
          <div style={{ position: "relative", paddingLeft: 34, marginBottom: 12 }}>
            <div style={{ position: "absolute", left: 19, top: 4, width: 10, height: 10, borderRadius: "50%",
              background: "#1CB5C9", boxShadow: "0 0 8px rgba(28,181,201,0.9)" }} />
            <div style={{ fontSize: 14, fontWeight: 700, letterSpacing: "0.06em", color: "#4DEEEA" }}>TURN</div>
            <div style={{ fontSize: 12, color: "#FFFFFF", lineHeight: 1.5 }}>
              Player 1: <b>CHECK</b><span style={{ color: "#94A3B8" }}> (Pot $1,950)</span>
            </div>
            <div style={{ fontSize: 12, color: "#FFFFFF", lineHeight: 1.5 }}>
              Player 3: <b>BET</b> $800<span style={{ color: "#94A3B8" }}> (Pot $2,750)</span>
            </div>
          </div>
          <div style={{ position: "relative", paddingLeft: 34, marginBottom: 12 }}>
            <div style={{ position: "absolute", left: 19, top: 4, width: 10, height: 10, borderRadius: "50%",
              background: "#1CB5C9", boxShadow: "0 0 8px rgba(28,181,201,0.9)" }} />
            <div style={{ fontSize: 14, fontWeight: 700, letterSpacing: "0.06em", color: "#4DEEEA" }}>SHOWDOWN</div>
            <div style={{ fontSize: 12, color: "#FFFFFF", lineHeight: 1.5 }}>
              Player 1: <b>WINS</b> $5,250<span style={{ color: "#94A3B8" }}> (Aces full of Kings)</span>
            </div>
          </div>
        </div>
        {/* bottom indicator arrow 12x10 */}
        <div style={{ position: "absolute", left: 19, bottom: 8, width: 0, height: 0,
          borderLeft: "6px solid transparent", borderRight: "6px solid transparent",
          borderTop: "10px solid #1CB5C9" }} />
      </div>

      {/* top-right chat */}
      <div className={`absolute right-5 top-5 ${GLASS_PANEL} px-3.5 py-3`} style={{ width: 210 }}>
        <div className="mb-1.5 text-[11px] uppercase tracking-[0.2em] text-white/50">Table Chat</div>
        <div className="space-y-1 text-[11px] leading-snug">
          <div><span style={{ color: "#ff2d3f" }}>NeonViper:</span> <span className="text-white/70">nice pot building</span></div>
          <div><span style={{ color: "#e9c46a" }}>IceQueen:</span> <span className="text-white/70">gg well played 🎲</span></div>
          <div><span style={{ color: "#e01e2b" }}>ShadowKing:</span> <span className="text-white/70">all day 🔥</span></div>
        </div>
        <div className="mt-2 rounded-md px-2 py-1 text-[11px] text-white/40" style={{ background: "rgba(255,255,255,0.04)" }}>Type a message…</div>
      </div>

      {/* bottom-left table stats (cash game — not "tournament") */}
      <div className={`absolute bottom-6 left-5 ${GLASS_PANEL} px-4 py-3`} style={{ width: 200 }}>
        <div className="mb-1.5 flex items-center gap-1.5 text-[11px] uppercase tracking-[0.2em] text-white/50">Table Stats</div>
        {[["Your Stack", "$24,500"], ["Pot", POT_LABEL], ["Players", "6 / 9"], ["Blinds", "$50 / $100"]].map(([k, v]) => (
          <div key={k} className="flex justify-between py-[3px] text-[11px]">
            <span className="text-white/55">{k}</span>
            <span className="font-semibold text-white/90">{v}</span>
          </div>
        ))}
      </div>

      {/* pot label */}
      <div className="absolute left-1/2 top-[53%] -translate-x-1/2 text-center">
        <div className="text-[11px] uppercase tracking-[0.3em] text-white/45">Pot</div>
        <div className="text-xl font-bold" style={{ color: "#ffe6a3", textShadow: "0 0 16px rgba(233,196,106,0.6)" }}>{POT_LABEL}</div>
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

      {/* mode badge */}
      <div className="absolute left-1/2 top-4 -translate-x-1/2 rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-[0.2em]" style={{ background: "rgba(8,10,14,0.7)", border: "1px solid rgba(224,30,43,0.4)", color: "#ff2d3f" }}>
        {badge}
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
      maxSeats={backdrop?.seats ?? PROOF_SEATS.length}
      backdrop={backdrop}
    >
      <HudOverlay mode={mode} />
    </CinematicScene>
  );
}
