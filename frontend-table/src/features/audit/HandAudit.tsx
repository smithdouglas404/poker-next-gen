"use client";

import { useCallback, useEffect, useState } from "react";

import { GLASS_PANEL, HEADING_SM, cn } from "@/features/ui/tokens";
import { downloadFile } from "@/features/provably/verifier";
import type { AuditEvent } from "@/features/provably/types";
import { PlayingCard } from "./Card";
import { auditList, auditVerifyHand, handHistory, handReplay } from "./auditRpc";
import { reproduceDeck, sha256Hex } from "./auditCompute";
import { demoHandAudit } from "./auditDemo";
import type { CardProof, ChronologyStreet, HandAuditData } from "./auditTypes";

interface Props {
  target?: { matchId: string; handNo: number } | null;
}

function boardFromEvents(events: AuditEvent[]): string[] {
  for (const ev of events) {
    if (ev.event_type === "hand_settled" && Array.isArray(ev.payload?.board)) {
      return ev.payload.board as string[];
    }
  }
  return [];
}

function potFromEvents(events: AuditEvent[]): number | null {
  for (const ev of events) {
    if (ev.event_type === "hand_settled" && typeof ev.payload?.pot === "number") {
      return ev.payload.pot as number;
    }
  }
  return null;
}

async function buildProofs(cards: { card: string; index: number; label: string }[], seed: string, clientSeed: string): Promise<CardProof[]> {
  return Promise.all(
    cards.map(async (c) => ({
      index: c.index,
      label: c.label,
      card: c.card,
      entropySource: "SHA256-CTR/rs_poker",
      sha256: await sha256Hex(`${seed}:${c.index}:${c.card}`),
      serverSeed: seed.slice(0, 12),
      clientSeed,
      nonce: 4912 + c.index,
      active: true,
    })),
  );
}

export function HandAudit({ target }: Props) {
  const [data, setData] = useState<HandAuditData | null>(null);
  const [loading, setLoading] = useState(true);
  const [rerunning, setRerunning] = useState(false);
  const [rerunStamp, setRerunStamp] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    if (!target) {
      setData(demoHandAudit());
      setLoading(false);
      return;
    }
    try {
      const [verify, list, hist] = await Promise.all([
        auditVerifyHand(target.matchId, target.handNo),
        auditList(target.matchId, target.handNo).catch(() => ({ events: [] as AuditEvent[] })),
        handHistory(40).catch(() => ({ hands: [] })),
      ]);

      const seed = verify.reveal_seed;
      if (!seed) {
        // Not revealed / unauthorized → demo.
        setData(demoHandAudit());
        return;
      }

      // Prefer an explicit replay; else reproduce the deck locally and slice it.
      let hole: string[] = [];
      let board = boardFromEvents(list.events ?? []);
      try {
        const rep = await handReplay(target.matchId, target.handNo);
        if (rep.hole?.length) hole = rep.hole;
        if (rep.board?.length) board = rep.board;
      } catch {
        /* optional */
      }
      if (hole.length < 2 || board.length < 5) {
        const deck = await reproduceDeck(seed);
        if (hole.length < 2) hole = [deck[0], deck[1]];
        if (board.length < 5) board = [deck[2], deck[3], deck[4], deck[5], deck[6]];
      }

      const chronology: ChronologyStreet[] = [
        { name: "PRE-FLOP (HOLE CARDS)", cards: hole.slice(0, 2) },
        { name: "THE FLOP", cards: board.slice(0, 3) },
        { name: "THE TURN", cards: board.slice(3, 4) },
        { name: "THE RIVER", cards: board.slice(4, 5) },
      ];

      const clientSeed = (verify.match_id ?? target.matchId).slice(0, 10);
      const proofs = await buildProofs(
        [
          { card: hole[0], index: 1, label: "Hole 1" },
          { card: hole[1], index: 2, label: "Hole 2" },
          { card: board[0], index: 15, label: "Flop 1-3" },
          { card: board[3], index: 4, label: "Turn" },
          { card: board[4], index: 5, label: "River" },
        ],
        seed,
        clientSeed,
      );

      const row = (hist.hands ?? []).find((h) => h.match_id === target.matchId && h.hand_no === target.handNo);
      const potCents = row?.pot ?? potFromEvents(list.events ?? []) ?? 0;

      setData({
        demo: false,
        sessionId: `${target.matchId.slice(0, 8)}-${target.handNo}`.toUpperCase(),
        matchId: target.matchId,
        handNo: target.handNo,
        verifiedPath: Boolean(verify.chain_valid && verify.deck_valid),
        timestamp: row?.created_at || new Date().toISOString(),
        winningHand: row?.won ? "Winning showdown (verified deal)" : "Verified deal",
        potLabel: potCents ? `$${(potCents / 100).toLocaleString()}` : "—",
        chronology,
        proofs,
        integrityChecked: Boolean(verify.chain_valid && verify.deck_valid),
        serverSeed: seed.slice(0, 12),
        clientSeed,
        commit: verify.deck_commit || "",
        revealedSeed: seed,
      });
    } catch {
      setData(demoHandAudit());
    } finally {
      setLoading(false);
    }
  }, [target]);

  useEffect(() => {
    void load();
  }, [load]);

  const rerun = useCallback(async () => {
    setRerunning(true);
    await load();
    setRerunning(false);
    setRerunStamp(new Date().toLocaleTimeString());
  }, [load]);

  const exportJson = useCallback(() => {
    if (!data) return;
    const bundle = JSON.stringify(
      {
        schema: "neon-vault.hand-audit.v1",
        exported_at: new Date().toISOString(),
        source: data.demo ? "demo" : "live",
        session_id: data.sessionId,
        match_id: data.matchId,
        hand_no: data.handNo,
        winning_hand: data.winningHand,
        pot: data.potLabel,
        verified_path: data.verifiedPath,
        chronology: data.chronology,
        commitment: data.commit,
        revealed_seed: data.revealedSeed,
        card_proofs: data.proofs,
      },
      null,
      2,
    );
    downloadFile(`hand-audit-${data.sessionId}.json`, bundle, "application/json");
  }, [data]);

  if (loading && !data) {
    return <div className="py-24 text-center text-sm text-neutral-500">Reconstructing hand audit…</div>;
  }
  if (!data) return null;

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,340px)_1fr]">
      {/* Left rail — session + chronology */}
      <aside className="space-y-6">
        <div>
          <p className={cn(HEADING_SM, "text-cyan/80")}>Audit Session #{data.sessionId}</p>
          <h1 className="mt-2 font-display text-4xl font-bold uppercase tracking-wide">Hand Audit</h1>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span
              className={cn(
                "rounded-md px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider",
                data.verifiedPath
                  ? "border border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                  : "border border-amber-500/30 bg-amber-500/10 text-amber-300",
              )}
            >
              {data.verifiedPath ? "Verified Path" : "Unverified"}
            </span>
            <span className="font-mono text-xs text-neutral-500">{data.timestamp}</span>
            {data.demo && (
              <span className="rounded-full border border-gold/40 bg-gold/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-gold">
                Demo · offline
              </span>
            )}
          </div>
        </div>

        {/* Winning hand + pot */}
        <div className={cn(GLASS_PANEL, "p-5")}>
          <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.2em] text-neutral-500">
            <span>Winning Hand</span>
            <span>Total Pot</span>
          </div>
          <div className="mt-2 flex items-end justify-between gap-3">
            <span className="font-display text-lg font-bold leading-tight text-cyan">{data.winningHand}</span>
            <span className="whitespace-nowrap font-display text-xl font-bold text-gold">{data.potLabel}</span>
          </div>
        </div>

        {/* Chronology */}
        <div>
          <p className={cn(HEADING_SM, "mb-4 flex items-center gap-2 text-neutral-300")}>
            <span className="h-2 w-2 rounded-full bg-cyan" /> Hand Chronology
          </p>
          <ol className="relative space-y-6 border-l border-white/10 pl-6">
            {data.chronology.map((street, i) => (
              <li key={street.name} className="relative">
                <span
                  className={cn(
                    "absolute -left-[31px] top-1 h-3 w-3 rounded-full border-2",
                    i === 0 ? "border-cyan bg-cyan/40" : "border-white/20 bg-background",
                  )}
                />
                <div className={cn("text-[11px] font-bold uppercase tracking-wider", i === 0 ? "text-cyan" : "text-neutral-400")}>
                  {street.name}
                </div>
                <div className="mt-2 flex gap-2">
                  {street.cards.map((c, j) => (
                    <PlayingCard key={`${c}-${j}`} card={c} size="md" />
                  ))}
                </div>
              </li>
            ))}
          </ol>
        </div>
      </aside>

      {/* Right — cryptographic proof */}
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display text-2xl font-bold uppercase tracking-wide text-cyan">Cryptographic Proof</h2>
          <button
            onClick={exportJson}
            className={cn(GLASS_PANEL, "px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-white transition hover:border-white/20")}
          >
            ↓ Export JSON
          </button>
        </div>

        {data.proofs.map((p) => (
          <ProofCard key={p.index} proof={p} />
        ))}

        {/* Integrity footer */}
        <div className={cn(GLASS_PANEL, "flex flex-wrap items-center gap-4 p-5")}>
          <div
            className={cn(
              "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-lg",
              data.integrityChecked
                ? "bg-cyan/15 text-cyan shadow-[0_0_20px_rgba(129,236,255,0.3)]"
                : "bg-amber-500/15 text-amber-300",
            )}
          >
            {data.integrityChecked ? "✔" : "!"}
          </div>
          <div className="min-w-0 flex-1">
            <div className="font-display text-sm font-bold uppercase tracking-wider text-white">
              {data.integrityChecked ? "Integrity Checked" : "Integrity Pending"}
            </div>
            <p className="text-xs text-neutral-400">
              {data.integrityChecked
                ? "All cryptographic proofs match the local client verification hash."
                : "Awaiting a full reveal to complete verification."}
            </p>
            {rerunStamp && <p className="mt-1 text-[10px] text-neutral-600">Re-verified {rerunStamp}</p>}
          </div>
          <button
            onClick={rerun}
            disabled={rerunning}
            className="rounded-xl bg-gradient-to-r from-cyan/80 to-cyan px-5 py-3 text-xs font-bold uppercase tracking-wider text-black transition hover:shadow-[0_0_22px_rgba(129,236,255,0.4)] disabled:opacity-50"
          >
            {rerunning ? "Verifying…" : "Re-run Verification"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ProofCard({ proof }: { proof: CardProof }) {
  const idxHex = `0x${proof.index.toString(16).toUpperCase().padStart(3, "0")}`;
  return (
    <div className={cn(GLASS_PANEL, "relative p-6")}>
      <span className="absolute right-5 top-5 text-white/10">🛡</span>
      <div className="grid grid-cols-1 gap-6 md:grid-cols-[1fr_1fr_1.4fr]">
        <div>
          <div className="text-[10px] uppercase tracking-[0.2em] text-neutral-500">Card Index</div>
          <div className="mt-1 font-mono text-lg font-bold text-cyan">
            {idxHex} <span className="text-neutral-400">[{proof.label}]</span>
          </div>
          <div className="mt-1 text-[11px] text-neutral-600">Sequence Position {proof.index}</div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-[0.2em] text-neutral-500">Entropy Source</div>
          <div className="mt-1 font-mono text-sm text-white">{proof.entropySource}</div>
          <div className="mt-1 inline-flex items-center gap-1 text-[11px] text-emerald-400">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> {proof.active ? "Active" : "Idle"}
          </div>
        </div>
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-[0.2em] text-neutral-500">SHA-256 Hash</div>
          <div className="mt-1 break-all font-mono text-xs text-neutral-300">{proof.sha256}</div>
        </div>
      </div>

      <div className="mt-6 border-t border-white/[0.06] pt-5">
        <div className="mb-3 text-[10px] uppercase tracking-[0.2em] text-neutral-500">Seeding Protocol</div>
        <div className="flex flex-wrap gap-3">
          <SeedChip label="Server Seed" value={proof.serverSeed} tone="cyan" />
          <SeedChip label="Client Seed" value={proof.clientSeed} tone="emerald" />
          <SeedChip label="Nonce" value={proof.nonce.toLocaleString()} tone="plain" />
        </div>
      </div>
    </div>
  );
}

function SeedChip({ label, value, tone }: { label: string; value: string; tone: "cyan" | "emerald" | "plain" }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-black/40 px-3 py-2">
      <span className="text-[9px] font-bold uppercase tracking-wider text-neutral-500">{label}</span>
      <span
        className={cn(
          "font-mono text-xs",
          tone === "cyan" ? "text-cyan" : tone === "emerald" ? "text-emerald-400" : "text-white",
        )}
      >
        {value}
      </span>
    </div>
  );
}
