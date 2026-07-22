"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { callSessionRpc } from "@/lib/nakama/sessionRpc";
import { BTN_GOLD, GLASS_PANEL, cn } from "@/features/ui/tokens";
import { avatarForKey, avatarSrc } from "@/features/table/avatars";
import type { Cosmetic } from "./types";

const POLL_MS = 3500;

type Phase = "idle" | "rendering" | "done" | "failed";

/** Prompt Assistant presets — each appends a style phrase to the description. */
const STYLE_ASSIST: { id: string; label: string; phrase: string }[] = [
  { id: "cyberpunk-enforcer", label: "Cyberpunk Enforcer", phrase: "a heavy cyberpunk enforcer in armored plating" },
  { id: "tactical-stealth", label: "Tactical Stealth", phrase: "a tactical stealth operative in matte black gear" },
  { id: "royal-assassin", label: "Royal Assassin", phrase: "a royal assassin in ornate gold-trimmed armor" },
  { id: "neon-samurai", label: "Neon Samurai", phrase: "a neon samurai with glowing katana and circuitry" },
  { id: "void-sorceress", label: "Void Sorceress", phrase: "a void sorceress wreathed in dark energy" },
];

/**
 * detailed_23 — Refined Nano Banana AI Customizer.
 * Two-panel customizer: an Avatar Customization Lab (prompt + prompt assistant +
 * live logic preview + render) and a High-Fidelity Render Preview with Apply & Save.
 * Render hits the real `character_generate` RPC and polls
 * `character_generation_status`; Apply & Save equips via `cosmetic_equip`.
 * Offline/guest runs a clearly-labeled local simulation.
 */
export function NanoBananaCustomizer() {
  const [prompt, setPrompt] = useState("");
  const [assist, setAssist] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState(0);
  const [online, setOnline] = useState<boolean | null>(null);
  const [cosmeticId, setCosmeticId] = useState<string | null>(null);
  const [previewSrc, setPreviewSrc] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);
  useEffect(() => clearTimer, [clearTimer]);

  const composed = [prompt.trim(), STYLE_ASSIST.find((s) => s.id === assist)?.phrase]
    .filter(Boolean)
    .join(", ");

  const runDemo = useCallback((seed: string) => {
    setOnline(false);
    setPhase("rendering");
    setProgress(8);
    clearTimer();
    timerRef.current = setInterval(() => {
      setProgress((p) => {
        const next = Math.min(100, p + 9);
        if (next >= 100) {
          clearTimer();
          setCosmeticId(`cos-demo-${Date.now()}`);
          setPreviewSrc(avatarSrc(avatarForKey(seed || "nano")));
          setPhase("done");
          setNotice("High-fidelity render complete (offline demo — not a live mint).");
        }
        return next;
      });
    }, 650);
  }, [clearTimer]);

  const resolvePreview = useCallback(async (cid: string) => {
    try {
      const inv = (await callSessionRpc("inventory_list", {})) as { inventory?: Cosmetic[] };
      const hit = (inv.inventory ?? []).find((c) => c.id === cid);
      setPreviewSrc(hit?.preview_ref || avatarSrc(avatarForKey(cid)));
    } catch {
      setPreviewSrc(avatarSrc(avatarForKey(cid)));
    }
  }, []);

  const render = useCallback(async () => {
    setError(null);
    setNotice(null);
    if (composed.trim().length < 3) {
      setError("Describe your style first (a few words at least).");
      return;
    }
    setPhase("rendering");
    setProgress(5);
    setCosmeticId(null);
    setPreviewSrc(null);

    try {
      const res = (await callSessionRpc("character_generate", { prompt: composed })) as {
        configured?: boolean;
        generation_id?: string;
        message?: string;
      };
      if (!res.configured || !res.generation_id) {
        runDemo(composed);
        return;
      }
      setOnline(true);
      const genId = res.generation_id;
      clearTimer();
      timerRef.current = setInterval(async () => {
        try {
          const st = (await callSessionRpc("character_generation_status", {
            generation_id: genId,
          })) as { status: string; progress?: number; cosmetic_id?: string };
          if (st.status === "success") {
            clearTimer();
            setProgress(100);
            setPhase("done");
            setCosmeticId(st.cosmetic_id ?? null);
            setNotice("Your character was minted into your gallery.");
            if (st.cosmetic_id) await resolvePreview(st.cosmetic_id);
          } else if (st.status === "failed") {
            clearTimer();
            setPhase("failed");
            setError("Render failed — your fee was refunded. Try a new prompt.");
          } else {
            setProgress((p) => Math.max(p, st.progress ?? p));
          }
        } catch {
          /* transient — keep polling */
        }
      }, POLL_MS);
    } catch {
      runDemo(composed);
    }
  }, [composed, clearTimer, runDemo, resolvePreview]);

  const applySave = useCallback(async () => {
    if (!cosmeticId) return;
    setApplying(true);
    setError(null);
    try {
      if (online && !cosmeticId.startsWith("cos-demo")) {
        await callSessionRpc("cosmetic_equip", { cosmetic_id: cosmeticId });
        setNotice("Avatar applied and saved — equipped at the table.");
      } else {
        setNotice("Avatar applied (offline demo — equip is simulated locally).");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Apply failed");
    } finally {
      setApplying(false);
    }
  }, [cosmeticId, online]);

  const rendering = phase === "rendering";
  const done = phase === "done";

  return (
    <div className="min-h-screen text-white">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-6 py-5">
        <div>
          <p className="font-display text-[11px] font-bold uppercase tracking-[0.28em] text-gold/80">
            Nano Banana Engine
          </p>
          <h1 className="font-display mt-1 text-2xl font-bold uppercase tracking-wide sm:text-3xl">
            AI Customizer
          </h1>
        </div>
        <div className="flex items-center gap-3">
          <StatusPill online={online} />
          <Link href="/studio" className="text-sm text-muted transition-colors hover:text-white">
            ← Studio
          </Link>
        </div>
      </header>

      {(error || notice) && (
        <div className="mx-auto max-w-[1400px] px-6 pt-4">
          {error ? (
            <div className="rounded-xl border border-red-500/30 bg-red-950/20 px-4 py-2.5 text-sm text-red-200">
              {error}
            </div>
          ) : (
            <div className="rounded-xl border border-green/25 bg-green/5 px-4 py-2.5 text-sm text-green">
              {notice}
            </div>
          )}
        </div>
      )}

      <main className="mx-auto grid max-w-[1400px] items-start gap-6 px-6 py-8 lg:grid-cols-2">
        {/* Left — Avatar Customization Lab */}
        <section className={cn(GLASS_PANEL, "space-y-5 p-6")}>
          <h2 className="font-display text-2xl font-bold text-gold">Avatar Customization Lab</h2>

          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={4}
            placeholder="Describe your style"
            className="w-full resize-none rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-white placeholder:text-neutral-600 outline-none transition focus:border-white/25 focus:ring-2 focus:ring-white/10"
          />

          <div className="space-y-1.5">
            <label className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-neutral-400">
              Prompt Assistant
              <span
                title="Pick a style preset — it is folded into your prompt before rendering."
                className="grid h-4 w-4 cursor-help place-items-center rounded-full border border-white/20 text-[9px] text-neutral-400"
              >
                ?
              </span>
            </label>
            <select
              value={assist}
              onChange={(e) => setAssist(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-2.5 text-sm text-white outline-none transition focus:border-white/25"
            >
              <option value="">No preset — freeform prompt</option>
              {STYLE_ASSIST.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>

          {/* Live Logic Preview */}
          <div className="rounded-xl border border-white/10 bg-black/40 p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[11px] uppercase tracking-wider text-neutral-400">
                Live Logic Preview
              </span>
              {composed && (
                <button
                  type="button"
                  onClick={() => {
                    setPrompt("");
                    setAssist("");
                  }}
                  aria-label="Clear prompt"
                  className="text-neutral-500 transition hover:text-white"
                >
                  ✕
                </button>
              )}
            </div>
            <div className="relative grid h-28 place-items-center overflow-hidden rounded-lg bg-[#0a0d10]">
              <Wireframe active={rendering} />
              <p className="pointer-events-none absolute bottom-1 left-2 right-2 truncate text-[10px] text-neutral-600">
                {composed || "prompt logic renders here…"}
              </p>
            </div>
          </div>

          <button
            type="button"
            disabled={rendering || composed.trim().length < 3}
            onClick={() => void render()}
            className={cn(
              BTN_GOLD,
              "w-full rounded-xl px-4 py-3 text-sm uppercase tracking-wide disabled:opacity-40",
            )}
          >
            {rendering ? `Rendering… ${Math.round(progress)}%` : "Render with Nano Banana"}
          </button>
          <p className="flex items-center justify-center gap-2 text-xs">
            <span
              className={cn(
                "h-2 w-2 rounded-full",
                rendering ? "bg-gold" : done ? "bg-green" : "bg-green/70",
              )}
            />
            <span className="text-neutral-400">
              {rendering ? "Rendering in progress" : done ? "Render complete" : "Ready for Rendering"}
            </span>
          </p>

          {/* Premium (locked) features — link to the real upgrade surface */}
          <div className="space-y-2 border-t border-white/[0.06] pt-4">
            <PremiumLock label="Animated Effects (Premium)" />
            <PremiumLock label="Custom Gear Creation (Premium)" />
          </div>
        </section>

        {/* Right — High-Fidelity Render Preview */}
        <section className={cn(GLASS_PANEL, "flex flex-col gap-5 p-6")}>
          <h2 className="font-display text-2xl font-bold text-white">High-Fidelity Render Preview</h2>

          <div className="relative flex min-h-[380px] flex-1 items-center justify-center overflow-hidden rounded-xl border border-white/10 bg-[#0a0d10]">
            <div
              className="pointer-events-none absolute inset-0"
              style={{ background: "radial-gradient(60% 60% at 50% 40%, rgba(245,197,24,0.12), transparent 70%)" }}
            />
            {previewSrc && done ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={previewSrc} alt="Rendered avatar" className="h-full w-full object-contain" />
            ) : (
              <div className="relative flex flex-col items-center gap-4">
                <Wireframe active={rendering} large />
                <p className="text-xs uppercase tracking-[0.2em] text-neutral-500">
                  {rendering ? `Rendering… ${Math.round(progress)}%` : "Render preview appears here"}
                </p>
              </div>
            )}
          </div>

          <button
            type="button"
            disabled={!done || !cosmeticId || applying}
            onClick={() => void applySave()}
            className={cn(
              BTN_GOLD,
              "w-full rounded-xl px-4 py-4 font-display text-lg uppercase tracking-wide disabled:opacity-40",
            )}
          >
            {applying ? "Saving…" : "Apply & Save Avatar"}
          </button>
        </section>
      </main>
    </div>
  );
}

function PremiumLock({ label }: { label: string }) {
  return (
    <Link
      href="/membership"
      className="flex items-center gap-2.5 rounded-xl border border-white/10 bg-black/30 px-4 py-2.5 text-sm text-neutral-400 transition hover:border-gold/40 hover:text-gold"
    >
      <span aria-hidden>🔒</span>
      <span>{label}</span>
      <span className="ml-auto text-[10px] uppercase tracking-wider text-gold/70">Upgrade</span>
    </Link>
  );
}

function StatusPill({ online }: { online: boolean | null }) {
  if (online === null) {
    return (
      <span className="rounded-full border border-white/15 px-3 py-1 text-[11px] uppercase tracking-wider text-neutral-400">
        Ready
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

/** Animated gold wireframe humanoid (self-contained SVG). */
function Wireframe({ active, large }: { active: boolean; large?: boolean }) {
  return (
    <svg
      viewBox="0 0 200 320"
      className={cn("relative w-auto", large ? "h-[300px]" : "h-24")}
      style={{ filter: "drop-shadow(0 0 12px rgba(245,197,24,0.3))" }}
      aria-hidden="true"
    >
      <g fill="none" stroke="#f5c518" strokeWidth="1.4" strokeLinecap="round" opacity="0.85">
        <ellipse cx="100" cy="42" rx="24" ry="28" />
        <ellipse cx="100" cy="42" rx="12" ry="26" opacity="0.5" />
        <path d="M100 70 L100 190" />
        <path d="M70 96 Q100 82 130 96 L134 150 Q100 168 66 150 Z" />
        <path d="M72 98 L44 158 L40 210" />
        <path d="M128 98 L156 158 L160 210" />
        <path d="M84 190 L74 250 L70 306" />
        <path d="M116 190 L126 250 L130 306" />
      </g>
      {active && (
        <circle cx="100" cy="150" r="4" fill="#f5c518">
          <animate attributeName="cy" values="70;250;70" dur="2.4s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="0;1;0" dur="2.4s" repeatCount="indefinite" />
        </circle>
      )}
    </svg>
  );
}
