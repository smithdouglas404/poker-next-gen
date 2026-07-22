"use client";

import type { ReactNode } from "react";

import { avatarDef, avatarForKey, avatarGradient, avatarSrc } from "@/features/table/avatars";
import { GLASS_PANEL, cn } from "@/features/ui/tokens";

/** Circular member portrait derived deterministically from the user id, with a
 * neon ring and a graceful monogram-gradient fallback when the WebP 404s. */
export function MemberAvatar({
  seed,
  name,
  size = 44,
  ring,
}: {
  seed: string;
  name: string;
  size?: number;
  ring?: string;
}) {
  const id = avatarForKey(seed);
  const def = avatarDef(id);
  const border = ring ?? def.border;
  return (
    <div
      className="relative shrink-0 overflow-hidden rounded-full"
      style={{
        width: size,
        height: size,
        border: `2px solid ${border}`,
        boxShadow: `0 0 12px ${def.glow}`,
        background: avatarGradient(seed),
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={avatarSrc(id)}
        alt=""
        width={size}
        height={size}
        className="h-full w-full object-cover"
        onError={(e) => {
          (e.currentTarget as HTMLImageElement).style.display = "none";
        }}
      />
      <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm font-bold text-white/85">
        {(name || "?").slice(0, 1).toUpperCase()}
      </span>
    </div>
  );
}

const ROLE_COLOR: Record<string, string> = {
  owner: "#f5c518",
  admin: "#22c55e",
  manager: "#22c55e",
  member: "rgba(255,255,255,0.55)",
};
export function roleColor(role: string): string {
  return ROLE_COLOR[role?.toLowerCase()] ?? ROLE_COLOR.member;
}

/** Status pill: encodes membership state with a bordered lozenge. */
export function StatusPill({ status }: { status: string }) {
  const s = (status || "active").toLowerCase();
  const map: Record<string, { label: string; cls: string }> = {
    active: { label: "Active", cls: "border-[#22c55e]/40 text-[#22c55e] bg-[#22c55e]/10" },
    online: { label: "In Game", cls: "border-[#e01e2b]/42 text-[#ffcdd1] bg-[#e01e2b]/12" },
    away: { label: "Away", cls: "border-[#f5c518]/34 text-[#ffe9a6] bg-[#f5c518]/10" },
    pending: { label: "Pending Approval", cls: "border-[#f5c518]/45 text-[#ffe9a6] bg-[#f5c518]/10" },
    banned: { label: "Banned", cls: "border-[#e01e2b]/50 text-[#ff9ba1] bg-[#e01e2b]/10" },
  };
  const m = map[s] ?? map.active;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em]",
        m.cls,
      )}
    >
      <span className="inline-block h-1.5 w-1.5 rounded-full bg-current" />
      {m.label}
    </span>
  );
}

/** Thin progress meter used under vault balances. */
export function Meter({ value, tone = "cyan" }: { value: number; tone?: "cyan" | "gold" | "red" }) {
  const pct = Math.max(2, Math.min(100, value));
  const bar =
    tone === "gold"
      ? "linear-gradient(90deg,#d4a80f,#f5c518,#ffd54a)"
      : tone === "red"
        ? "linear-gradient(90deg,#b3151f,#ff2d3f)"
        : "linear-gradient(90deg,#0a7d43,#22c55e)";
  return (
    <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-white/10">
      <div className="h-full rounded-full" style={{ width: `${pct}%`, background: bar }} />
    </div>
  );
}

/** Small "Demo data" badge shown whenever the hub renders the offline dataset. */
export function DemoBadge() {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/40 bg-amber-500/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-amber-300">
      <span className="inline-block h-1.5 w-1.5 rounded-full bg-amber-300" />
      Demo data
    </span>
  );
}

export function Panel({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn(GLASS_PANEL, className)}>{children}</div>;
}

export function SectionTitle({
  eyebrow,
  title,
  right,
}: {
  eyebrow?: string;
  title: string;
  right?: ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div>
        {eyebrow && (
          <p className="font-display text-[11px] font-bold uppercase tracking-[0.25em] text-gold/80">
            {eyebrow}
          </p>
        )}
        <h2 className="font-display mt-1 text-2xl font-bold uppercase tracking-wide text-white">
          {title}
          <span className="mt-2 block h-[3px] w-16 rounded-full bg-gradient-to-r from-gold to-transparent" />
        </h2>
      </div>
      {right}
    </div>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-white/10 bg-white/[0.01] px-4 py-10 text-center text-sm text-neutral-500">
      {children}
    </div>
  );
}
