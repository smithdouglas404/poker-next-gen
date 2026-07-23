"use client";

import { useMemo } from "react";

import { GLASS_PANEL } from "@/features/ui/tokens";
import { CinematicScene, type AvatarMode, type SceneSeat } from "@/features/table3d/CinematicScene";
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
    <div className="relative flex h-[86px] w-[62px] flex-col justify-between rounded-lg bg-white p-1.5 shadow-lg" style={{ boxShadow: "0 6px 20px rgba(0,0,0,0.5), 0 0 18px rgba(224,30,43,0.25)" }}>
      <span className="text-lg font-bold leading-none" style={{ color }}>{rank}{glyph}</span>
      <span className="self-end text-2xl leading-none" style={{ color }}>{glyph}</span>
      <span className="sr-only">{red}</span>
    </div>
  );
}

function HudOverlay({ mode }: { mode: AvatarMode }) {
  const badge = mode === "2d" ? "2.5D · HRC Portrait Avatars" : mode === "3d" ? "3D · GLB Avatars (Tripo pipeline)" : "Mixed · Tripo 3D + HRC portraits";
  return (
    <div className="pointer-events-none absolute inset-0 select-none">
      {/* top-left table info */}
      <div className={`absolute left-5 top-5 ${GLASS_PANEL} px-4 py-3`} style={{ minWidth: 190 }}>
        <div className="text-[11px] uppercase tracking-[0.25em]" style={{ color: "#ff2d3f" }}>High Rollers Main</div>
        <div className="mt-0.5 text-sm font-semibold text-white">$5 / $10 · No-Limit Hold&apos;em</div>
        <div className="mt-1 flex items-center gap-2 text-[11px] text-white/60">
          <span>Round: <span className="text-white/90">River</span></span>
          <span>·</span>
          <span>Hand #12,847</span>
        </div>
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

      {/* bottom-right player analytics */}
      <div className={`absolute bottom-5 right-5 ${GLASS_PANEL} px-4 py-3`} style={{ width: 200 }}>
        <div className="mb-2 flex items-center gap-1.5 text-[11px] uppercase tracking-[0.2em] text-white/50">Player Analytics</div>
        {[["Neon Viper", 68, "#e01e2b"], ["Shadow King", 41, "#e9c46a"], ["Void Witch", 92, "#ff3b46"]].map(([n, pct, c]) => (
          <div key={n as string} className="mb-2">
            <div className="mb-0.5 flex justify-between text-[11px]"><span className="text-white/70">{n}</span><span className="text-white/50">{pct}% VPIP</span></div>
            <div className="h-1.5 rounded-full" style={{ background: "rgba(255,255,255,0.08)" }}>
              <div className="h-1.5 rounded-full" style={{ width: `${pct}%`, background: c as string, boxShadow: `0 0 8px ${c}` }} />
            </div>
          </div>
        ))}
      </div>

      {/* pot label */}
      <div className="absolute left-1/2 top-[56%] -translate-x-1/2 text-center">
        <div className="text-[11px] uppercase tracking-[0.3em] text-white/45">Pot</div>
        <div className="text-xl font-bold" style={{ color: "#ffe6a3", textShadow: "0 0 16px rgba(233,196,106,0.6)" }}>{POT_LABEL}</div>
      </div>

      {/* action bar */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2">
        <div className="mb-2 flex items-end justify-center gap-2">
          {PROOF_HERO_HOLE.map((c) => <HeroCard key={c} code={c} />)}
        </div>

        {/* pre-action toggles */}
        <div className="mb-2 flex justify-center gap-2">
          {[["Check / Fold", true], ["Call Any", false], ["Fold to Any", false]].map(([label, on]) => (
            <div
              key={label as string}
              className="rounded-full px-3 py-1 text-[11px] font-semibold"
              style={
                on
                  ? { background: "rgba(224,30,43,0.16)", border: "1px solid #e01e2b", color: "#ffd9dc" }
                  : { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.14)", color: "rgba(255,255,255,0.6)" }
              }
            >
              {label}
            </div>
          ))}
        </div>

        <div className={`${GLASS_PANEL} px-3 py-2.5`} style={{ boxShadow: "0 10px 40px rgba(0,0,0,0.55)" }}>
          <div className="flex items-center gap-2">
            <button className="rounded-lg px-5 py-2.5 text-sm font-bold text-white" style={{ background: "linear-gradient(180deg,#b33,#7a1f1f)", border: "1px solid #d9534f" }}>FOLD</button>
            <button className="rounded-lg px-5 py-2.5 text-sm font-bold" style={{ background: "linear-gradient(180deg,#0e5c33,#0a3320)", border: "1px solid #22c55e", color: "#8ef0b0" }}>CALL <span className="opacity-80">$4,000</span></button>
            <button className="rounded-lg px-6 py-2.5 text-sm font-bold text-black" style={{ background: "linear-gradient(180deg,#f3e2ad,#d4af37 55%,#9a7b2c)", border: "1px solid #f3e2ad" }}>RAISE TO <span>$12,000</span></button>
            <button className="rounded-lg px-5 py-2.5 text-sm font-bold" style={{ background: "rgba(60,10,14,0.6)", border: "1px solid #ff3b46", color: "#ff9aa0" }}>ALL-IN</button>
          </div>

          {/* raise slider + presets */}
          <div className="mt-2.5 flex items-center gap-3">
            <div className="flex gap-1.5">
              {["Min", "½ Pot", "⅔ Pot", "Pot", "Max"].map((p, i) => (
                <div key={p} className="rounded-md px-2.5 py-1 text-[11px] font-semibold" style={i === 2 ? { background: "linear-gradient(180deg,#f3e2ad,#d4af37)", color: "#3a2c07" } : { background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.7)" }}>{p}</div>
              ))}
            </div>
            <input type="range" min={0} max={100} defaultValue={44} className="h-1.5 flex-1 accent-amber-400" readOnly />
            <div className="rounded-md px-3 py-1 text-sm font-bold" style={{ background: "rgba(0,0,0,0.4)", border: "1px solid rgba(212,175,55,0.5)", color: "#ffe6a3", minWidth: 84, textAlign: "center" }}>$12,000</div>
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

export default function CinematicTable({ mode }: { mode: AvatarMode }) {
  const seats = useMemo(() => PROOF_SEATS.map(toSceneSeat), []);
  return (
    <CinematicScene
      seats={seats}
      board={PROOF_BOARD}
      potLabel={POT_LABEL}
      heroHole={PROOF_HERO_HOLE}
      mode={mode}
      maxSeats={PROOF_SEATS.length}
    >
      <HudOverlay mode={mode} />
    </CinematicScene>
  );
}
