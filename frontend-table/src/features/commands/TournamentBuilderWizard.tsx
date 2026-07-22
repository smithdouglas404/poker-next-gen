"use client";

import { useMemo, useState } from "react";

import { callSessionRpc } from "@/lib/nakama/sessionRpc";
import { getRpcSchema } from "./schemas";
import { SchemaForm } from "./schemaForm/SchemaForm";
import { initialValues, validate } from "./schemaForm/validate";
import { formatBps } from "./schemaForm/format";
import type { RpcSchema } from "./schemaForm/schemaTypes";

// Tournament builder wizard (UI review P1-7 / P0-8): replaces five raw-JSON
// cards glued by a shared tournament_id with one flow — basics, a blind
// structure from a template, payouts with a LIVE 100% check (mirrors the
// server's start invariant), then review & start.

interface BlindLevel {
  level: number;
  small_blind: number;
  big_blind: number;
  ante: number;
  duration_secs: number;
}
interface PrizeTier {
  rank_from: number;
  rank_to: number;
  payout_bps: number;
}

function blindTemplate(minutes: number): BlindLevel[] {
  const secs = minutes * 60;
  const steps = [
    [25, 50], [50, 100], [75, 150], [100, 200], [150, 300],
    [200, 400], [300, 600], [500, 1000], [700, 1400], [1000, 2000],
  ];
  return steps.map(([sb, bb], i) => ({
    level: i + 1, small_blind: sb, big_blind: bb, ante: i >= 3 ? bb / 10 : 0, duration_secs: secs,
  }));
}

const PAYOUT_TEMPLATES: Record<string, PrizeTier[]> = {
  "Winner-take-all": [{ rank_from: 1, rank_to: 1, payout_bps: 10000 }],
  "Top 3 · 50/30/20": [
    { rank_from: 1, rank_to: 1, payout_bps: 5000 },
    { rank_from: 2, rank_to: 2, payout_bps: 3000 },
    { rank_from: 3, rank_to: 3, payout_bps: 2000 },
  ],
  "Top 5 · 40/25/18/10/7": [
    { rank_from: 1, rank_to: 1, payout_bps: 4000 },
    { rank_from: 2, rank_to: 2, payout_bps: 2500 },
    { rank_from: 3, rank_to: 3, payout_bps: 1800 },
    { rank_from: 4, rank_to: 4, payout_bps: 1000 },
    { rank_from: 5, rank_to: 5, payout_bps: 700 },
  ],
};

const NUM =
  "w-full rounded-lg border border-white/10 bg-black/40 px-2 py-1.5 text-sm text-white outline-none focus:border-gold/50";

export function TournamentBuilderWizard({
  onClose,
  onComplete,
}: {
  onClose: () => void;
  onComplete: (tournamentId: string | null) => void;
}) {
  const [step, setStep] = useState(0);
  const schema = getRpcSchema("tournament_create") as RpcSchema;
  const [basics, setBasics] = useState<Record<string, unknown>>(() => initialValues(schema));
  const [tournamentId, setTournamentId] = useState<string | null>(null);
  const [blinds, setBlinds] = useState<BlindLevel[]>(blindTemplate(10));
  const [prizes, setPrizes] = useState<PrizeTier[]>(PAYOUT_TEMPLATES["Top 3 · 50/30/20"]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const basicsErrors = useMemo(() => validate(schema, basics), [schema, basics]);
  const payoutTotal = prizes.reduce((s, p) => s + (Number(p.payout_bps) || 0), 0);
  const payoutOk = payoutTotal === 10000;

  async function createTournament() {
    setBusy(true); setError(null);
    try {
      const res = (await callSessionRpc("tournament_create", basics)) as Record<string, unknown>;
      const id = typeof res?.id === "string" ? res.id : null;
      setTournamentId(id);
      setStep(1);
    } catch (e) { setError(e instanceof Error ? e.message : "Failed to create tournament."); }
    finally { setBusy(false); }
  }

  async function saveBlinds() {
    if (!tournamentId) { setStep(2); return; }
    setBusy(true); setError(null);
    try {
      for (const b of blinds) {
        await callSessionRpc("blind_level_add", { tournament_id: tournamentId, ...b });
      }
      setStep(2);
    } catch (e) { setError(e instanceof Error ? e.message : "Failed to save blinds."); }
    finally { setBusy(false); }
  }

  async function savePrizes() {
    if (!payoutOk) return;
    if (!tournamentId) { setStep(3); return; }
    setBusy(true); setError(null);
    try {
      for (const p of prizes) {
        await callSessionRpc("prize_pool_add", { tournament_id: tournamentId, ...p });
      }
      setStep(3);
    } catch (e) { setError(e instanceof Error ? e.message : "Failed to save payouts."); }
    finally { setBusy(false); }
  }

  async function startTournament() {
    if (!tournamentId) { onComplete(null); return; }
    setBusy(true); setError(null);
    try {
      await callSessionRpc("tournament_start", { tournament_id: tournamentId });
      onComplete(tournamentId);
    } catch (e) { setError(e instanceof Error ? e.message : "Failed to start."); }
    finally { setBusy(false); }
  }

  const gold =
    "rounded-full bg-gradient-to-r from-[#9a7b2c] via-gold to-gold-lite px-6 py-2.5 text-sm font-bold uppercase tracking-wider text-black transition hover:shadow-[0_0_22px_rgba(212,175,55,0.35)] disabled:opacity-50";
  const ghost =
    "rounded-full border border-white/20 px-5 py-2.5 text-sm font-semibold uppercase tracking-wider text-neutral-300 hover:bg-white/5";

  const STEP_TITLES = ["Basics", "Blind structure", "Payouts", "Review & start"];

  return (
    <div className="fixed inset-0 z-[65] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Tournament builder">
      <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-gold/30 bg-surface-2 p-6 shadow-2xl">
        <div className="mb-5 flex items-center gap-2">
          {STEP_TITLES.map((t, i) => (
            <div key={t} className={`h-1.5 flex-1 rounded-full ${i < step ? "bg-gold" : i === step ? "bg-gold/60" : "bg-white/10"}`} title={t} />
          ))}
        </div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-gold/80">Step {step + 1} of 4</p>
        <h3 className="mt-1 text-xl font-semibold text-white">{STEP_TITLES[step]}</h3>

        {step === 0 && (
          <div className="mt-5"><SchemaForm schema={schema} values={basics} onChange={setBasics} /></div>
        )}

        {step === 1 && (
          <div className="mt-5">
            <div className="mb-3 flex flex-wrap gap-2">
              {[["Turbo · 5 min", 5], ["Standard · 10 min", 10], ["Deep · 15 min", 15]].map(([label, min]) => (
                <button key={label as string} type="button" onClick={() => setBlinds(blindTemplate(min as number))}
                  className="rounded-full border border-white/15 px-3 py-1 text-xs text-neutral-200 hover:border-gold/40">
                  {label}
                </button>
              ))}
            </div>
            <div className="overflow-x-auto rounded-xl border border-white/10">
              <table className="w-full text-left text-sm">
                <thead><tr className="border-b border-white/10 bg-white/[0.03] text-[11px] uppercase tracking-wider text-muted">
                  <th className="px-3 py-2">Lvl</th><th className="px-2 py-2">Small</th><th className="px-2 py-2">Big</th><th className="px-2 py-2">Ante</th><th className="px-2 py-2">Minutes</th>
                </tr></thead>
                <tbody>
                  {blinds.map((b, i) => (
                    <tr key={i} className="border-b border-white/5">
                      <td className="px-3 py-1.5 text-neutral-400">{b.level}</td>
                      {(["small_blind", "big_blind", "ante"] as const).map((k) => (
                        <td key={k} className="px-1 py-1">
                          <input type="number" className={NUM} value={b[k]} onChange={(e) => {
                            const v = Number(e.target.value) || 0; setBlinds((p) => p.map((r, j) => j === i ? { ...r, [k]: v } : r));
                          }} />
                        </td>
                      ))}
                      <td className="px-1 py-1">
                        <input type="number" className={NUM} value={Math.round(b.duration_secs / 60)} onChange={(e) => {
                          const v = (Number(e.target.value) || 0) * 60; setBlinds((p) => p.map((r, j) => j === i ? { ...r, duration_secs: v } : r));
                        }} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-xs text-muted">{blinds.length} levels · edit any cell or pick a template.</p>
          </div>
        )}

        {step === 2 && (
          <div className="mt-5">
            <div className="mb-3 flex flex-wrap gap-2">
              {Object.keys(PAYOUT_TEMPLATES).map((k) => (
                <button key={k} type="button" onClick={() => setPrizes(PAYOUT_TEMPLATES[k])}
                  className="rounded-full border border-white/15 px-3 py-1 text-xs text-neutral-200 hover:border-gold/40">{k}</button>
              ))}
            </div>
            <div className="overflow-x-auto rounded-xl border border-white/10">
              <table className="w-full text-left text-sm">
                <thead><tr className="border-b border-white/10 bg-white/[0.03] text-[11px] uppercase tracking-wider text-muted">
                  <th className="px-3 py-2">From</th><th className="px-2 py-2">To</th><th className="px-2 py-2">Payout %</th><th className="px-2 py-2"></th>
                </tr></thead>
                <tbody>
                  {prizes.map((p, i) => (
                    <tr key={i} className="border-b border-white/5">
                      {(["rank_from", "rank_to"] as const).map((k) => (
                        <td key={k} className="px-1 py-1"><input type="number" className={NUM} value={p[k]} onChange={(e) => {
                          const v = Number(e.target.value) || 0; setPrizes((pr) => pr.map((r, j) => j === i ? { ...r, [k]: v } : r));
                        }} /></td>
                      ))}
                      <td className="px-1 py-1"><input type="number" step="0.5" className={NUM} value={p.payout_bps / 100} onChange={(e) => {
                        const v = Math.round((Number(e.target.value) || 0) * 100); setPrizes((pr) => pr.map((r, j) => j === i ? { ...r, payout_bps: v } : r));
                      }} /></td>
                      <td className="px-2 py-1 text-right">
                        <button type="button" onClick={() => setPrizes((pr) => pr.filter((_, j) => j !== i))} className="text-neutral-500 hover:text-brand">✕</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-3 flex items-center justify-between">
              <button type="button" onClick={() => setPrizes((p) => [...p, { rank_from: p.length + 1, rank_to: p.length + 1, payout_bps: 0 }])}
                className="text-xs font-semibold uppercase tracking-wider text-neutral-300 hover:text-white">+ Add tier</button>
              <p className={`text-sm font-semibold ${payoutOk ? "text-green" : "text-brand"}`}>
                Total {formatBps(payoutTotal)} {payoutOk ? "✓" : `— must equal 100%`}
              </p>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="mt-5 space-y-3 rounded-xl border border-white/10 bg-black/30 p-4 text-sm text-neutral-200">
            <p><span className="text-muted">Name:</span> {String(basics.name ?? "")}</p>
            <p><span className="text-muted">Blind levels:</span> {blinds.length}</p>
            <p><span className="text-muted">Payouts:</span> {prizes.length} tiers · {formatBps(payoutTotal)} {payoutOk ? "✓" : "✗"}</p>
            <p className="text-xs text-muted">Starting will lock the structure and open registration.</p>
          </div>
        )}

        {error && <p className="mt-3 rounded-lg border border-brand/30 bg-brand/10 px-3 py-2 text-sm text-red-400">{error}</p>}

        <div className="mt-6 flex flex-wrap items-center gap-3">
          {step === 0 && <button type="button" disabled={busy || basicsErrors.length > 0} onClick={createTournament} className={gold}>Create &amp; continue</button>}
          {step === 1 && <button type="button" disabled={busy} onClick={saveBlinds} className={gold}>Save blinds &amp; continue</button>}
          {step === 2 && <button type="button" disabled={busy || !payoutOk} onClick={savePrizes} className={gold}>Save payouts &amp; continue</button>}
          {step === 3 && <button type="button" disabled={busy} onClick={startTournament} className={gold}>Start tournament</button>}
          {step > 0 && step < 4 && <button type="button" onClick={() => setStep((s) => s - 1)} className={ghost}>Back</button>}
          <button type="button" onClick={onClose} className="ml-auto text-[11px] font-semibold uppercase tracking-wider text-neutral-500 hover:text-white">Close</button>
        </div>
      </div>
    </div>
  );
}
