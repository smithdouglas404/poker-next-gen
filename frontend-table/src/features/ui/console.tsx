"use client";

/**
 * Console primitives — the composition layer the material ramp exists for.
 *
 * Before this, a screen had exactly one surface (`GLASS_PANEL`) and hand-rolled
 * markup for everything else: 40px table rows written inline per screen, status
 * chips re-invented per file, money rendered without `tabular-nums` so columns
 * jittered. These components make the ramp and the scale the default rather
 * than something each screen has to remember.
 *
 * Nothing here fetches. Every component takes data and renders it — the RPC
 * stays in the screen, so a control cannot end up on-screen without a caller
 * having wired it (CLAUDE.md non-negotiable 4).
 */

import type { ReactNode } from "react";

import {
  GOLD_RULE,
  PAGE_TITLE,
  PANEL_TITLE,
  RAISED,
  TABULAR,
  TEXT_EYEBROW,
  WELL,
  cn,
} from "@/features/ui/tokens";

/* ── headings ───────────────────────────────────────────────────────────── */

/** 34px page title over a 2px gold rule. One per screen. */
export function PageHeading({
  title,
  sub,
  actions,
}: {
  title: ReactNode;
  sub?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className={PAGE_TITLE}>{title}</h1>
        <div className={cn(GOLD_RULE, "mt-3")} />
        {sub && <p className="mt-3 max-w-[76ch] text-[13.5px] leading-relaxed text-muted">{sub}</p>}
      </div>
      {actions && <div className="flex items-center gap-2.5">{actions}</div>}
    </div>
  );
}

/** 20px panel heading with an optional right-hand note. One per panel. */
export function SectionHeading({ children, note }: { children: ReactNode; note?: ReactNode }) {
  return (
    <div className="mb-4 flex items-baseline justify-between gap-3">
      <h2 className={PANEL_TITLE}>{children}</h2>
      {note && <span className="text-[11.5px] text-white/40">{note}</span>}
    </div>
  );
}

/* ── status ─────────────────────────────────────────────────────────────── */

export type PillTone = "ok" | "wait" | "off" | "danger";

const PILL: Record<PillTone, string> = {
  ok: "text-green border-green/40 bg-green/10",
  wait: "text-gold-lite border-gold/40 bg-gold/10",
  off: "text-white/45 border-white/10 bg-white/[0.03]",
  danger: "text-brand-bright border-brand/45 bg-brand/10",
};

export function StatusPill({ tone = "off", children }: { tone?: PillTone; children: ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1",
        "font-display text-[10px] font-bold uppercase tracking-[0.12em]",
        PILL[tone],
      )}
    >
      {children}
    </span>
  );
}

/* ── framed panel (gold corner brackets) ────────────────────────────────── */

/**
 * M2 panel with the comps' gold corner brackets. Ornament is restrained and
 * structural — it frames a form, it is not decoration sprinkled on cards.
 */
export function FramedPanel({
  children,
  className,
  title,
}: {
  children: ReactNode;
  className?: string;
  title?: ReactNode;
}) {
  const arm = "pointer-events-none absolute h-[18px] w-[18px] border-gold-orn/55";
  return (
    <div
      className={cn(
        "relative rounded-xl border border-gold-orn/[0.18] bg-surface p-7",
        "shadow-[0_2px_12px_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,255,255,0.06)]",
        className,
      )}
    >
      <span className={cn(arm, "left-2 top-2 rounded-tl border-l-2 border-t-2")} />
      <span className={cn(arm, "bottom-2 right-2 rounded-br border-b-2 border-r-2")} />
      {title && <SectionHeading>{title}</SectionHeading>}
      {children}
    </div>
  );
}

/* ── data table ─────────────────────────────────────────────────────────── */

export interface Column<T> {
  key: string;
  header: ReactNode;
  /** Right-align and apply tabular-nums. Use for every money and count column. */
  numeric?: boolean;
  cell: (row: T) => ReactNode;
  width?: string;
}

/**
 * The roster/ledger table. 56px rows in an M4 well with a sticky header.
 *
 * Rows were 40px and hand-rolled per screen, and money columns were rendered
 * as ordinary text so digits jittered between rows. `numeric` is the fix and it
 * is opt-in per column rather than guessed from the value.
 */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  empty = "Nothing here yet.",
}: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T, i: number) => string;
  empty?: ReactNode;
}) {
  return (
    <div className={cn(WELL, "overflow-x-auto")}>
      <table className="w-full border-collapse text-[13.5px]">
        <thead>
          <tr>
            {columns.map((c) => (
              <th
                key={c.key}
                style={c.width ? { width: c.width } : undefined}
                className={cn(
                  "sticky top-0 z-10 border-b border-white/[0.07] bg-black/25 px-4 py-3",
                  "font-display text-[10px] font-bold uppercase tracking-[0.2em] text-white/40",
                  c.numeric ? "text-right" : "text-left",
                )}
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="px-4 py-10 text-center text-[13px] text-white/40">
                {empty}
              </td>
            </tr>
          ) : (
            rows.map((r, i) => (
              <tr key={rowKey(r, i)} className="group transition-colors hover:bg-white/[0.02]">
                {columns.map((c) => (
                  <td
                    key={c.key}
                    className={cn(
                      "h-14 border-b border-white/[0.05] px-4 align-middle text-muted last:border-b-0",
                      c.numeric && cn("text-right", TABULAR),
                    )}
                  >
                    {c.cell(r)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

/** Name + secondary line, with an optional avatar. The roster's first column. */
export function IdentityCell({
  name,
  sub,
  avatar,
}: {
  name: ReactNode;
  sub?: ReactNode;
  avatar?: ReactNode;
}) {
  return (
    <div className="flex items-center gap-3">
      {avatar}
      <div className="min-w-0">
        <div className="truncate font-semibold text-foreground">{name}</div>
        {sub && <div className="truncate text-[11.5px] text-white/40">{sub}</div>}
      </div>
    </div>
  );
}

/* ── forms ──────────────────────────────────────────────────────────────── */

/** 2- or 4-column form grid. Collapses to one column below md. */
export function FormGrid({
  cols = 2,
  children,
  className,
}: {
  cols?: 2 | 3 | 4;
  children: ReactNode;
  className?: string;
}) {
  const map = { 2: "md:grid-cols-2", 3: "md:grid-cols-3", 4: "md:grid-cols-4" } as const;
  return <div className={cn("grid grid-cols-1 gap-x-7 gap-y-4", map[cols], className)}>{children}</div>;
}

/** Label + control row used inside a settings panel. */
export function ToggleRow({
  label,
  hint,
  checked,
  onChange,
  disabled,
}: {
  label: ReactNode;
  hint?: ReactNode;
  checked: boolean;
  onChange?: (next: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-white/[0.06] py-3 last:border-b-0">
      <div className="min-w-0">
        <div className="text-[13px] font-semibold text-muted">{label}</div>
        {hint && <div className="mt-0.5 text-[11.5px] text-white/35">{hint}</div>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={typeof label === "string" ? label : undefined}
        disabled={disabled || !onChange}
        onClick={() => onChange?.(!checked)}
        className={cn(
          "relative h-6 w-11 flex-none rounded-full transition-colors",
          checked ? "bg-gradient-to-r from-gold-lite to-gold" : "bg-white/10",
          disabled || !onChange ? "cursor-not-allowed opacity-50" : "cursor-pointer",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 h-5 w-5 rounded-full transition-all",
            checked ? "left-[22px] bg-[#1a1206]" : "left-0.5 bg-white/70",
          )}
        />
      </button>
    </div>
  );
}

/**
 * A control that is stored but not enforced by the server says so, here, rather
 * than reading as live. `COMPLETENESS.md` records several of these; a screen
 * that hides the distinction is the "looks finished, does nothing" failure the
 * repo already paid for once.
 */
export function PolicyNote({ children }: { children: ReactNode }) {
  return (
    <p className="mt-3 border-l-2 border-gold-orn/35 pl-3 text-[11.5px] italic leading-relaxed text-white/35">
      {children}
    </p>
  );
}

/* ── modal ──────────────────────────────────────────────────────────────── */

/** M3 dialog over a blurred scrim. */
export function Modal({
  open,
  onClose,
  title,
  children,
  width = 560,
}: {
  open: boolean;
  onClose?: () => void;
  title?: ReactNode;
  children: ReactNode;
  width?: number;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-md"
        onClick={onClose}
        aria-hidden
      />
      <div
        role="dialog"
        aria-modal="true"
        style={{ width }}
        className={cn(RAISED, "relative max-h-[88vh] w-full overflow-y-auto p-8")}
      >
        {title && <SectionHeading>{title}</SectionHeading>}
        {children}
      </div>
    </div>
  );
}

/* ── activity rail ──────────────────────────────────────────────────────── */

export interface RailAlert {
  id: string;
  title: string;
  body?: string;
  at?: string;
}

export interface RailMessage {
  id: string;
  who: string;
  body: string;
}

/**
 * The third column every club comp has and the app did not: alerts over a live
 * chat with a pinned composer.
 *
 * This is a lift, not a new feature — `Overview.tsx` already had the rail built
 * inline, and `OwnerCenter.tsx` had a second copy of it. Hoisting it here is
 * what stops a third from being written.
 */
export function ActivityRail({
  alerts,
  messages,
  draft,
  onDraft,
  onSend,
  sending,
  note,
}: {
  alerts: RailAlert[];
  messages: RailMessage[];
  draft: string;
  onDraft: (v: string) => void;
  onSend: () => void;
  sending?: boolean;
  note?: ReactNode;
}) {
  return (
    <aside className="flex w-full flex-col gap-4 lg:w-80 lg:flex-none">
      <div className="rounded-xl border border-gold-orn/[0.18] bg-surface p-5 shadow-[0_2px_12px_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,255,255,0.06)]">
        <p className={cn(TEXT_EYEBROW, "mb-3 text-gold-lite")}>Tournament Alerts</p>
        {alerts.length === 0 ? (
          <p className="text-[12px] text-white/35">Nothing right now.</p>
        ) : (
          <ul className="space-y-2">
            {alerts.slice(0, 5).map((a) => (
              <li key={a.id} className={cn(WELL, "px-3.5 py-2.5")}>
                <p className="text-[12.5px] font-semibold text-foreground">{a.title}</p>
                {a.body && <p className="mt-0.5 text-[11.5px] text-white/45">{a.body}</p>}
                {a.at && <p className="mt-1 text-[10.5px] text-white/30">{a.at}</p>}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex min-h-0 flex-1 flex-col rounded-xl border border-gold-orn/[0.18] bg-surface p-5 shadow-[0_2px_12px_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,255,255,0.06)]">
        <p className={cn(TEXT_EYEBROW, "mb-3 text-gold-lite")}>Global Club Chat</p>
        <div className={cn(WELL, "min-h-[160px] flex-1 space-y-3 overflow-y-auto p-3.5")}>
          {messages.length === 0 ? (
            <p className="text-[12px] text-white/35">No messages yet.</p>
          ) : (
            messages.map((m) => (
              <div key={m.id}>
                <p className="text-[11px] font-bold text-gold-lite">{m.who}</p>
                <p className="text-[12.5px] leading-snug text-muted">{m.body}</p>
              </div>
            ))
          )}
        </div>
        <div className="mt-3 flex gap-2">
          <input
            value={draft}
            onChange={(e) => onDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                onSend();
              }
            }}
            placeholder="Type a message…"
            className="min-w-0 flex-1 rounded-lg border border-white/10 bg-black/25 px-3 py-2 text-[13px] text-foreground outline-none placeholder:text-white/25 focus:border-gold/40"
          />
          <button
            type="button"
            onClick={onSend}
            disabled={sending || !draft.trim()}
            className="flex-none rounded-lg bg-gradient-to-b from-gold-lite via-gold to-[#d4a80f] px-4 text-[12px] font-bold text-[#231b00] transition disabled:cursor-not-allowed disabled:opacity-40"
          >
            Send
          </button>
        </div>
        {note && <p className="mt-2 text-[10.5px] text-white/30">{note}</p>}
      </div>
    </aside>
  );
}
