"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

import { callSessionRpc } from "@/lib/nakama/sessionRpc";
import { formatMoney } from "@/features/commands/schemaForm/format";

// Hand History browser (UI review P1-8): replaces the "paste a match UUID"
// audit prompt with a real list of the player's recent hands, each verifiable
// with a plain-language provably-fair result. The hash chain is the platform's
// best trust asset; this makes the door to it usable.

interface HandRow {
  id: string;
  match_id: string;
  table_label?: string;
  room_id?: string;
  hand_no: number;
  pot: number;
  rake: number;
  net_cents: number;
  won: boolean;
  anchored: boolean;
  created_at?: string;
}

interface VerifyResult {
  chain_ok?: boolean;
  chainOK?: boolean;
  deck_commit_hash?: string;
  deck_hash?: string;
  errors?: string[];
  event_count?: number;
}

function when(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleString();
}

export default function HandsPage() {
  const [hands, setHands] = useState<HandRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<HandRow | null>(null);
  const [verify, setVerify] = useState<VerifyResult | null>(null);
  const [verifying, setVerifying] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = (await callSessionRpc("hand_history", { limit: 50 })) as { hands?: HandRow[] } | null;
      setHands(Array.isArray(data?.hands) ? data!.hands! : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load hand history.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const openHand = useCallback(async (h: HandRow) => {
    setSelected(h);
    setVerify(null);
    setVerifying(true);
    try {
      const data = (await callSessionRpc("audit_verify_hand", { match_id: h.match_id, hand_no: h.hand_no })) as VerifyResult;
      setVerify(data);
    } catch {
      setVerify({ chain_ok: false, errors: ["Verification unavailable"] });
    } finally {
      setVerifying(false);
    }
  }, []);

  const chainOk = (v: VerifyResult | null) => Boolean(v && (v.chain_ok ?? v.chainOK));

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-white/[0.06] bg-surface px-6 py-10">
        <div className="mx-auto flex max-w-5xl flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.4em] text-gold/80">High Rollers Club</p>
            <h1 className="mt-2 text-4xl font-semibold tracking-tight">Hand History</h1>
            <p className="mt-3 max-w-2xl text-neutral-400">
              Your recent hands. Open any hand to verify the shuffle and the payout — the deck was
              committed before the cards were dealt, so the result can be checked, not just trusted.
            </p>
          </div>
          <Link
            href="/hub"
            className="rounded-xl border border-white/10 bg-white/[0.03] px-5 py-3 text-sm font-semibold text-neutral-200 transition hover:border-white/20"
          >
            ← Command Center
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-10">
        {loading && <p className="text-sm text-muted">Loading your hands…</p>}
        {error && (
          <p className="rounded-xl border border-brand/30 bg-brand/10 px-4 py-3 text-sm text-red-400">{error}</p>
        )}
        {!loading && !error && hands.length === 0 && (
          <div className="rounded-2xl border border-white/10 bg-surface p-8 text-center">
            <p className="text-lg font-semibold text-white">No hands yet</p>
            <p className="mt-2 text-sm text-neutral-400">
              Play a hand and it will appear here, ready to verify.
            </p>
            <Link
              href="/lobby"
              className="mt-4 inline-block rounded-full bg-gradient-to-r from-[#9a7b2c] via-gold to-gold-lite px-6 py-2.5 text-sm font-bold uppercase tracking-wider text-black"
            >
              Find a table →
            </Link>
          </div>
        )}

        {hands.length > 0 && (
          <div className="overflow-x-auto rounded-2xl border border-white/10">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-white/10 bg-white/[0.03] text-[11px] uppercase tracking-wider text-muted">
                  <th className="px-4 py-3">Table</th>
                  <th className="px-3 py-3">Hand</th>
                  <th className="px-3 py-3">Pot</th>
                  <th className="px-3 py-3">Your result</th>
                  <th className="px-3 py-3">Fairness</th>
                  <th className="px-3 py-3">When</th>
                  <th className="px-3 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {hands.map((h) => (
                  <tr key={h.id} className="border-b border-white/5 last:border-0 hover:bg-white/[0.02]">
                    <td className="px-4 py-3 font-medium text-white">{h.table_label || h.room_id || "Table"}</td>
                    <td className="px-3 py-3 text-neutral-300">#{h.hand_no}</td>
                    <td className="px-3 py-3 text-neutral-300">{formatMoney(h.pot)}</td>
                    <td className={`px-3 py-3 font-semibold ${h.net_cents >= 0 ? "text-green" : "text-red-400"}`}>
                      {h.net_cents >= 0 ? "+" : "−"}
                      {formatMoney(Math.abs(h.net_cents))}
                    </td>
                    <td className="px-3 py-3">
                      {h.anchored ? (
                        <span className="rounded-full bg-cyan/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-cyan">
                          On-chain
                        </span>
                      ) : (
                        <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-neutral-300">
                          Verifiable
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-neutral-500">{when(h.created_at)}</td>
                    <td className="px-3 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => openHand(h)}
                        className="text-xs font-semibold uppercase tracking-wider text-gold hover:text-gold-lite"
                      >
                        Verify →
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>

      {selected && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label={`Verify hand ${selected.hand_no}`}
          onClick={(e) => {
            if (e.target === e.currentTarget) setSelected(null);
          }}
        >
          <div className="w-full max-w-md rounded-2xl border border-white/10 bg-surface-2 p-6 shadow-2xl">
            <p className="text-xs uppercase tracking-[0.3em] text-gold/80">Provably fair</p>
            <h3 className="mt-1 text-lg font-semibold text-white">
              {selected.table_label || "Table"} · Hand #{selected.hand_no}
            </h3>

            {verifying ? (
              <p className="mt-4 text-sm text-muted">Verifying the hash chain…</p>
            ) : verify ? (
              <div className="mt-4 space-y-3">
                <div
                  className={`rounded-xl border p-4 ${
                    chainOk(verify)
                      ? "border-green/30 bg-green/[0.08]"
                      : "border-brand/30 bg-brand/[0.08]"
                  }`}
                >
                  <p className={`text-sm font-semibold ${chainOk(verify) ? "text-green" : "text-red-400"}`}>
                    {chainOk(verify)
                      ? "✓ Deck committed before the hand; shuffle verified"
                      : "✕ Verification failed"}
                  </p>
                  {!chainOk(verify) && verify.errors && verify.errors.length > 0 && (
                    <ul className="mt-2 list-inside list-disc text-xs text-red-300">
                      {verify.errors.slice(0, 5).map((e, i) => (
                        <li key={i}>{e}</li>
                      ))}
                    </ul>
                  )}
                </div>
                {(verify.deck_commit_hash || verify.deck_hash) && (
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">Deck commitment</p>
                    <p className="mt-1 break-all font-mono text-[11px] text-neutral-400">
                      {verify.deck_commit_hash || verify.deck_hash}
                    </p>
                  </div>
                )}
                <div className="flex gap-4 text-xs text-neutral-400">
                  <span>Pot {formatMoney(selected.pot)}</span>
                  <span>Rake {formatMoney(selected.rake)}</span>
                  {selected.anchored && <span className="text-cyan">Anchored on-chain</span>}
                </div>
              </div>
            ) : null}

            <button
              type="button"
              onClick={() => setSelected(null)}
              className="mt-6 rounded-full border border-white/20 px-5 py-2.5 text-sm font-semibold uppercase tracking-wider text-neutral-300 hover:bg-white/5"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
