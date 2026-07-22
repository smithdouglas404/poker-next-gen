"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState, type ReactNode } from "react";

import { GLASS_PANEL, cn } from "@/features/ui/tokens";

// ---- Toast ----

export interface ToastState {
  msg: string;
  kind: "ok" | "err";
}

export function useToast() {
  const [toast, setToast] = useState<ToastState | null>(null);
  const notify = useCallback((msg: string, kind: "ok" | "err" = "ok") => {
    setToast({ msg, kind });
    window.setTimeout(() => setToast(null), 3400);
  }, []);
  return { toast, notify };
}

export function Toast({ toast }: { toast: ToastState | null }) {
  if (!toast) return null;
  return (
    <div
      className={cn(
        "fixed left-1/2 top-4 z-[60] -translate-x-1/2 rounded-xl border px-4 py-2.5 text-sm shadow-lg backdrop-blur-xl",
        toast.kind === "ok"
          ? "border-emerald-500/30 bg-emerald-950/50 text-emerald-200"
          : "border-red-500/30 bg-red-950/50 text-red-200",
      )}
    >
      {toast.msg}
    </div>
  );
}

// ---- Typography ----

export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p
      className={cn(
        "font-display text-[11px] font-bold uppercase tracking-[0.3em] text-gold/80",
        className,
      )}
    >
      {children}
    </p>
  );
}

export function GoldHeading({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <h1
      className={cn(
        "font-display bg-gradient-to-b from-[#f3e2ad] via-[#d4af37] to-[#9a7b2c] bg-clip-text",
        "font-bold uppercase tracking-wider text-transparent",
        className,
      )}
    >
      {children}
    </h1>
  );
}

// ---- Social shell: shared header + segmented nav across the three routes ----

const TABS: Array<{ href: string; label: string }> = [
  { href: "/alliances", label: "Alliances" },
  { href: "/leagues", label: "Leagues" },
  { href: "/clubwars", label: "Club Wars" },
];

export function SocialShell({
  eyebrow,
  title,
  subtitle,
  children,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  const pathname = usePathname();
  return (
    <div className="min-h-screen text-foreground">
      <header className="border-b border-white/[0.06] px-6 pb-5 pt-8">
        <div className="mx-auto max-w-6xl">
          <div className="flex items-start justify-between gap-4">
            <div>
              <Eyebrow>{eyebrow}</Eyebrow>
              <GoldHeading className="mt-1 text-3xl sm:text-4xl">{title}</GoldHeading>
              <p className="mt-2 max-w-2xl text-sm text-neutral-400">{subtitle}</p>
            </div>
            <Link
              href="/hub"
              className="shrink-0 text-sm text-neutral-400 transition hover:text-white"
            >
              ← Command Center
            </Link>
          </div>
          <nav className="mt-5 inline-flex gap-1 rounded-xl border border-white/[0.06] bg-[#262d38] p-1">
            {TABS.map((t) => {
              const active = pathname === t.href;
              return (
                <Link
                  key={t.href}
                  href={t.href}
                  className={cn(
                    "font-display rounded-lg px-4 py-2 text-[12px] font-bold uppercase tracking-wider transition",
                    active
                      ? "bg-brand/15 text-brand"
                      : "text-neutral-400 hover:text-white",
                  )}
                >
                  {t.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl space-y-6 px-6 py-8">{children}</main>
    </div>
  );
}

// ---- Status badge ----

const STATUS_TONE: Record<string, string> = {
  registering: "border-brand/30 bg-brand/10 text-brand",
  pending: "border-amber-400/30 bg-amber-400/10 text-amber-300",
  active: "border-emerald-400/30 bg-emerald-400/10 text-emerald-300",
  completed: "border-white/15 bg-white/5 text-neutral-400",
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.15em]",
        STATUS_TONE[status] ?? "border-white/15 bg-white/5 text-neutral-400",
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {status}
    </span>
  );
}

// ---- Empty / loading states ----

export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-white/10 bg-white/[0.01] px-4 py-10 text-center text-sm text-neutral-500">
      {children}
    </div>
  );
}

export function SectionCard({
  children,
  className,
  hover,
}: {
  children: ReactNode;
  className?: string;
  hover?: boolean;
}) {
  return (
    <div
      className={cn(
        GLASS_PANEL,
        hover && "transition-all duration-300 hover:border-white/20",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function CardLabel({ children }: { children: ReactNode }) {
  return (
    <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/50">
      {children}
    </span>
  );
}

// ---- Modal ----

export function Modal({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div
        className={cn(
          GLASS_PANEL,
          "relative z-10 w-full max-w-md p-6 shadow-[0_0_40px_rgba(0,0,0,0.6)]",
        )}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-lg font-bold uppercase tracking-wider text-white">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-neutral-500 transition hover:text-white"
            aria-label="Close"
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/** Build a stable club id → display name resolver. */
export function useClubNames(clubs: Array<{ id: string; name: string }>) {
  return useCallback(
    (id: string) => clubs.find((c) => c.id === id)?.name ?? `Club ${id.slice(0, 6)}`,
    [clubs],
  );
}
