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
          border: "1px solid #2AC6D0", overflow: "hidden", padding: "12px 10px 10px 0",
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

      {/* ---- Top-right overlay: EXPORT / REPLAY HAND stacked above the
           blockchain verification panel (layout zone 1c) ---- */}
      <div style={{ position: "absolute", right: 20, top: 20, width: 280, display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "flex", gap: 10 }}>
          <button style={{ flex: 1, height: 44, borderRadius: 8, border: "1px solid rgba(233,196,106,0.55)",
            background: "linear-gradient(180deg,#E8B84B,#C28E1E)", color: "#241a05", fontWeight: 800, fontSize: 13,
            letterSpacing: "0.06em" }}>EXPORT</button>
          <button style={{ flex: 1.35, height: 44, borderRadius: 8, border: "1px solid rgba(28,181,201,0.6)",
            background: "rgba(28,181,201,0.16)", color: "#9beaf5", fontWeight: 800, fontSize: 13,
            letterSpacing: "0.06em" }}>▶ REPLAY HAND</button>
        </div>
        <div style={{ borderRadius: 12, border: "1px solid #2AC6D0", background: "rgba(15,23,42,0.65)",
          backdropFilter: "blur(10px)", padding: "12px 14px" }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.18em", color: "#4DEEEA" }}>BLOCKCHAIN HASH</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: "#E2F1F1", marginTop: 4, fontFamily: "ui-monospace, monospace" }}>
            0x6c7c…d9a2c4b1
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8 }}>
            <span style={{ color: "#22c55e", fontSize: 15 }}>✓</span>
            <span style={{ fontSize: 13, fontWeight: 800, letterSpacing: "0.08em", color: "#22c55e" }}>VERIFIED</span>
          </div>
          <div style={{ marginTop: 10, height: 34, borderRadius: 8, border: "1px solid rgba(233,196,106,0.5)",
            background: "rgba(233,196,106,0.12)", color: "#f5d98a", fontSize: 12, fontWeight: 700,
            display: "flex", alignItems: "center", justifyContent: "center", letterSpacing: "0.05em" }}>
            🔗 VIEW ON BLOCKCHAIN
          </div>
        </div>
      </div>

      {/* ---- Bottom-left: Tournament Stats, 280x220 (layout zone 3a) ---- */}
      <div style={{ position: "absolute", left: 20, bottom: 20, width: 280, height: 220, borderRadius: 12,
        background: "rgba(15,23,42,0.65)", backdropFilter: "blur(10px)",
        border: "1px solid #2AC6D0", padding: "12px 14px", overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
          <span style={{ color: "#f5c518" }}>🏆</span>
          <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: "0.08em", color: "#E2F1F1" }}>Tournament Stats</span>
        </div>
        <div style={{ fontSize: 12, color: "#94A3B8", marginBottom: 6 }}>High Rollers Main · $50/$100</div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, padding: "3px 0" }}>
            <span style={{ color: "#94A3B8" }}>Live Stack</span>
            <span style={{ color: "#E2F1F1", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>$45,000</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, padding: "3px 0" }}>
            <span style={{ color: "#94A3B8" }}>Pot Stack</span>
            <span style={{ color: "#E2F1F1", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>10</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, padding: "3px 0" }}>
            <span style={{ color: "#94A3B8" }}>Live Chip Stack</span>
            <span style={{ color: "#E2F1F1", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>$45,000</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, padding: "3px 0" }}>
            <span style={{ color: "#94A3B8" }}>Current Bet</span>
            <span style={{ color: "#E2F1F1", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>$600</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, padding: "3px 0" }}>
            <span style={{ color: "#94A3B8" }}>Bet Guarantee</span>
            <span style={{ color: "#E2F1F1", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>$500</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, padding: "3px 0" }}>
            <span style={{ color: "#94A3B8" }}>Commission</span>
            <span style={{ color: "#E2F1F1", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>$900</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, padding: "3px 0" }}>
            <span style={{ color: "#94A3B8" }}>Prize Bank</span>
            <span style={{ color: "#E2F1F1", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>1.85</span>
          </div>
      </div>

      {/* ---- Felt text information block (spec §3) ----
           380x50 bounding box, centred on the felt directly above the community
           cards, transparent background (reads as printed on the felt).
           Line 1: 13px bold #E2F1F1 | Line 2: 12px regular #C8E6C9 | 18px spacing */}
      <div
        style={{
          position: "absolute", left: "50%", top: "27%", transform: "translateX(-50%)",
          width: 380, height: 50, display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center", background: "transparent",
          textAlign: "center", textShadow: "0 1px 4px rgba(0,0,0,0.65)",
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 700, color: "#E2F1F1", lineHeight: "18px" }}>
          HAND 812,847 | POT: $16,400
        </div>
        <div style={{ fontSize: 12, fontWeight: 400, color: "#C8E6C9", lineHeight: "18px" }}>
          WINNER: Player 1 (Full House) | TIMESTAMP: 2024-08-24
        </div>
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

      {/* ---- Bottom-right: Player Analytics / Chat, 280x220 (layout zone 3c) ---- */}
      <div style={{ position: "absolute", right: 20, bottom: 20, width: 280, height: 220, borderRadius: 12,
        background: "rgba(15,23,42,0.65)", backdropFilter: "blur(10px)",
        border: "1px solid #2AC6D0", padding: "12px 14px", display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
          <span style={{ color: "#4DEEEA" }}>📊</span>
          <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: "0.08em", color: "#E2F1F1" }}>Player Analytics</span>
        </div>
        {[["Neon Viper", 68], ["Shadow King", 41], ["Void Witch", 92]].map(([n, pct]) => (
          <div key={n as string} style={{ marginBottom: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 3 }}>
              <span style={{ color: "#FFFFFF" }}>{n}</span>
              <span style={{ color: "#94A3B8", fontVariantNumeric: "tabular-nums" }}>{pct}% VPIP</span>
            </div>
            <div style={{ height: 5, borderRadius: 3, background: "rgba(255,255,255,0.10)" }}>
              <div style={{ height: 5, width: `${pct}%`, borderRadius: 3, background: "#1CB5C9",
                boxShadow: "0 0 8px rgba(28,181,201,0.7)" }} />
            </div>
          </div>
        ))}
        <div style={{ marginTop: "auto", display: "flex", gap: 6 }}>
          <div style={{ flex: 1, height: 30, borderRadius: 8, background: "rgba(255,255,255,0.05)",
            border: "1px solid rgba(255,255,255,0.12)", color: "#94A3B8", fontSize: 12,
            display: "flex", alignItems: "center", padding: "0 10px" }}>Type message…</div>
          <div style={{ width: 34, height: 30, borderRadius: 8, background: "#1CB5C9", color: "#0b1524",
            display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800 }}>➤</div>
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
      maxSeats={backdrop?.seats ?? 10} // spec: ten seats; unoccupied render VACANT
      backdrop={backdrop}
    >
      <HudOverlay mode={mode} />
    </CinematicScene>
  );
}
