"use client";

import Link from "next/link";
import { useCallback, useState } from "react";

import { cn } from "@/features/ui/tokens";
import { FairnessDashboard } from "@/features/audit/FairnessDashboard";
import { SeedReveal } from "@/features/audit/SeedReveal";
import { HandAudit } from "@/features/audit/HandAudit";

type Tab = "dashboard" | "reveal" | "audit";

const TABS: { id: Tab; label: string }[] = [
  { id: "dashboard", label: "Audit Log" },
  { id: "reveal", label: "Seed Reveal" },
  { id: "audit", label: "Hand Audit" },
];

export default function ProvablyFairPage() {
  const [tab, setTab] = useState<Tab>("dashboard");
  const [target, setTarget] = useState<{ matchId: string; handNo: number } | null>(null);

  // Dashboard "Reveal Proof" / history "Verify" jumps into the Seed Reveal view
  // with that hand pre-selected.
  const onReveal = useCallback((matchId: string, handNo: number) => {
    setTarget({ matchId, handNo });
    setTab("reveal");
  }, []);

  // Deep-link from a revealed seed into the full per-card hand audit.
  const onAudit = useCallback((matchId: string, handNo: number) => {
    setTarget({ matchId, handNo });
    setTab("audit");
  }, []);

  return (
    <div className="min-h-screen text-foreground">
      {/* Top bar */}
      <header className="sticky top-0 z-20 border-b border-white/10 bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-6 px-6 py-4">
          <div className="flex items-center gap-8">
            <span className="font-display text-lg font-bold uppercase tracking-wider text-cyan">
              Neon Vault
            </span>
            <nav className="hidden items-center gap-1 md:flex">
              {TABS.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={cn(
                    "rounded-lg px-4 py-2 text-xs font-bold uppercase tracking-wider transition",
                    tab === t.id ? "text-cyan" : "text-neutral-400 hover:text-white",
                  )}
                >
                  {t.label}
                  {tab === t.id && <span className="mt-1 block h-0.5 rounded-full bg-cyan" />}
                </button>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-4">
            {target && tab !== "audit" && (
              <button
                onClick={() => onAudit(target.matchId, target.handNo)}
                className="text-xs font-bold uppercase tracking-wider text-gold hover:underline"
              >
                Open hand audit →
              </button>
            )}
            <Link href="/hub" className="text-sm text-neutral-400 hover:text-cyan">
              ← Command Center
            </Link>
          </div>
        </div>
        {/* Mobile tabs */}
        <nav className="flex items-center gap-1 overflow-x-auto border-t border-white/[0.06] px-4 py-2 md:hidden">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                "shrink-0 rounded-lg px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider transition",
                tab === t.id ? "bg-cyan/10 text-cyan" : "text-neutral-400",
              )}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-10">
        {tab === "dashboard" && <FairnessDashboard onReveal={onReveal} />}
        {tab === "reveal" && <SeedReveal target={target} />}
        {tab === "audit" && <HandAudit target={target} />}
      </main>
    </div>
  );
}
