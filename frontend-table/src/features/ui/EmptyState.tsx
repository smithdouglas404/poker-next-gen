"use client";

// The honest replacements for fabricated data.
//
// Three distinct states, because collapsing them is what let demo data creep in:
//   Loading  — the call is in flight; say so, don't render zeros.
//   Failed   — the call errored; say THAT, and offer a retry.
//   Empty    — the call succeeded and there is genuinely nothing yet; say what
//              would put something here.
// A screen that cannot tell "no members" from "couldn't reach the server" will
// eventually paper over one with the other.

import Link from "next/link";
import { GLASS_PANEL, HEADING_SM, cn } from "@/features/ui/tokens";

interface BaseProps {
  className?: string;
}

export function LoadingState({ label = "Loading…", className }: BaseProps & { label?: string }) {
  return (
    <div className={cn(GLASS_PANEL, "flex min-h-32 items-center justify-center p-8", className)}>
      <p className="text-sm text-neutral-500">{label}</p>
    </div>
  );
}

export function FailedState({
  message,
  onRetry,
  className,
}: BaseProps & { message?: string; onRetry?: () => void }) {
  return (
    <div
      className={cn(
        "flex min-h-32 flex-col items-center justify-center gap-3 rounded-xl border border-[#e01e2b]/25 bg-[#e01e2b]/[0.05] p-8 text-center",
        className,
      )}
    >
      <p className={cn(HEADING_SM, "text-[#ff2d3f]")}>Couldn&apos;t load</p>
      <p className="max-w-sm text-[13px] text-neutral-400">
        {message || "We couldn't reach the server. Nothing is shown rather than showing figures we can't confirm."}
      </p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="rounded-lg border border-white/15 px-4 py-1.5 text-xs font-semibold text-neutral-200 transition hover:border-white/30 hover:bg-white/5"
        >
          Try again
        </button>
      )}
    </div>
  );
}

export function EmptyState({
  title,
  body,
  actionLabel,
  actionHref,
  onAction,
  className,
}: BaseProps & {
  title: string;
  body?: string;
  actionLabel?: string;
  actionHref?: string;
  onAction?: () => void;
}) {
  return (
    <div
      className={cn(
        GLASS_PANEL,
        "flex min-h-32 flex-col items-center justify-center gap-3 p-8 text-center",
        className,
      )}
    >
      <p className={cn(HEADING_SM, "text-neutral-300")}>{title}</p>
      {body && <p className="max-w-sm text-[13px] text-neutral-500">{body}</p>}
      {actionLabel && actionHref && (
        <Link
          href={actionHref}
          className="rounded-lg border border-gold/30 px-4 py-1.5 text-xs font-semibold text-gold transition hover:border-gold/60 hover:bg-gold/10"
        >
          {actionLabel}
        </Link>
      )}
      {actionLabel && !actionHref && onAction && (
        <button
          type="button"
          onClick={onAction}
          className="rounded-lg border border-gold/30 px-4 py-1.5 text-xs font-semibold text-gold transition hover:border-gold/60 hover:bg-gold/10"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}

/**
 * The badge every surface must show when it IS rendering the opt-in showcase
 * dataset, so a demo screenshot can never be mistaken for live figures.
 */
export function DemoBadge({ className }: BaseProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-amber-400/40 bg-amber-400/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-amber-300",
        className,
      )}
    >
      Demo data — not live
    </span>
  );
}
