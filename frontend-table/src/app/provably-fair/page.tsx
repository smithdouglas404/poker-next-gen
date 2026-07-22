"use client";

import Link from "next/link";
import { useCallback, useState } from "react";

import { GLASS_PANEL, HEADING_SM, cn } from "@/features/ui/tokens";
import { AnchorPanel } from "@/features/provably/AnchorPanel";
import { HandPicker } from "@/features/provably/HandPicker";
import { HandTimeline } from "@/features/provably/HandTimeline";
import { ShuffleVerifiedPanel } from "@/features/provably/ShuffleVerifiedPanel";
import { listAudit, verifyHand } from "@/features/provably/provablyRpc";
import type { AuditEvent, HandRef, VerifyResult } from "@/features/provably/types";

interface Step {
  n: number;
  title: string;
  detail: string;
}

const STEPS: Step[] = [
  {
    n: 1,
    title: "Deck committed before the deal",
    detail:
      "The server publishes SHA-256 of the shuffle seed before any card is dealt. It can't change the deck after committing.",
  },
  {
    n: 2,
    title: "Cards never leave the server",
    detail:
      "You receive only your own two cards, encrypted (AES-256-GCM) to your session. Opponents' cards and the undealt deck stay server-side.",
  },
  {
    n: 3,
    title: "Reveal & verify",
    detail:
      "After the hand the server reveals the seed. Anyone can re-hash it and re-run the shuffle to confirm it matches the commitment.",
  },
  {
    n: 4,
    title: "Tamper-evident audit chain",
    detail:
      "Every hand event is hash-chained — each entry commits to the previous. Altering history breaks the chain.",
  },
  {
    n: 5,
    title: "On-chain anchor",
    detail:
      "A Merkle root of the audit chain is committed to Polygon in batches — public, permanent verification at a fraction of per-hand cost.",
  },
];

const ROADMAP: Step[] = [
  {
    n: 6,
    title: "Chainlink VRF randomness",
    detail: "Verifiable randomness the operator can't influence — closes the last 'operator picked the shuffle' gap.",
  },
  {
    n: 7,
    title: "Mental poker (commutative encryption)",
    detail: "The ultimate: not even the operator ever knows the deck order.",
  },
];

export default function ProvablyFairPage() {
  const [active, setActive] = useState<HandRef | null>(null);
  const [verify, setVerify] = useState<VerifyResult | null>(null);
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [loadingVerify, setLoadingVerify] = useState(false);
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const select = useCallback((ref: HandRef) => {
    setActive(ref);
    setVerify(null);
    setEvents([]);
    setError(null);
    setLoadingVerify(true);
    setLoadingEvents(true);

    // Verify (audit_verify_hand) and load the timeline (audit_list) in parallel.
    void verifyHand(ref.matchId, ref.handNo)
      .then((res) => setVerify(res))
      .catch((e) => setError(e instanceof Error ? e.message : "Verification failed"))
      .finally(() => setLoadingVerify(false));

    void listAudit(ref.matchId, ref.handNo)
      .then((res) => setEvents(res.events ?? []))
      .catch(() => {
        /* verify already surfaces errors; keep the timeline empty */
      })
      .finally(() => setLoadingEvents(false));
  }, []);

  return (
    <div className="min-h-screen text-foreground">
      {/* Header */}
      <header className="border-b border-white/10 px-6 py-10">
        <div className="mx-auto flex max-w-6xl flex-col gap-3">
          <div className="flex items-center justify-between">
            <p className={cn(HEADING_SM, "text-gold/80")}>Provably fair</p>
            <Link href="/hub" className="text-sm text-cyan hover:underline">
              ← Command Center
            </Link>
          </div>
          <h1 className="font-display text-4xl font-bold uppercase tracking-wide md:text-5xl">
            Every hand is{" "}
            <span className="bg-gradient-to-r from-[#9a7b2c] via-[#d4af37] to-[#f3e2ad] bg-clip-text text-transparent">
              verified
            </span>
          </h1>
          <p className="max-w-2xl text-neutral-400">
            You never have to trust us. The deck is committed before it&rsquo;s dealt, your cards are
            encrypted and never shared, and the record is tamper-evident and anchored on-chain. Pick a
            hand below to reproduce its shuffle in your own browser.
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-6 px-6 py-8">
        {error && (
          <div className="rounded-xl border border-red-500/30 bg-red-950/30 px-4 py-2.5 text-sm text-red-200">
            {error}
          </div>
        )}

        {/* Verifier workspace */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,340px)_1fr]">
          <div className="space-y-6">
            <HandPicker active={active} onSelect={select} />
            <HandTimeline active={active} events={events} loading={loadingEvents} />
          </div>
          <ShuffleVerifiedPanel active={active} verify={verify} loading={loadingVerify} />
        </div>

        {/* Anchor status / run */}
        <AnchorPanel />

        {/* How it works */}
        <section>
          <h2 className={cn(HEADING_SM, "mb-3 text-neutral-300")}>How it works</h2>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {STEPS.map((s) => (
              <div key={s.n} className={cn(GLASS_PANEL, "flex items-start gap-4 p-5")}>
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-r from-[#9a7b2c] to-[#f3e2ad] font-bold text-black">
                  {s.n}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-white">{s.title}</h3>
                    <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold uppercase text-emerald-300">
                      Live
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-neutral-400">{s.detail}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Roadmap */}
        <section>
          <h2 className={cn(HEADING_SM, "mb-3 text-neutral-300")}>On the roadmap</h2>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {ROADMAP.map((s) => (
              <div key={s.n} className={cn(GLASS_PANEL, "flex items-start gap-4 p-5 opacity-80")}>
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/15 font-bold text-neutral-400">
                  {s.n}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-neutral-200">{s.title}</h3>
                    <span className="rounded-full border border-white/15 px-2 py-0.5 text-[10px] font-bold uppercase text-neutral-400">
                      Roadmap
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-neutral-500">{s.detail}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
