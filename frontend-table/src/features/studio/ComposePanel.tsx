"use client";

import { useMemo, useState } from "react";

import { Button } from "@/features/ui";
import { GLASS_PANEL, HEADING_SM, cn } from "@/features/ui/tokens";
import { PRESET_GROUPS, type PresetSelection, composePrompt } from "./presets";

function fmtFee(cents: number): string {
  return `$${(cents / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
}

export function ComposePanel({
  feeCents,
  online,
  busy,
  onGenerate,
}: {
  feeCents: number;
  online: boolean | null;
  busy: boolean;
  onGenerate: (prompt: string) => void;
}) {
  const [seed, setSeed] = useState("");
  const [selection, setSelection] = useState<PresetSelection>({});

  const composed = useMemo(() => composePrompt(seed, selection), [seed, selection]);
  const canGenerate = composed.trim().length >= 3 && !busy;

  function toggle(group: keyof PresetSelection, id: string) {
    setSelection((s) => ({ ...s, [group]: s[group] === id ? undefined : id }));
  }

  return (
    <div className={cn(GLASS_PANEL, "p-5")}>
      <div className="flex items-center justify-between">
        <p className={cn(HEADING_SM, "text-gold/80")}>Compose</p>
        <span className="rounded-full border border-gold/30 bg-gold/10 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-gold">
          Fee {fmtFee(feeCents)}
        </span>
      </div>
      <h2 className="font-display mt-1 text-xl font-bold text-white">Describe your character</h2>
      <p className="mt-1 text-xs text-neutral-400">
        A one-of-a-kind rigged 3D character, minted by Tripo and dropped into your gallery.
      </p>

      <label className="mt-4 block space-y-1.5">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400">
          Prompt
        </span>
        <textarea
          value={seed}
          onChange={(e) => setSeed(e.target.value)}
          rows={3}
          placeholder="a neon cyberpunk poker boss with a scarred jaw"
          className="w-full resize-none rounded-xl border border-white/10 bg-black/40 px-4 py-2.5 text-sm text-white placeholder:text-neutral-600 outline-none transition focus:border-white/25 focus:ring-2 focus:ring-white/10"
        />
      </label>

      <div className="mt-4 space-y-3">
        {PRESET_GROUPS.map((group) => (
          <div key={group.key}>
            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-neutral-500">
              {group.label}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {group.presets.map((p) => {
                const active = selection[group.key] === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => toggle(group.key, p.id)}
                    className={cn(
                      "rounded-full border px-3 py-1 text-xs transition",
                      active
                        ? "border-brand/60 bg-brand/15 text-brand"
                        : "border-white/10 bg-white/[0.03] text-neutral-300 hover:border-white/25",
                    )}
                  >
                    {p.label}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 rounded-xl border border-white/10 bg-black/30 p-3">
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-neutral-500">
          Composed prompt
        </p>
        <p className="mt-1 text-sm text-neutral-200">
          {composed || <span className="text-neutral-600">Pick presets or type a description…</span>}
        </p>
      </div>

      <Button onClick={() => onGenerate(composed)} disabled={!canGenerate} className="mt-4 w-full">
        {busy ? "Generating…" : `Generate — ${fmtFee(feeCents)}`}
      </Button>
      <p className="mt-2 text-center text-[10px] text-neutral-500">
        {online === false
          ? "Offline preview — generation is simulated locally and clearly labeled Demo."
          : "The fee is charged on submit and refunded automatically if the mint fails."}
      </p>
    </div>
  );
}
