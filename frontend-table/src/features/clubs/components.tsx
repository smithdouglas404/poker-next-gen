"use client";

import type { ReactNode } from "react";

import { avatarDef, avatarForKey, avatarGradient, avatarSrc } from "@/features/table/avatars";
import { GLASS_PANEL, cn } from "@/features/ui/tokens";

const ROLE_COLOR: Record<string, string> = {
  owner: "#f5c518",
  admin: "#22c55e",
  manager: "#22c55e",
  member: "rgba(255,255,255,0.5)",
};

export function roleColor(role: string): string {
  return ROLE_COLOR[role.toLowerCase()] ?? ROLE_COLOR.member;
}

/** Circular member portrait derived deterministically from the user id/username,
 * with a role/neon ring and a graceful monogram-gradient fallback on 404. */
export function MemberAvatar({
  seed,
  name,
  size = 48,
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
      className="relative shrink-0 overflow-hidden rounded-xl"
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

export function StatusDot({ online }: { online: boolean }) {
  const c = online ? "#22c55e" : "#f5c518";
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-white/70">
      <span className="inline-block h-2 w-2 rounded-full" style={{ background: c, boxShadow: `0 0 8px ${c}` }} />
      {online ? "Online" : "Away"}
    </span>
  );
}

export function StatTile({
  label,
  value,
  accent = "#f5f6f7",
  sub,
}: {
  label: string;
  value: ReactNode;
  accent?: string;
  sub?: string;
}) {
  return (
    <div
      className="relative overflow-hidden rounded-2xl p-4 shadow-[0_2px_12px_rgba(0,0,0,0.40)] transition hover:-translate-y-0.5"
      style={{
        background: `${accent}08`,
        border: `1px solid ${accent}20`,
      }}
    >
      <div className="absolute inset-x-0 top-0 h-px" style={{ background: `linear-gradient(90deg,transparent,${accent}50,transparent)` }} />
      <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-neutral-500">{label}</p>
      <p className="font-display mt-1.5 text-2xl font-bold leading-none" style={{ color: accent }}>
        {value}
      </p>
      {sub && <p className="mt-1 text-[11px] text-neutral-500">{sub}</p>}
    </div>
  );
}

export function CardHeader({ children, badge }: { children: ReactNode; badge?: ReactNode }) {
  return (
    <div className="mb-4 flex items-center justify-between">
      <span className="font-display text-xs font-bold uppercase tracking-[0.25em] text-white/60">{children}</span>
      {badge}
    </div>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-white/[0.08] bg-white/[0.01] px-6 py-10 text-center">
      <p className="text-sm text-neutral-500">{children}</p>
    </div>
  );
}

const SEVERITY: Record<string, string> = {
  critical: "#e01e2b",
  warning: "#f5c518",
  info: "#4a9eb0",
};

export function severityColor(s: string): string {
  return SEVERITY[s?.toLowerCase()] ?? SEVERITY.info;
}
