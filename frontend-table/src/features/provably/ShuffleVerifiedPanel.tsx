"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";

import { Button } from "@/features/ui";
import { GLASS_PANEL, HEADING_SM, cn } from "@/features/ui/tokens";

import { verifyLocally, type LocalVerification } from "./fairDemo";
import type { HandRef, VerifyResult } from "./types";
import {
  ALGORITHM_STEPS,
  ENTROPY_SOURCES,
  downloadFile,
  proofBundle,
  pythonVerifier,
} from "./verifier";

// Four-color deck tones (proof/CinematicTable palette), tuned for a dark surface.
const SUIT_STYLE: Record<string, { color: string; glyph: string }> = {
  s: { color: "#e7ecf5", glyph: "♠" },
  h: { color: "#e5484d", glyph: "♥" },
  d: { color: "#5b8bff", glyph: "♦" },
  c: { color: "#2fd07a", glyph: "♣" },
};

function CardChip({ card }: { card: string }) {
  const rank = card.slice(0, card.length - 1);
  const suit = card.slice(-1).toLowerCase();
  const s = SUIT_STYLE[suit] ?? { color: "#e7ecf5", glyph: "?" };
  return (
    <span
      className="inline-flex min-w-[2.1rem] items-center justify-center gap-0.5 rounded-md border border-white/10 bg-white/[0.04] px-1 py-0.5 font-mono text-[11px] font-semibold"
      style={{ color: s.color }}
    >
      {rank === "T" ? "10" : rank}
      {s.glyph}
    </span>
  );
}

function StatusBadge({ verify, local }: { verify: VerifyResult | null; local: LocalVerification | null }) {
  const revealed = Boolean(verify?.reveal_seed);
  const ok = verify?.chain_valid && (verify?.deck_valid || !revealed) && (local ? local.commitMatches : true);
  if (!verify) {
    return (
      <span className="rounded-full border border-white/15 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-400">
        Awaiting hand
      </span>
    );
  }
  if (!revealed) {
    return (
      <span className="rounded-full border border-gold/40 bg-gold/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.2em] text-gold">
        {"🔒"} Committed
      </span>
    );
  }
  return (
    <span
      className={cn(
        "rounded-full border px-3 py-1 text-[10px] font-bold uppercase tracking-[0.2em]",
        ok
          ? "border-emerald-400/40 bg-emerald-500/10 text-emerald-300 shadow-[0_0_18px_rgba(16,185,129,0.25)]"
          : "border-red-500/40 bg-red-500/10 text-red-300",
      )}
    >
      {ok ? "✓ Shuffle verified" : "✗ Mismatch"}
    </span>
  );
}

function Mono({ label, value, accent }: { label: string; value?: string; accent: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] uppercase tracking-[0.2em] text-neutral-500">{label}</p>
      {value ? (
        <p className="mt-0.5 break-all font-mono text-[11px]" style={{ color: accent }} title={value}>
          {value}
        </p>
      ) : (
        <p className="mt-0.5 text-[11px] text-neutral-600">—</p>
      )}
    </div>
  );
}

/**
 * The "Shuffle Verified" glass panel: entropy sources, commit hash, reveal seed,
 * algorithm, a download-the-verifier action, and an in-browser reproduction of
 * the exact deck the server dealt (WebCrypto, cross-checking the server).
 */
export function ShuffleVerifiedPanel({
  active,
  verify,
  loading,
}: {
  active: HandRef | null;
  verify: VerifyResult | null;
  loading: boolean;
}) {
  const [local, setLocal] = useState<LocalVerification | null>(null);
  const [localErr, setLocalErr] = useState<string | null>(null);
  const [reproducing, setReproducing] = useState(false);

  const commit = verify?.deck_commit ?? "";
  const seed = verify?.reveal_seed ?? "";

  // Reset the local reproduction whenever the target hand or seed changes.
  useEffect(() => {
    setLocal(null);
    setLocalErr(null);
  }, [active?.matchId, active?.handNo, seed, commit]);

  const reproduce = useCallback(async () => {
    if (!seed) return;
    setReproducing(true);
    setLocalErr(null);
    try {
      setLocal(await verifyLocally(seed, commit));
    } catch (e) {
      setLocalErr(e instanceof Error ? e.message : "Reproduction failed");
    } finally {
      setReproducing(false);
    }
  }, [seed, commit]);

  const downloadPython = useCallback(() => {
    if (!commit || !seed) return;
    downloadFile(`verify-hand-${active?.handNo ?? "latest"}.py`, pythonVerifier(commit, seed), "text/x-python");
  }, [commit, seed, active?.handNo]);

  const downloadJson = useCallback(() => {
    if (!active || !commit || !seed) return;
    downloadFile(
      `hand-${active.handNo}-proof.json`,
      proofBundle({
        matchId: active.matchId,
        handNo: active.handNo,
        commit,
        seed,
        deck: local?.deck ?? [],
        chainValid: verify?.chain_valid,
        deckValid: verify?.deck_valid,
        verifyMethod: verify?.verify_method,
      }),
      "application/json",
    );
  }, [active, commit, seed, local, verify]);

  return (
    <div className={cn(GLASS_PANEL, "overflow-hidden")}>
      {/* Header */}
      <div className="flex items-center justify-between gap-3 border-b border-white/[0.06] bg-white/[0.02] px-5 py-4">
        <div>
          <p className={cn(HEADING_SM, "text-gold/80")}>Shuffle Verified</p>
          <p className="mt-0.5 text-sm text-neutral-400">
            {active ? (
              <>
                Hand <span className="text-white">#{active.handNo}</span>
                <span className="text-neutral-600"> · {active.matchId.slice(0, 10)}…</span>
              </>
            ) : (
              "Select or verify a hand to inspect its shuffle"
            )}
          </p>
        </div>
        <StatusBadge verify={verify} local={local} />
      </div>

      <div className="space-y-5 p-5">
        {/* Entropy sources */}
        <section>
          <p className="text-[10px] uppercase tracking-[0.25em] text-cyan/70">Entropy sources</p>
          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {ENTROPY_SOURCES.map((s) => (
              <div key={s.label} className="rounded-xl border border-white/[0.07] bg-black/30 px-3 py-2">
                <p className="text-xs font-semibold text-white">{s.label}</p>
                <p className="mt-0.5 text-[11px] leading-snug text-neutral-500">{s.detail}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Commit + seed */}
        <section className="grid grid-cols-1 gap-3 rounded-xl border border-white/[0.07] bg-black/30 p-3 sm:grid-cols-2">
          <Mono label="Commit hash — SHA-256(seed)" value={commit || undefined} accent="#f3e2ad" />
          <Mono
            label={seed ? "Reveal seed" : "Reveal seed (after showdown)"}
            value={seed || undefined}
            accent="#81ecff"
          />
        </section>

        {/* Verify server result summary */}
        {verify && (
          <section className="flex flex-wrap gap-2 text-[11px]">
            <Pill ok={verify.chain_valid}>Audit chain {verify.chain_valid ? "intact" : "broken"}</Pill>
            <Pill ok={verify.deck_revealed ? verify.deck_valid : undefined}>
              Deck {verify.deck_revealed ? (verify.deck_valid ? "matches commit" : "mismatch") : "pending reveal"}
            </Pill>
            <span className="rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 text-neutral-400">
              {verify.event_count ?? 0} events
            </span>
            {verify.verify_method && verify.verify_method !== "none" && (
              <span className="rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 text-neutral-400">
                method: {verify.verify_method}
              </span>
            )}
          </section>
        )}

        {verify?.chain_errors && verify.chain_errors.length > 0 && (
          <ul className="space-y-1 rounded-xl border border-red-500/25 bg-red-950/20 p-3 text-[11px] text-red-300">
            {verify.chain_errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        )}

        {/* In-browser reproduction */}
        <section>
          <div className="flex items-center justify-between">
            <p className="text-[10px] uppercase tracking-[0.25em] text-cyan/70">Reproduce in your browser</p>
            {local && (
              <span
                className={cn(
                  "text-[10px] font-bold uppercase tracking-[0.15em]",
                  local.commitMatches ? "text-emerald-300" : "text-red-300",
                )}
              >
                {local.commitMatches ? "✓ commitment matches" : "✗ commitment differs"}
              </span>
            )}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={reproduce}
            disabled={!seed || reproducing}
            className="mt-2 w-full border-cyan/30 text-cyan hover:bg-cyan/5"
            title={seed ? "Recompute the shuffle locally with WebCrypto" : "Available once the hand reaches showdown"}
          >
            {reproducing ? "Recomputing…" : "Recompute shuffle (WebCrypto)"}
          </Button>
          {localErr && <p className="mt-2 text-[11px] text-red-300">{localErr}</p>}
          {local && (
            <div className="mt-3 rounded-xl border border-white/[0.07] bg-black/30 p-3">
              <p className="text-[10px] uppercase tracking-[0.2em] text-neutral-500">
                Reproduced 52-card deal order
              </p>
              <div className="mt-2 flex flex-wrap gap-1">
                {local.deck.map((c, i) => (
                  <CardChip key={`${c}-${i}`} card={c} />
                ))}
              </div>
              <p className="mt-2 text-[10px] leading-snug text-neutral-600">
                Computed entirely on your device — no data sent to our servers. Your hole cards and
                the board must appear in this exact order.
              </p>
            </div>
          )}
        </section>

        {/* Downloads */}
        <section>
          <p className="text-[10px] uppercase tracking-[0.25em] text-cyan/70">Download the verifier</p>
          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Button
              variant="outline"
              size="sm"
              onClick={downloadPython}
              disabled={!commit || !seed}
              title={!seed ? "Available once the hand reaches showdown" : "Stdlib-only Python verifier"}
            >
              {"⬇"} Python (stdlib)
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={downloadJson}
              disabled={!active || !commit || !seed}
              title="Machine-readable proof bundle"
            >
              {"⬇"} Proof bundle (JSON)
            </Button>
          </div>
        </section>

        {/* Algorithm */}
        <section>
          <p className="text-[10px] uppercase tracking-[0.25em] text-cyan/70">Algorithm</p>
          <ol className="mt-2 space-y-2">
            {ALGORITHM_STEPS.map((s, i) => (
              <li key={s.title} className="flex gap-3">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-white/15 font-mono text-[10px] text-neutral-400">
                  {i + 1}
                </span>
                <div>
                  <span className="text-xs font-semibold text-white">{s.title}</span>
                  <span className="ml-2 text-[11px] text-neutral-500">{s.detail}</span>
                </div>
              </li>
            ))}
          </ol>
        </section>

        {loading && <p className="text-[11px] text-cyan/70">Verifying with the server…</p>}
      </div>
    </div>
  );
}

function Pill({ ok, children }: { ok: boolean | undefined; children: ReactNode }) {
  const cls =
    ok === undefined
      ? "border-white/10 bg-white/[0.03] text-neutral-400"
      : ok
        ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-300"
        : "border-red-500/30 bg-red-500/10 text-red-300";
  return <span className={cn("rounded-full border px-2.5 py-1", cls)}>{children}</span>;
}
