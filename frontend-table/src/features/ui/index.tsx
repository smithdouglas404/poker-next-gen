"use client";
// ============================================================
// HIGH ROLLERS CLUB — Shared UI Primitives v2
// Premium, accessible component layer for all 109 screens.
// Built on Tailwind utilities + design tokens — no external deps.
// ============================================================
import {
  forwardRef,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import {
  BTN_GHOST,
  BTN_GOLD,
  BTN_GREEN,
  BTN_OUTLINE,
  BTN_RED,
  GLASS_PANEL,
  GLASS_PANEL_HOVER,
  HEADING_SM,
  RARITY,
  STATUS_COLORS,
  INPUT_BASE,
  SELECT_BASE,
  TABLE_CELL,
  TABLE_HEADER,
  TABLE_ROW_BASE,
  cn,
} from "./tokens";

// ── Button ───────────────────────────────────────────────────
type ButtonVariant = "primary" | "gold" | "green" | "outline" | "ghost" | "danger";
type ButtonSize    = "xs" | "sm" | "md" | "lg" | "xl";

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary: BTN_RED,
  gold:    BTN_GOLD,
  green:   BTN_GREEN,
  outline: BTN_OUTLINE,
  ghost:   BTN_GHOST,
  danger:
    "border border-[#e01e2b]/40 text-[#ff9ba1] bg-[#e01e2b]/10 " +
    "hover:bg-[#e01e2b]/20 transition-all duration-150",
};

const BUTTON_SIZES: Record<ButtonSize, string> = {
  xs: "px-2.5 py-1   text-[11px] rounded-lg  gap-1",
  sm: "px-3   py-1.5 text-xs     rounded-xl  gap-1.5",
  md: "px-4   py-2.5 text-sm     rounded-xl  gap-2",
  lg: "px-6   py-3   text-base   rounded-2xl gap-2",
  xl: "px-8   py-4   text-lg     rounded-2xl gap-2.5",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "gold", size = "md", loading, icon, className, type = "button", children, disabled, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      className={cn(
        "inline-flex items-center justify-center font-semibold uppercase tracking-wide",
        "transition-all disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none",
        BUTTON_VARIANTS[variant],
        BUTTON_SIZES[size],
        className,
      )}
      {...rest}
    >
      {loading ? (
        <span className="h-4 w-4 rounded-full border-2 border-current border-t-transparent animate-spin" />
      ) : icon ? (
        <span className="shrink-0">{icon}</span>
      ) : null}
      {children}
    </button>
  );
});

// ── Panel ────────────────────────────────────────────────────
export function Panel({
  children,
  className,
  hover,
  accent,
}: {
  children: ReactNode;
  className?: string;
  hover?: boolean;
  accent?: "gold" | "red" | "green" | "cyan" | "purple";
}) {
  const ACCENT_COLORS = {
    gold:   "from-[#f5c518]/60 to-transparent",
    red:    "from-[#e01e2b]/60 to-transparent",
    green:  "from-[#22c55e]/60 to-transparent",
    cyan:   "from-[#4a9eb0]/60 to-transparent",
    purple: "from-[#a78bfa]/60 to-transparent",
  };

  return (
    <div
      className={cn(
        "relative overflow-hidden",
        GLASS_PANEL,
        hover && GLASS_PANEL_HOVER,
        "panel-inner-glow",
        className,
      )}
    >
      {accent && (
        <div
          className={cn(
            "pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r",
            ACCENT_COLORS[accent],
          )}
        />
      )}
      {children}
    </div>
  );
}

// ── SectionHeader ────────────────────────────────────────────
export function SectionHeader({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p className={cn(HEADING_SM, "text-[#f5c518]/80 flex items-center gap-2", className)}>
      {children}
    </p>
  );
}

// ── Input ────────────────────────────────────────────────────
export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...rest }, ref) {
    return (
      <input
        ref={ref}
        className={cn(INPUT_BASE, className)}
        {...rest}
      />
    );
  },
);

// ── Textarea ─────────────────────────────────────────────────
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className, ...rest }, ref) {
    return (
      <textarea
        ref={ref}
        className={cn(INPUT_BASE, "resize-y min-h-[80px]", className)}
        {...rest}
      />
    );
  },
);

// ── Select ───────────────────────────────────────────────────
export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ className, children, ...rest }, ref) {
    return (
      <select
        ref={ref}
        className={cn(SELECT_BASE, "appearance-none cursor-pointer", className)}
        {...rest}
      >
        {children}
      </select>
    );
  },
);

// ── Field (label wrapper) ────────────────────────────────────
export function Field({
  label,
  hint,
  error,
  children,
  className,
  required,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
  className?: string;
  required?: boolean;
}) {
  return (
    <label className={cn("block space-y-1.5", className)}>
      <span className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-neutral-400">
        {label}
        {required && <span className="text-[#f5c518]">*</span>}
      </span>
      {children}
      {error && (
        <span className="flex items-center gap-1 text-[11px] text-[#ff4455]">
          <svg className="h-3 w-3 shrink-0" viewBox="0 0 12 12" fill="currentColor">
            <path d="M6 1a5 5 0 1 0 0 10A5 5 0 0 0 6 1zm0 4.5a.5.5 0 0 1 .5.5v2a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm0-2a.75.75 0 1 1 0 1.5A.75.75 0 0 1 6 3.5z"/>
          </svg>
          {error}
        </span>
      )}
      {hint && !error && (
        <span className="block text-[10px] text-neutral-600">{hint}</span>
      )}
    </label>
  );
}

// ── Badge / StatusPill ───────────────────────────────────────
type StatusKey = keyof typeof STATUS_COLORS;

export function StatusBadge({
  status,
  label,
  dot = true,
}: {
  status: StatusKey;
  label?: string;
  dot?: boolean;
}) {
  const s = STATUS_COLORS[status] ?? STATUS_COLORS.draft;
  const displayLabel = label ?? status.charAt(0).toUpperCase() + status.slice(1);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5",
        "text-[11px] font-semibold uppercase tracking-wider",
        s.text, s.border, s.bg,
      )}
    >
      {dot && (
        <span className={cn("h-1.5 w-1.5 rounded-full bg-current", status === "live" || status === "active" ? "animate-pulse" : "")} />
      )}
      {displayLabel}
    </span>
  );
}

// Generic badge
export function Badge({
  children,
  variant = "default",
  className,
}: {
  children: ReactNode;
  variant?: "default" | "gold" | "red" | "green" | "cyan" | "purple" | "outline";
  className?: string;
}) {
  const VARIANTS = {
    default: "bg-white/[0.07] text-neutral-300 border-white/10",
    gold:    "bg-[#f5c518]/[0.12] text-[#f5c518] border-[#f5c518]/30",
    red:     "bg-[#e01e2b]/[0.12] text-[#ff4455] border-[#e01e2b]/30",
    green:   "bg-[#22c55e]/[0.10] text-[#22c55e] border-[#22c55e]/30",
    cyan:    "bg-[#4a9eb0]/[0.10] text-[#4a9eb0] border-[#4a9eb0]/30",
    purple:  "bg-[#a78bfa]/[0.10] text-[#a78bfa] border-[#a78bfa]/30",
    outline: "bg-transparent text-neutral-300 border-white/20",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5",
        "text-[11px] font-semibold uppercase tracking-wider",
        VARIANTS[variant],
        className,
      )}
    >
      {children}
    </span>
  );
}

// ── RarityBadge ──────────────────────────────────────────────
type RarityKey = keyof typeof RARITY;

export function RarityBadge({ rarity }: { rarity: RarityKey }) {
  const r = RARITY[rarity];
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5",
        "text-[11px] font-semibold uppercase tracking-wider",
        r.text, r.border, r.bg,
      )}
      style={{ boxShadow: `0 0 10px ${r.glow}` }}
    >
      {r.label}
    </span>
  );
}

// ── Spinner ──────────────────────────────────────────────────
export function Spinner({ size = "md", className }: { size?: "sm" | "md" | "lg"; className?: string }) {
  const SIZES = { sm: "h-4 w-4 border-2", md: "h-6 w-6 border-2", lg: "h-10 w-10 border-[3px]" };
  return (
    <span
      className={cn(
        "inline-block rounded-full border-white/20 border-t-[#f5c518] animate-spin",
        SIZES[size],
        className,
      )}
    />
  );
}

// ── LoadingOverlay ───────────────────────────────────────────
export function LoadingOverlay({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex min-h-[200px] flex-col items-center justify-center gap-3">
      <Spinner size="lg" />
      <p className="text-sm text-neutral-500 animate-pulse">{label}</p>
    </div>
  );
}

// ── EmptyState ───────────────────────────────────────────────
export function EmptyState({
  icon,
  title,
  body,
  action,
}: {
  icon?: ReactNode;
  title: string;
  body?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
      {icon && (
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-white/[0.07] bg-white/[0.03] text-neutral-500">
          {icon}
        </div>
      )}
      <div className="space-y-1.5">
        <p className="text-base font-semibold text-neutral-200">{title}</p>
        {body && <p className="max-w-xs text-sm text-neutral-500">{body}</p>}
      </div>
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

// ── Stat card ────────────────────────────────────────────────
export function StatCard({
  label,
  value,
  sub,
  accent,
  icon,
  trend,
}: {
  label: string;
  value: ReactNode;
  sub?: string;
  accent?: "gold" | "green" | "red" | "cyan";
  icon?: ReactNode;
  trend?: { value: string; up: boolean };
}) {
  const ACCENT_TEXT = {
    gold:  "text-[#f5c518]",
    green: "text-[#22c55e]",
    red:   "text-[#ff4455]",
    cyan:  "text-[#4a9eb0]",
  };
  const ACCENT_BAR = {
    gold:  "from-[#f5c518]/60 to-transparent",
    green: "from-[#22c55e]/60 to-transparent",
    red:   "from-[#e01e2b]/60 to-transparent",
    cyan:  "from-[#4a9eb0]/60 to-transparent",
  };

  return (
    <div className={cn(GLASS_PANEL, "relative overflow-hidden p-5 panel-inner-glow")}>
      {accent && (
        <div className={cn("pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r", ACCENT_BAR[accent])} />
      )}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-neutral-500">{label}</p>
          <p className={cn("mt-1.5 text-2xl font-bold tabular-nums", accent ? ACCENT_TEXT[accent] : "text-white")}>
            {value}
          </p>
          {sub && <p className="mt-0.5 text-xs text-neutral-500">{sub}</p>}
          {trend && (
            <p className={cn("mt-1 text-xs font-semibold", trend.up ? "text-[#22c55e]" : "text-[#ff4455]")}>
              {trend.up ? "▲" : "▼"} {trend.value}
            </p>
          )}
        </div>
        {icon && (
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/[0.07] bg-white/[0.04] text-neutral-400">
            {icon}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Divider ──────────────────────────────────────────────────
export function Divider({ label, className }: { label?: string; className?: string }) {
  if (!label) return <hr className={cn("border-white/[0.07]", className)} />;
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <hr className="flex-1 border-white/[0.07]" />
      <span className="text-[11px] font-semibold uppercase tracking-wider text-neutral-600">{label}</span>
      <hr className="flex-1 border-white/[0.07]" />
    </div>
  );
}

// ── Table primitives ─────────────────────────────────────────
export function DataTable({
  headers,
  children,
  className,
}: {
  headers: string[];
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("overflow-x-auto", className)}>
      <table className="w-full text-left">
        <thead>
          <tr className="border-b border-white/[0.07]">
            {headers.map((h) => (
              <th key={h} className={TABLE_HEADER}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export function TableRow({ children, className }: { children: ReactNode; className?: string }) {
  return <tr className={cn(TABLE_ROW_BASE, className)}>{children}</tr>;
}

export function TableCell({ children, className }: { children: ReactNode; className?: string }) {
  return <td className={cn(TABLE_CELL, className)}>{children}</td>;
}

// ── Progress bar ─────────────────────────────────────────────
export function ProgressBar({
  value,
  max = 100,
  accent = "gold",
  label,
  showPct,
  className,
}: {
  value: number;
  max?: number;
  accent?: "gold" | "green" | "red" | "cyan" | "purple";
  label?: string;
  showPct?: boolean;
  className?: string;
}) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100));
  const FILL = {
    gold:   "bg-gradient-to-r from-[#f5c518] to-[#ffe066]",
    green:  "bg-gradient-to-r from-[#22c55e] to-[#34d972]",
    red:    "bg-gradient-to-r from-[#e01e2b] to-[#ff4455]",
    cyan:   "bg-gradient-to-r from-[#4a9eb0] to-[#6ec6d8]",
    purple: "bg-gradient-to-r from-[#a78bfa] to-[#c4b5fd]",
  };
  return (
    <div className={cn("space-y-1.5", className)}>
      {(label || showPct) && (
        <div className="flex items-center justify-between">
          {label && <span className="text-xs text-neutral-400">{label}</span>}
          {showPct && <span className="text-xs font-semibold text-neutral-300">{pct.toFixed(0)}%</span>}
        </div>
      )}
      <div className="h-2 overflow-hidden rounded-full bg-white/[0.07]">
        <div
          className={cn("h-full rounded-full transition-all duration-500", FILL[accent])}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

// ── Avatar ───────────────────────────────────────────────────
export function Avatar({
  src,
  name,
  size = "md",
  online,
}: {
  src?: string | null;
  name?: string;
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  online?: boolean;
}) {
  const SIZES = {
    xs: "h-6 w-6 text-[10px]",
    sm: "h-8 w-8 text-xs",
    md: "h-10 w-10 text-sm",
    lg: "h-14 w-14 text-base",
    xl: "h-20 w-20 text-xl",
  };
  const DOT_SIZES = { xs: "h-1.5 w-1.5", sm: "h-2 w-2", md: "h-2.5 w-2.5", lg: "h-3 w-3", xl: "h-4 w-4" };
  const initials = name
    ? name.split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase()
    : "?";

  return (
    <div className="relative inline-flex shrink-0">
      <div
        className={cn(
          "flex items-center justify-center rounded-full border border-white/[0.10] bg-[#222a38] font-semibold text-neutral-300 overflow-hidden",
          SIZES[size],
        )}
      >
        {src ? (
          <img src={src} alt={name ?? "avatar"} className="h-full w-full object-cover" />
        ) : (
          initials
        )}
      </div>
      {online !== undefined && (
        <span
          className={cn(
            "absolute bottom-0 right-0 rounded-full border-2 border-[#0f1318]",
            DOT_SIZES[size],
            online ? "bg-[#22c55e]" : "bg-neutral-600",
          )}
        />
      )}
    </div>
  );
}

// ── Tooltip wrapper (simple hover title) ────────────────────
export function Tooltip({ children, tip, className }: { children: ReactNode; tip: string; className?: string }) {
  return (
    <div className={cn("group relative inline-flex", className)}>
      {children}
      <div className="pointer-events-none absolute bottom-full left-1/2 mb-2 -translate-x-1/2 whitespace-nowrap rounded-lg border border-white/[0.10] bg-[#2a3344] px-2.5 py-1.5 text-[11px] text-neutral-200 opacity-0 shadow-xl transition-opacity group-hover:opacity-100">
        {tip}
        <div className="absolute left-1/2 top-full -translate-x-1/2 border-4 border-transparent border-t-[#2a3344]" />
      </div>
    </div>
  );
}

// ── Modal shell ──────────────────────────────────────────────
export function Modal({
  open,
  onClose,
  title,
  children,
  width = "max-w-lg",
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  width?: string;
}) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div
        className={cn(
          "relative w-full animate-scale-in",
          "rounded-2xl border border-white/[0.10] bg-[#1a2030] shadow-[0_24px_80px_rgba(0,0,0,0.7)]",
          "panel-inner-glow",
          width,
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {title && (
          <div className="flex items-center justify-between border-b border-white/[0.07] px-6 py-4">
            <h3 className="font-display text-base font-bold uppercase tracking-wide text-white">{title}</h3>
            <button
              onClick={onClose}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-neutral-500 transition hover:bg-white/[0.06] hover:text-white"
            >
              <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M2 2l12 12M14 2L2 14" />
              </svg>
            </button>
          </div>
        )}
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}

// ── Callout / Alert banner ───────────────────────────────────
export function Callout({
  variant = "info",
  title,
  children,
  className,
}: {
  variant?: "info" | "success" | "warning" | "error";
  title?: string;
  children: ReactNode;
  className?: string;
}) {
  const STYLES = {
    info:    { border: "border-[#4a9eb0]/30", bg: "bg-[#4a9eb0]/[0.07]", icon: "ℹ", text: "text-[#4a9eb0]" },
    success: { border: "border-[#22c55e]/30", bg: "bg-[#22c55e]/[0.07]", icon: "✓", text: "text-[#22c55e]" },
    warning: { border: "border-[#f5c518]/30", bg: "bg-[#f5c518]/[0.07]", icon: "⚠", text: "text-[#f5c518]" },
    error:   { border: "border-[#e01e2b]/30", bg: "bg-[#e01e2b]/[0.07]", icon: "✕", text: "text-[#ff4455]" },
  };
  const s = STYLES[variant];
  return (
    <div className={cn("flex gap-3 rounded-xl border p-4", s.border, s.bg, className)}>
      <span className={cn("mt-0.5 shrink-0 text-sm font-bold", s.text)}>{s.icon}</span>
      <div className="min-w-0">
        {title && <p className={cn("text-sm font-semibold", s.text)}>{title}</p>}
        <div className="mt-0.5 text-sm text-neutral-300">{children}</div>
      </div>
    </div>
  );
}

// ── Re-export cn ─────────────────────────────────────────────
export { cn } from "./tokens";
