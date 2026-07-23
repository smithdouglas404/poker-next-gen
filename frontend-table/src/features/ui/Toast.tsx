"use client";

// Shared toast helper (lifted out of OwnerPageShell during the single-shell
// refactor — a toast is not shell-specific). Same signature as before:
// `useToast()` → { toast, notify }, `notify(msg, kind="ok")`, auto-clears.

import { useState } from "react";

import { cn } from "./tokens";

export type ToastState = { msg: string; kind: "ok" | "err" } | null;

export function Toast({ toast }: { toast: ToastState }) {
  if (!toast) return null;
  return (
    <div
      className={cn(
        "fixed left-1/2 top-6 z-50 -translate-x-1/2 rounded-xl border px-4 py-2.5 text-sm shadow-lg",
        toast.kind === "ok"
          ? "border-[#22c55e]/30 bg-[#0a7d43]/25 text-[#bff5d3]"
          : "border-[#e01e2b]/35 bg-[#b3151f]/25 text-[#ffcdd1]",
      )}
    >
      {toast.msg}
    </div>
  );
}

export function useToast() {
  const [toast, setToast] = useState<ToastState>(null);
  const notify = (msg: string, kind: "ok" | "err" = "ok") => {
    setToast({ msg, kind });
    window.setTimeout(() => setToast(null), 3200);
  };
  return { toast, notify };
}
