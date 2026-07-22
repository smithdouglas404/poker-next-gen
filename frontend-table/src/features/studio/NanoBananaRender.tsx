"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { callSessionRpc } from "@/lib/nakama/sessionRpc";
import { Button } from "@/features/ui";
import { GLASS_PANEL, cn } from "@/features/ui/tokens";
import {
  renderPhaseLabel,
  renderTelemetry,
  stageBreakdown,
  type RenderStage,
} from "./renderStages";

const POLL_MS = 3500;

type Status = "running" | "success" | "failed";

interface RenderState {
  /** null = probing, true = live poll, false = offline demo climb. */
  online: boolean | null;
  status: Status;
  progress: number;
  cosmeticId: string | null;
}

/**
 * Full-screen Nano Banana render monitor. Given a real `generationId` it polls
 * the authoritative `character_generation_status` RPC; with none it runs a
 * clearly-labeled offline demo climb so the state is always demonstrable.
 */
export function NanoBananaRender({ generationId }: { generationId: string | null }) {
  const [state, setState] = useState<RenderState>({
    online: null,
    status: "running",
    progress: generationId ? 5 : 12,
    cosmeticId: null,
  });
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const clear = () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };

    // Offline demo: no generation id → animate a labeled render climb.
    if (!generationId) {
      setState((s) => ({ ...s, online: false }));
      timerRef.current = setInterval(() => {
        setState((s) => {
          if (s.status !== "running") return s;
          const next = Math.min(100, s.progress + 7);
          if (next >= 100) {
            clear();
            return { ...s, progress: 100, status: "success" };
          }
          return { ...s, progress: next };
        });
      }, 700);
      return clear;
    }

    // Live: poll the real generation status.
    let failures = 0;
    const poll = async () => {
      try {
        const st = (await callSessionRpc("character_generation_status", {
          generation_id: generationId,
        })) as { status: string; progress?: number; cosmetic_id?: string };
        failures = 0;
        if (st.status === "success") {
          clear();
          setState((s) => ({
            ...s,
            online: true,
            status: "success",
            progress: 100,
            cosmeticId: st.cosmetic_id ?? null,
          }));
        } else if (st.status === "failed") {
          clear();
          setState((s) => ({ ...s, online: true, status: "failed" }));
        } else {
          setState((s) => ({
            ...s,
            online: true,
            progress: Math.max(s.progress, st.progress ?? s.progress),
          }));
        }
      } catch {
        // Backend unreachable (guest / offline). After a couple of misses,
        // fall back to a labeled demo climb rather than freezing at 5%.
        failures += 1;
        if (failures >= 2) {
          setState((s) => {
            if (s.status !== "running") return s;
            const next = Math.min(100, s.progress + 6);
            return {
              ...s,
              online: false,
              progress: next,
              status: next >= 100 ? "success" : "running",
            };
          });
        }
      }
    };
    void poll();
    timerRef.current = setInterval(() => void poll(), POLL_MS);
    return clear;
  }, [generationId]);

  const { progress, status, online } = state;
  const stages = stageBreakdown(progress);
  const telemetry = renderTelemetry(progress);
  const phase = renderPhaseLabel(progress, status === "success", status === "failed");
  const done = status === "success";
  const failed = status === "failed";

  return (
    <div className="min-h-screen text-white">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-6 py-5">
        <div>
          <p className="font-display text-[11px] font-bold uppercase tracking-[0.28em] text-gold/80">
            Nano Banana Engine
          </p>
          <h1 className="font-display mt-1 text-2xl font-bold uppercase tracking-wide sm:text-3xl">
            Rendering Progress
          </h1>
        </div>
        <div className="flex items-center gap-3">
          <LivePill online={online} />
          <Link href="/studio" className="text-sm text-muted transition-colors hover:text-white">
            ← Studio
          </Link>
        </div>
      </header>

      <main className="mx-auto grid max-w-[1400px] items-start gap-6 px-6 py-8 lg:grid-cols-[minmax(0,1fr)_360px]">
        {/* Stage — wireframe hero + engine progress card */}
        <section className="space-y-5">
          <div
            className={cn(
              GLASS_PANEL,
              "relative flex h-[420px] items-center justify-center overflow-hidden",
            )}
          >
            <div
              className="pointer-events-none absolute inset-0"
              style={{
                background:
                  "radial-gradient(60% 60% at 50% 45%, rgba(245,197,24,0.14), transparent 70%)",
              }}
            />
            <Wireframe active={!done && !failed} />
            {done && (
              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full border border-green/40 bg-green/10 px-4 py-1.5 text-xs font-bold uppercase tracking-wider text-green">
                Character minted
              </div>
            )}
          </div>

          <div className={cn(GLASS_PANEL, "px-6 py-5")}>
            <div className="flex items-center justify-between">
              <p className="font-display text-sm font-bold uppercase tracking-[0.2em] text-gold">
                Nano Banana Engine Rendering…
              </p>
              <span
                className={cn(
                  "font-display text-lg font-bold tabular-nums",
                  failed ? "text-[#ff9ba1]" : done ? "text-green" : "text-white",
                )}
              >
                {failed ? "—" : `${Math.round(progress)}%`}
              </span>
            </div>
            <ProgressBar pct={failed ? 0 : progress} tone={failed ? "red" : done ? "green" : "gold"} />
            <p className="mt-3 text-xs uppercase tracking-[0.2em] text-muted">{phase}</p>

            {(done || failed) && (
              <div className="mt-4 flex flex-wrap gap-3">
                {done && (
                  <>
                    <Link href="/studio">
                      <Button variant="gold" size="sm">
                        View in gallery
                      </Button>
                    </Link>
                    <Link href="/studio?screen=dye">
                      <Button variant="outline" size="sm">
                        Open Dye Shop
                      </Button>
                    </Link>
                  </>
                )}
                {failed && (
                  <span className="text-xs text-[#ff9ba1]">
                    Generation failed — your fee was refunded. Try a new prompt in the Studio.
                  </span>
                )}
              </div>
            )}
          </div>
        </section>

        {/* Rendering stats */}
        <aside className={cn(GLASS_PANEL, "space-y-5 px-5 py-5")}>
          <h2 className="font-display text-sm font-bold uppercase tracking-[0.2em] text-white">
            Rendering Stats
          </h2>

          <div className="space-y-4">
            {stages.map((stage) => (
              <StageRow key={stage.key} stage={stage} />
            ))}
          </div>

          <div className="border-t border-white/10 pt-4">
            <table className="w-full text-[11px]">
              <tbody>
                {telemetry.map((row) => (
                  <tr key={row.label} className="text-muted">
                    <td className="py-1 pr-2">{row.label}</td>
                    <td className="py-1 pr-2 text-right tabular-nums text-neutral-300">{row.pct}%</td>
                    <td className="py-1 text-right tabular-nums text-gold/80">{row.metric}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </aside>
      </main>
    </div>
  );
}

function StageRow({ stage }: { stage: RenderStage }) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-sm font-semibold text-white">{stage.label}</span>
        <span className="text-sm font-bold tabular-nums" style={{ color: stage.accent }}>
          {stage.pct}%
        </span>
      </div>
      <div className="flex items-center gap-3">
        <div
          className="h-10 w-14 shrink-0 rounded-md border border-white/10"
          style={{
            background: `radial-gradient(120% 120% at 30% 20%, ${stage.accent}55, transparent 65%), #0e1116`,
          }}
        />
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-black/50">
          <div
            className="h-full rounded-full transition-[width] duration-500"
            style={{ width: `${stage.pct}%`, background: stage.accent }}
          />
        </div>
      </div>
    </div>
  );
}

function ProgressBar({ pct, tone }: { pct: number; tone: "gold" | "green" | "red" }) {
  const bg =
    tone === "green"
      ? "linear-gradient(90deg,#0a7d43,#22c55e)"
      : tone === "red"
        ? "linear-gradient(90deg,#b3151f,#e01e2b)"
        : "linear-gradient(90deg,#c99700,#ffd54a)";
  return (
    <div className="mt-3 h-3 w-full overflow-hidden rounded-full border border-white/10 bg-black/50">
      <div
        className="h-full rounded-full transition-[width] duration-500"
        style={{ width: `${Math.max(0, Math.min(100, pct))}%`, background: bg }}
      />
    </div>
  );
}

function LivePill({ online }: { online: boolean | null }) {
  if (online === null) {
    return (
      <span className="rounded-full border border-white/15 px-3 py-1 text-[11px] uppercase tracking-wider text-neutral-400">
        Connecting…
      </span>
    );
  }
  return (
    <span
      className={cn(
        "rounded-full border px-3 py-1 text-[11px] font-bold uppercase tracking-wider",
        online ? "border-green/40 bg-green/10 text-green" : "border-gold/40 bg-gold/10 text-gold",
      )}
    >
      {online ? "Live" : "Demo · offline"}
    </span>
  );
}

/** Animated gold wireframe humanoid (self-contained SVG, SMIL glow). */
function Wireframe({ active }: { active: boolean }) {
  return (
    <svg
      viewBox="0 0 200 320"
      className="relative h-[360px] w-auto"
      style={{ filter: "drop-shadow(0 0 14px rgba(245,197,24,0.35))" }}
      aria-hidden="true"
    >
      <g fill="none" stroke="#f5c518" strokeWidth="1.4" strokeLinecap="round" opacity="0.9">
        {/* head */}
        <ellipse cx="100" cy="42" rx="24" ry="28" />
        <ellipse cx="100" cy="42" rx="12" ry="26" opacity="0.5" />
        <line x1="76" y1="42" x2="124" y2="42" opacity="0.5" />
        {/* torso */}
        <path d="M100 70 L100 190" />
        <path d="M70 96 Q100 82 130 96 L134 150 Q100 168 66 150 Z" />
        <line x1="70" y1="122" x2="130" y2="122" opacity="0.5" />
        {/* arms */}
        <path d="M72 98 L44 158 L40 210" />
        <path d="M128 98 L156 158 L160 210" />
        {/* legs */}
        <path d="M84 190 L74 250 L70 306" />
        <path d="M116 190 L126 250 L130 306" />
        <path d="M84 190 Q100 200 116 190" opacity="0.5" />
      </g>
      {active && (
        <>
          <circle cx="100" cy="150" r="4" fill="#f5c518">
            <animate attributeName="cy" values="70;250;70" dur="2.4s" repeatCount="indefinite" />
            <animate attributeName="opacity" values="0;1;0" dur="2.4s" repeatCount="indefinite" />
          </circle>
          <rect x="30" y="0" width="140" height="320" fill="none">
            <animate attributeName="opacity" values="0.9;0.4;0.9" dur="1.8s" repeatCount="indefinite" />
          </rect>
        </>
      )}
    </svg>
  );
}
