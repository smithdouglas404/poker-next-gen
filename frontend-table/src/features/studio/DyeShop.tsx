"use client";

import Link from "next/link";
import Image from "next/image";
import { useMemo, useState } from "react";

import { Button } from "@/features/ui";
import { GLASS_PANEL, RARITY, cn } from "@/features/ui/tokens";
import { useStudio } from "./useStudio";
import {
  ACCENT_SWATCHES,
  DYE_PACKS,
  PRIMARY_SWATCHES,
  SECONDARY_SWATCHES,
  swatchFill,
  type DyePack,
  type Swatch,
} from "./dyeData";
import type { Cosmetic } from "./types";

interface Channels {
  primary: string;
  secondary: string;
  accent: string;
}

function findSwatchHex(list: Swatch[], id: string): string {
  const s = list.find((x) => x.id === id);
  return s?.hex ?? "";
}

/**
 * Avatar Dye Shop. Paints primary / secondary / accent channels onto the
 * equipped model and commits them through `cosmetic_dye_set`. Saved looks ride
 * the loadout RPCs (`loadout_save` / `loadout_equip`); inventory comes from
 * `inventory_list` — all via the shared `useStudio` data layer (demo fallback
 * when the backend is unreachable).
 */
export function DyeShop() {
  const studio = useStudio();

  const [primary, setPrimary] = useState("p-gold");
  const [secondary, setSecondary] = useState("s-red");
  const [accent, setAccent] = useState("a-cyan");
  const [preview, setPreview] = useState(true);
  const [activePack, setActivePack] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);

  // The model being dyed: the equipped model, else the first owned model.
  const target: Cosmetic | null = useMemo(() => {
    const equippedId = studio.equipped["model"];
    const models = studio.inventory.filter((c) => c.kind === "model");
    return (
      models.find((c) => c.id === equippedId) ??
      models[0] ??
      studio.inventory[0] ??
      null
    );
  }, [studio.inventory, studio.equipped]);

  const channels: Channels = {
    primary: findSwatchHex(PRIMARY_SWATCHES, primary),
    secondary: findSwatchHex(SECONDARY_SWATCHES, secondary),
    accent: findSwatchHex(ACCENT_SWATCHES, accent),
  };

  const styleScore =
    600 +
    [channels.primary, channels.secondary, channels.accent].filter(Boolean).length * 90 +
    (activePack ? 110 : 0);

  const loadPack = (pack: DyePack) => {
    setActivePack(pack.id);
    // Snap channels to the pack's nearest catalog swatches (fallback: leave as-is).
    const pById = (list: Swatch[], hex: string) =>
      list.find((s) => s.hex?.toLowerCase() === hex.toLowerCase())?.id;
    setPrimary(pById(PRIMARY_SWATCHES, pack.primary) ?? primary);
    setSecondary(pById(SECONDARY_SWATCHES, pack.secondary) ?? secondary);
    setAccent(pById(ACCENT_SWATCHES, pack.accent) ?? accent);
    // Ensure the exact pack colors drive the preview even without a catalog match.
    packOverrideRef.current = {
      primary: pack.primary,
      secondary: pack.secondary,
      accent: pack.accent,
    };
  };

  // When a pack is chosen its exact triple overrides the swatch lookup until the
  // player edits a channel by hand.
  const packOverrideRef = useMemo(() => ({ current: null as Channels | null }), []);
  const editChannel = (setter: (id: string) => void) => (id: string) => {
    packOverrideRef.current = null;
    setActivePack(null);
    setter(id);
  };

  const effective: Channels = packOverrideRef.current ?? channels;
  const shown = preview ? effective : { primary: "", secondary: "", accent: "" };

  const applyDye = async () => {
    if (!target) {
      studio.clearMessages();
      return;
    }
    setApplying(true);
    try {
      await studio.dye(target.id, {
        primary: effective.primary,
        secondary: effective.secondary,
        accent: effective.accent,
      });
    } finally {
      setApplying(false);
    }
  };

  const saveLook = async () => {
    const name = `Look · ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
    await studio.saveLoadout(name, studio.equipped);
  };

  const recentlyEquipped = studio.inventory.slice(0, 7);

  return (
    <div className="min-h-screen text-white">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-6 py-5">
        <div>
          <p className="font-display text-[11px] font-bold uppercase tracking-[0.28em] text-gold/80">
            Avatar Customization
          </p>
          <h1 className="font-display mt-1 text-2xl font-bold uppercase tracking-wide sm:text-3xl">
            Dye Shop
          </h1>
        </div>
        <div className="flex items-center gap-3">
          <LivePill online={studio.online} />
          <Link href="/studio" className="text-sm text-muted transition-colors hover:text-white">
            ← Studio
          </Link>
        </div>
      </header>

      {(studio.error || studio.notice) && (
        <div className="mx-auto max-w-[1400px] px-6 pt-4">
          <div
            className={cn(
              "flex items-center justify-between gap-3 rounded-xl border px-4 py-2.5 text-sm",
              studio.error
                ? "border-[#e01e2b]/30 bg-[#e01e2b]/10 text-[#ff9ba1]"
                : "border-green/25 bg-green/5 text-green",
            )}
          >
            <span>{studio.error ?? studio.notice}</span>
            <button
              type="button"
              onClick={studio.clearMessages}
              className="text-xs uppercase tracking-wider opacity-70 hover:opacity-100"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      <main className="mx-auto grid max-w-[1400px] items-start gap-6 px-6 py-8 lg:grid-cols-[minmax(0,1fr)_420px]">
        {/* Preview stage */}
        <section className="space-y-5">
          <div className={cn(GLASS_PANEL, "relative flex h-[440px] items-center justify-center overflow-hidden")}>
            <ModelPreview target={target} channels={shown} />
            <div className={cn(GLASS_PANEL, "absolute bottom-4 left-4 px-4 py-3")}>
              <p className="font-display text-[11px] font-bold uppercase tracking-[0.2em] text-muted">
                Quick Stats
              </p>
              <p className="mt-1.5 text-sm text-neutral-200">
                <span className="text-gold">◈</span> Armor Rating:{" "}
                <span className="font-bold tabular-nums">3500</span>
              </p>
              <p className="text-sm text-neutral-200">
                <span className="text-green">✦</span> Style Score:{" "}
                <span className="font-bold tabular-nums">{styleScore}</span>
              </p>
            </div>
          </div>

          {/* Recently equipped */}
          <div className={cn(GLASS_PANEL, "px-5 py-4")}>
            <div className="mb-3 flex items-center justify-between">
              <p className="font-display text-[11px] font-bold uppercase tracking-[0.2em] text-white">
                Recently Equipped
              </p>
              <button
                type="button"
                onClick={saveLook}
                className="text-[11px] uppercase tracking-wider text-gold/80 hover:text-gold"
              >
                Save look →
              </button>
            </div>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {recentlyEquipped.length === 0 && (
                <p className="text-xs text-muted">No cosmetics owned yet.</p>
              )}
              {recentlyEquipped.map((item) => (
                <ItemThumb key={item.id} item={item} onClick={() => void studio.equip(item.id)} />
              ))}
            </div>
            {studio.loadouts.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2 border-t border-white/10 pt-3">
                <span className="text-[11px] uppercase tracking-wider text-muted">Saved looks:</span>
                {studio.loadouts.map((lo) => (
                  <button
                    key={lo.id}
                    type="button"
                    onClick={() => void studio.equipLoadout(lo.id)}
                    className="rounded-full border border-white/15 px-3 py-1 text-[11px] text-neutral-200 transition hover:border-gold/40 hover:text-gold"
                  >
                    {lo.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* Dye customization panel */}
        <aside className={cn(GLASS_PANEL, "space-y-5 px-5 py-5")}>
          <div className="flex items-center justify-between">
            <h2 className="font-display text-base font-bold uppercase tracking-wide text-white">
              Dye Customization
            </h2>
            <label className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-muted">
              Preview
              <button
                type="button"
                role="switch"
                aria-checked={preview}
                onClick={() => setPreview((p) => !p)}
                className={cn(
                  "relative h-5 w-9 rounded-full transition",
                  preview ? "bg-gold" : "bg-white/15",
                )}
              >
                <span
                  className={cn(
                    "absolute top-0.5 h-4 w-4 rounded-full bg-black transition",
                    preview ? "left-4" : "left-0.5",
                  )}
                />
              </button>
            </label>
          </div>

          <SwatchRow
            label="Primary"
            list={PRIMARY_SWATCHES}
            selected={primary}
            onSelect={editChannel(setPrimary)}
          />
          <SwatchRow
            label="Secondary"
            list={SECONDARY_SWATCHES}
            selected={secondary}
            onSelect={editChannel(setSecondary)}
          />
          <SwatchRow
            label="Accent"
            list={ACCENT_SWATCHES}
            selected={accent}
            onSelect={editChannel(setAccent)}
          />

          {/* Dye packs */}
          <div>
            <p className="mb-2 font-display text-[11px] font-bold uppercase tracking-[0.2em] text-white">
              Dye Packs
            </p>
            <div className="grid grid-cols-2 gap-3">
              {DYE_PACKS.map((pack) => (
                <DyePackCard
                  key={pack.id}
                  pack={pack}
                  active={activePack === pack.id}
                  onClick={() => loadPack(pack)}
                />
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 pt-1">
            <Button variant="gold" onClick={() => void applyDye()} disabled={applying || !target}>
              {applying ? "Applying…" : "Apply Dye"}
            </Button>
            <Link href="/studio?screen=render" className="contents">
              <Button variant="outline">Nano Banana Render</Button>
            </Link>
          </div>
          {!target && (
            <p className="text-[11px] text-muted">
              Own a model cosmetic to dye it — generate one in the Studio first.
            </p>
          )}
        </aside>
      </main>
    </div>
  );
}

function SwatchRow({
  label,
  list,
  selected,
  onSelect,
}: {
  label: string;
  list: Swatch[];
  selected: string;
  onSelect: (id: string) => void;
}) {
  return (
    <div>
      <p className="mb-2 text-sm font-semibold text-neutral-200">{label}</p>
      <div className="flex flex-wrap gap-2">
        {list.map((s) => {
          const isSel = s.id === selected;
          const isNone = s.hex === null && !s.hatch;
          return (
            <button
              key={s.id}
              type="button"
              title={s.label}
              aria-label={`${label} ${s.label}`}
              onClick={() => onSelect(s.id)}
              className={cn(
                "h-8 w-8 rounded-md border transition",
                isSel ? "border-gold ring-2 ring-gold/40" : "border-white/15 hover:border-white/40",
              )}
              style={{
                background: isNone ? "transparent" : swatchFill(s),
              }}
            >
              {isNone && <span className="text-[10px] text-muted">∅</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function DyePackCard({
  pack,
  active,
  onClick,
}: {
  pack: DyePack;
  active: boolean;
  onClick: () => void;
}) {
  const r = RARITY[pack.rarity];
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        GLASS_PANEL,
        "flex gap-2.5 p-2.5 text-left transition",
        active ? "ring-2" : "hover:border-white/20",
        r.border,
      )}
      style={active ? { boxShadow: `0 0 0 2px ${r.glow}` } : undefined}
    >
      <span
        className="h-12 w-12 shrink-0 rounded-md border border-white/10"
        style={{ background: pack.swatch }}
      />
      <span className="min-w-0">
        <span className="block text-sm font-bold leading-tight text-white">{pack.name}</span>
        <span className={cn("block text-[11px] font-semibold capitalize", r.text)}>
          {pack.rarity}
        </span>
        <span className="mt-0.5 block truncate text-[10px] text-muted">{pack.description}</span>
      </span>
    </button>
  );
}

function ModelPreview({ target, channels }: { target: Cosmetic | null; channels: Channels }) {
  const overlays = (
    <>
      {channels.primary && (
        <div
          className="pointer-events-none absolute inset-0 mix-blend-overlay"
          style={{ background: channels.primary, opacity: 0.5 }}
        />
      )}
      {channels.secondary && (
        <div
          className="pointer-events-none absolute inset-0 mix-blend-soft-light"
          style={{
            background: `radial-gradient(120% 100% at 30% 90%, ${channels.secondary}, transparent 60%)`,
            opacity: 0.6,
          }}
        />
      )}
      {channels.accent && (
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            boxShadow: `inset 0 0 60px ${channels.accent}`,
            opacity: 0.55,
          }}
        />
      )}
    </>
  );

  if (target?.preview_ref) {
    return (
      <div className="relative h-[360px] w-[280px] overflow-hidden rounded-2xl border border-white/10">
        <Image
          src={target.preview_ref}
          alt={target.name}
          fill
          sizes="280px"
          className="object-cover"
          unoptimized
        />
        {overlays}
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-black/60 px-3 py-1 text-xs text-neutral-200">
          {target.name}
        </div>
      </div>
    );
  }

  return (
    <div
      className="relative flex h-[360px] w-[280px] items-center justify-center overflow-hidden rounded-2xl border border-white/10"
      style={{ background: "linear-gradient(160deg,#1a1e24,#0c0e12)" }}
    >
      <MannequinSilhouette />
      {overlays}
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-black/60 px-3 py-1 text-xs text-neutral-200">
        {target?.name ?? "No model equipped"}
      </div>
    </div>
  );
}

function MannequinSilhouette() {
  return (
    <svg viewBox="0 0 200 340" className="h-[320px] w-auto opacity-90" aria-hidden="true">
      <g fill="#2a2f38" stroke="#3a4250" strokeWidth="1">
        <ellipse cx="100" cy="46" rx="26" ry="30" />
        <path d="M64 92 Q100 76 136 92 L142 200 Q100 220 58 200 Z" />
        <path d="M66 96 L40 170 L38 232 L52 232 L60 172 Z" />
        <path d="M134 96 L160 170 L162 232 L148 232 L140 172 Z" />
        <path d="M78 210 L70 288 L66 332 L88 332 L94 288 L100 224 Z" />
        <path d="M122 210 L130 288 L134 332 L112 332 L106 288 L100 224 Z" />
      </g>
    </svg>
  );
}

function ItemThumb({ item, onClick }: { item: Cosmetic; onClick: () => void }) {
  const r = RARITY[(item.rarity as keyof typeof RARITY) in RARITY ? (item.rarity as keyof typeof RARITY) : "common"];
  return (
    <button
      type="button"
      onClick={onClick}
      title={item.name}
      className={cn(
        "relative h-14 w-14 shrink-0 overflow-hidden rounded-lg border transition hover:-translate-y-0.5",
        r.border,
      )}
      style={{ background: "#0e1116" }}
    >
      {item.preview_ref ? (
        <Image src={item.preview_ref} alt={item.name} fill sizes="56px" className="object-cover" unoptimized />
      ) : (
        <span className="flex h-full w-full items-center justify-center text-[10px] uppercase text-muted">
          {item.kind}
        </span>
      )}
    </button>
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
