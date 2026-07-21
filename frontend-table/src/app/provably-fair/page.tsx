"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { callSessionRpc } from "@/lib/nakama/sessionRpc";
import { Panel, SectionHeader } from "@/features/ui";

interface Anchor {
  configured: boolean;
  latest: { merkle_root: string; tx_hash: string; event_count: number } | null;
}

interface Step {
  n: number;
  title: string;
  detail: string;
  live: boolean;
}

const STEPS: Step[] = [
  { n: 1, title: "Deck committed before the deal", detail: "The server publishes a SHA-256 hash of the shuffled deck before any card is dealt. It can't change the deck after committing.", live: true },
  { n: 2, title: "Cards never leave the server", detail: "You receive only your own two cards, encrypted (AES-256-GCM) to your session. Opponents' cards and the undealt deck stay server-side — nothing to intercept.", live: true },
  { n: 3, title: "Reveal & verify", detail: "After the hand, the server reveals the seed. Anyone can re-hash it and confirm it matches the pre-deal commitment.", live: true },
  { n: 4, title: "Tamper-evident audit chain", detail: "Every hand event is hash-chained (each entry commits to the previous). Altering history breaks the chain — and it's mirrored to permanent storage.", live: true },
  { n: 5, title: "On-chain anchor", detail: "A Merkle root of the audit chain is committed to Polygon in batches — public, permanent verification at a fraction of per-hand cost.", live: true },
];

const ROADMAP: Step[] = [
  { n: 6, title: "Chainlink VRF randomness", detail: "Verifiable randomness the operator can't influence — closes the last 'operator picked the shuffle' gap.", live: false },
  { n: 7, title: "Mental poker (commutative encryption)", detail: "The ultimate: not even the operator ever knows the deck order.", live: false },
];

export default function ProvablyFairPage() {
  const [anchor, setAnchor] = useState<Anchor | null>(null);

  const load = useCallback(async () => {
    try {
      setAnchor((await callSessionRpc("anchor_status", {})) as Anchor);
    } catch {
      /* ignore */
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="min-h-screen text-white">
      <header className="border-b border-white/10 px-6 py-10">
        <div className="mx-auto flex max-w-5xl flex-col gap-3">
          <div className="flex items-center justify-between">
            <SectionHeader>Provably fair</SectionHeader>
            <Link href="/" className="text-sm text-cyan hover:underline">← Command Center</Link>
          </div>
          <h1 className="font-display text-4xl font-bold md:text-5xl">
            Where every hand is{" "}
            <span className="bg-gradient-to-r from-[#9a7b2c] via-[#d4af37] to-[#f3e2ad] bg-clip-text text-transparent">verified</span>
          </h1>
          <p className="max-w-2xl text-neutral-400">
            You never have to trust us. The deck is committed before it&rsquo;s dealt, your cards are
            encrypted and never shared, and the record is tamper-evident and anchored on-chain.
            To know a card in advance you&rsquo;d have to be the server — and there&rsquo;s no path for that.
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-8 px-6 py-10">
        <section className="space-y-3">
          {STEPS.map((s) => (
            <Panel key={s.n} className="flex items-start gap-4 p-5">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-r from-[#9a7b2c] to-[#f3e2ad] font-bold text-black">
                {s.n}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-white">{s.title}</h3>
                  <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold uppercase text-emerald-300">Live</span>
                </div>
                <p className="mt-1 text-sm text-neutral-400">{s.detail}</p>
              </div>
            </Panel>
          ))}
        </section>

        <section className="rounded-2xl border border-cyan/20 bg-cyan/[0.03] p-5">
          <h2 className="font-display text-sm font-bold uppercase tracking-wider text-cyan">On-chain anchor status</h2>
          {anchor?.configured && anchor.latest ? (
            <div className="mt-2 space-y-1 text-sm text-neutral-300">
              <p>Latest batch anchored <span className="text-emerald-300">✓</span> · {anchor.latest.event_count} events</p>
              <p className="break-all font-mono text-[11px] text-neutral-500">root {anchor.latest.merkle_root}</p>
              <p className="break-all font-mono text-[11px] text-neutral-500">tx {anchor.latest.tx_hash}</p>
            </div>
          ) : (
            <p className="mt-2 text-sm text-neutral-500">
              On-chain anchoring is {anchor?.configured ? "configured — awaiting the first batch." : "not yet enabled on this deployment."}{" "}
              The commit / reveal / audit-chain guarantees above are always active.
            </p>
          )}
        </section>

        <section>
          <h2 className="font-display mb-3 text-lg font-bold text-neutral-300">On the roadmap</h2>
          <div className="space-y-3">
            {ROADMAP.map((s) => (
              <Panel key={s.n} className="flex items-start gap-4 p-5 opacity-80">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/15 font-bold text-neutral-400">
                  {s.n}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-neutral-200">{s.title}</h3>
                    <span className="rounded-full border border-white/15 px-2 py-0.5 text-[10px] font-bold uppercase text-neutral-400">Roadmap</span>
                  </div>
                  <p className="mt-1 text-sm text-neutral-500">{s.detail}</p>
                </div>
              </Panel>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
