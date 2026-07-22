"use client";

import Link from "next/link";
import { useCallback, useState } from "react";

import { AccountRecoveryCenter } from "@/features/profile/AccountRecoveryCenter";
import { TwoFactorSetup } from "@/features/profile/TwoFactorSetup";
import { HEADING_SM, cn } from "@/features/ui/tokens";

type State = "2fa" | "recovery";
type Toast = { msg: string; kind: "ok" | "err" };

const STATES: { id: State; label: string }[] = [
  { id: "2fa", label: "2FA Setup" },
  { id: "recovery", label: "Account Recovery" },
];

export default function SecurityPage() {
  const [state, setState] = useState<State>("2fa");
  const [toast, setToast] = useState<Toast | null>(null);

  const notify = useCallback((msg: string, kind: "ok" | "err" = "ok") => {
    setToast({ msg, kind });
    window.setTimeout(() => setToast(null), 3800);
  }, []);

  return (
    <main className="min-h-screen bg-background text-foreground">
      {toast && (
        <div
          className={cn(
            "fixed left-1/2 top-4 z-50 -translate-x-1/2 rounded-xl border px-4 py-2.5 text-sm backdrop-blur-xl",
            toast.kind === "ok"
              ? "border-emerald-500/30 bg-emerald-950/40 text-emerald-200"
              : "border-red-500/30 bg-red-950/40 text-red-200",
          )}
          role="status"
        >
          {toast.msg}
        </div>
      )}

      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:py-12">
        <div className="flex items-center justify-between">
          <p className={cn(HEADING_SM, "text-gold/80")}>Comprehensive Player Security Dashboard</p>
          <Link
            href="/profile"
            className="text-xs uppercase tracking-widest text-neutral-500 hover:text-foreground"
          >
            ← Back to profile
          </Link>
        </div>

        {/* State selector */}
        <nav className="mt-5 inline-flex rounded-xl border border-white/[0.08] bg-black/30 p-1">
          {STATES.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setState(s.id)}
              className={cn(
                "rounded-lg px-4 py-2 text-sm font-semibold uppercase tracking-wide transition",
                state === s.id
                  ? "bg-gradient-to-b from-[#ffd54a] via-[#f5c518] to-[#d4a80f] text-[#231b00] shadow-[0_2px_10px_-2px_rgba(245,197,24,0.4)]"
                  : "text-neutral-400 hover:text-foreground",
              )}
            >
              {s.label}
            </button>
          ))}
        </nav>

        <div className="mt-6">
          {state === "2fa" ? (
            <TwoFactorSetup notify={notify} onClose={() => setState("recovery")} />
          ) : (
            <AccountRecoveryCenter notify={notify} />
          )}
        </div>
      </div>
    </main>
  );
}
