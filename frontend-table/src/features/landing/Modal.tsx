"use client";

import { useEffect, type ReactNode } from "react";

import { GLASS_PANEL, HEADING_SM, cn } from "@/features/ui/tokens";

// Screen-local glass modal for the landing surface (support + recovery + legal).
// Composes the shared glass tokens; does not re-invent panel styling.

export function Modal({
  open,
  onClose,
  title,
  eyebrow,
  children,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  eyebrow?: string;
  children: ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-black/70 px-4 py-10 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className={cn(GLASS_PANEL, "relative w-full p-6 sm:p-8", wide ? "max-w-2xl" : "max-w-md")}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-4 top-4 rounded-lg border border-white/10 px-2 py-1 text-xs text-neutral-400 transition hover:border-white/25 hover:text-white"
        >
          Esc
        </button>
        {eyebrow && <p className={cn(HEADING_SM, "text-gold/80")}>{eyebrow}</p>}
        <h2 className="font-display mt-1 text-2xl font-bold uppercase tracking-wide text-foreground">
          {title}
        </h2>
        <div className="mt-5">{children}</div>
      </div>
    </div>
  );
}

/** Inline status line shown inside dialogs (ok / error / info). */
export function StatusLine({ kind, children }: { kind: "ok" | "err"; children: ReactNode }) {
  return (
    <p
      className={cn(
        "rounded-xl border px-3 py-2 text-xs",
        kind === "ok"
          ? "border-emerald-500/30 bg-emerald-950/40 text-emerald-200"
          : "border-red-500/30 bg-red-950/40 text-red-200",
      )}
    >
      {children}
    </p>
  );
}
