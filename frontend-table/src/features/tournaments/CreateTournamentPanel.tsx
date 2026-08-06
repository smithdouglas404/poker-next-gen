"use client";

import { useEffect, useMemo, useState } from "react";

import { callSessionRpc } from "@/lib/nakama/sessionRpc";
import { Button, Field, Input, Select } from "@/features/ui";
import { GLASS_PANEL, cn } from "@/features/ui/tokens";

import { Tag } from "./atoms";
import { dollars } from "./format";
import { buildBlindLevels, buildPrizeTiers } from "./structures";
import type { BlindLevel, DraftForm, Prize } from "./types";

type SetupTab = "general" | "structure" | "financials" | "rules";

// Compact numeric cell used across the blind & payout editors.
const CELL =
  "w-full rounded-lg border border-white/10 bg-black/40 px-2 py-1.5 text-sm text-white outline-none focus:border-gold/50";

const EMPTY_DRAFT: DraftForm = {
  name: "",
  clubId: "",
  variant: "texas-holdem",
  buyIn: 100,
  fee: 10,
  startingStack: 100_000,
  maxPlayers: 180,
  maxSeatsPerTable: 6,
  levelMinutes: 15,
  numLevels: 6,
  payoutStructure: "top15",
  guaranteedPrize: 0,
  knockout: false,
  bounty: 0,
  lateReg: true,
  scheduledAt: "",
  regCloseAt: "",
  adminFeePct: 0,
  autoAway: true,
  timeBankSecs: 60,
  timeBankPerHandSecs: 5,
  operatingStartMin: 0,
  operatingEndMin: 0,
};

/** Operating-hours presets. Equal start/end means "no window" — always open. */
const HOURS_PRESETS: { id: string; label: string; start: number; end: number }[] = [
  { id: "always", label: "24 hours (no window)", start: 0, end: 0 },
  { id: "evening", label: "18:00 – 04:00 UTC", start: 18 * 60, end: 4 * 60 },
  { id: "afternoon", label: "12:00 – 00:00 UTC", start: 12 * 60, end: 0 },
  { id: "business", label: "09:00 – 17:00 UTC", start: 9 * 60, end: 17 * 60 },
];

/** Time-bank presets, matching the design's composite "total + per hand". */
const TIMEBANK_PRESETS: { id: string; label: string; total: number; perHand: number }[] = [
  { id: "off", label: "No time bank", total: 0, perHand: 0 },
  { id: "30", label: "30s total, 5s per hand", total: 30, perHand: 5 },
  { id: "60", label: "60s total, 5s per hand", total: 60, perHand: 5 },
  { id: "120", label: "120s total, 10s per hand", total: 120, perHand: 10 },
];

const PAYOUT_LABEL: Record<string, string> = {
  top10: "Top 10% (Flat)",
  top15: "Top 15% (Standard)",
  top20: "Top 20% (Shallow)",
  final: "Final Table (9)",
  wta: "Winner Take All",
};

function TabBtn({
  id,
  active,
  onClick,
  children,
}: {
  id: SetupTab;
  active: SetupTab;
  onClick: (t: SetupTab) => void;
  children: React.ReactNode;
}) {
  const is = id === active;
  return (
    <button
      type="button"
      onClick={() => onClick(id)}
      className={cn(
        "flex-1 rounded-lg px-4 py-2.5 text-sm font-semibold uppercase tracking-wide transition",
        is
          ? "bg-gradient-to-b from-[#ffd54a] via-[#f5c518] to-[#d4a80f] text-[#231b00] shadow-[0_6px_18px_-6px_rgba(245,197,24,0.4)]"
          : "text-neutral-400 hover:text-neutral-200",
      )}
    >
      {children}
    </button>
  );
}

export function CreateTournamentPanel({
  onClose,
  onPublish,
  busy,
}: {
  onClose: () => void;
  onPublish: (draft: DraftForm) => void;
  busy: boolean;
}) {
  const [tab, setTab] = useState<SetupTab>("general");
  const [draft, setDraft] = useState<DraftForm>(() => ({
    ...EMPTY_DRAFT,
    // Seed concrete, operator-editable grids from the presets so the Structure
    // and Financials tabs always open on a real ladder they can tweak per-cell.
    customBlinds: buildBlindLevels(EMPTY_DRAFT),
    customPrizes: buildPrizeTiers(EMPTY_DRAFT.payoutStructure),
  }));
  const [clubs, setClubs] = useState<Array<{ id: string; name: string }>>([]);

  // Load the operator's clubs so the tournament can be bound to one.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const data = (await callSessionRpc("club_list", {})) as { clubs?: Array<{ id: string; name: string }> };
        if (!cancelled) setClubs(Array.isArray(data?.clubs) ? data.clubs : []);
      } catch {
        if (!cancelled) setClubs([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const set = <K extends keyof DraftForm>(k: K, v: DraftForm[K]) =>
    setDraft((d) => ({ ...d, [k]: v }));

  // ── Editable blind ladder ────────────────────────────────────────────────
  const blinds = draft.customBlinds ?? [];
  const setBlinds = (next: BlindLevel[]) => setDraft((d) => ({ ...d, customBlinds: next }));
  const editBlind = (i: number, patch: Partial<BlindLevel>) =>
    setBlinds(blinds.map((b, j) => (j === i ? { ...b, ...patch } : b)));
  const addBlind = () => {
    const played = blinds.filter((b) => !b.is_break);
    const last = played[played.length - 1];
    const nextLevel = played.length + 1;
    const bb = last ? Math.round((last.big_blind * 1.5) / 100) * 100 : 100;
    setBlinds([
      ...blinds,
      { level: nextLevel, small_blind: Math.round(bb / 2), big_blind: bb, ante: Math.round(bb / 8 / 10) * 10, duration_secs: Math.max(60, draft.levelMinutes * 60) },
    ]);
  };
  const addBreak = () =>
    setBlinds([...blinds, { level: 0, small_blind: 0, big_blind: 0, ante: 0, duration_secs: 300, is_break: true }]);
  const removeBlind = (i: number) => setBlinds(blinds.filter((_, j) => j !== i));
  const regenBlinds = () => setBlinds(buildBlindLevels(draft));

  // ── Editable payout ladder ───────────────────────────────────────────────
  const prizes = draft.customPrizes ?? [];
  const setPrizes = (next: Prize[]) => setDraft((d) => ({ ...d, customPrizes: next }));
  const editPrize = (i: number, patch: Partial<Prize>) =>
    setPrizes(prizes.map((p, j) => (j === i ? { ...p, ...patch } : p)));
  const addPrize = () =>
    setPrizes([
      ...prizes,
      { rank_from: prizes.length + 1, rank_to: prizes.length + 1, payout_bps: 0, guaranteed_minor: 0 },
    ]);
  const removePrize = (i: number) => setPrizes(prizes.filter((_, j) => j !== i));
  const regenPrizes = () => setPrizes(buildPrizeTiers(draft.payoutStructure));
  const payoutTotalBps = prizes.reduce((s, p) => s + (Number(p.payout_bps) || 0), 0);
  const payoutOk = payoutTotalBps === 10000;

  // ── Live economics ───────────────────────────────────────────────────────
  // This mirrors store.TournamentMoney on the server, deliberately: the number
  // the operator is shown while building has to be the number the winners are
  // actually paid. The entry fee and the admin percentage come OUT of the
  // buy-in, so the entry price the player sees never changes — the club's share
  // is withheld from the pool.
  const econ = useMemo(() => {
    const buyInMinor = Math.round(draft.buyIn * 100);
    const feeMinor = Math.round(draft.fee * 100);
    const adminMinor = Math.round((buyInMinor * draft.adminFeePct) / 100);
    const perEntryRake = Math.min(buyInMinor, Math.max(0, feeMinor + adminMinor));
    const seats = Math.max(0, draft.maxPlayers);
    const grossMinor = buyInMinor * seats;
    const rakeMinor = perEntryRake * seats;
    let poolMinor = grossMinor - rakeMinor;
    const guaranteeMinor = Math.round(draft.guaranteedPrize * 100);
    const overlayMinor = Math.max(0, guaranteeMinor - poolMinor);
    if (overlayMinor > 0) poolMinor = guaranteeMinor;
    return { buyInMinor, perEntryRake, grossMinor, rakeMinor, poolMinor, overlayMinor };
  }, [draft.buyIn, draft.fee, draft.adminFeePct, draft.maxPlayers, draft.guaranteedPrize]);

  // The fee + admin cut cannot swallow the whole buy-in — the server rejects it,
  // so the form says so before the operator hits publish.
  const rakeTooHigh = econ.buyInMinor > 0 && econ.perEntryRake >= econ.buyInMinor;

  // Late-reg window in seconds, derived from the close time on the General tab.
  const lateRegSecs = useMemo(() => {
    if (!draft.lateReg || !draft.regCloseAt || !draft.scheduledAt) return 0;
    const start = new Date(draft.scheduledAt).getTime();
    const close = new Date(draft.regCloseAt).getTime();
    if (!Number.isFinite(start) || !Number.isFinite(close) || close <= start) return 0;
    return Math.round((close - start) / 1000);
  }, [draft.lateReg, draft.regCloseAt, draft.scheduledAt]);

  // Which preset the current values correspond to (custom values fall back to
  // the first entry rather than showing a blank select).
  const hoursPresetId =
    HOURS_PRESETS.find((h) => h.start === draft.operatingStartMin && h.end === draft.operatingEndMin)?.id ??
    HOURS_PRESETS[0].id;
  const timeBankPresetId =
    TIMEBANK_PRESETS.find(
      (t) => t.total === draft.timeBankSecs && t.perHand === draft.timeBankPerHandSecs,
    )?.id ?? TIMEBANK_PRESETS[0].id;

  const totalBuyInMinor = econ.buyInMinor;
  const valid = draft.name.trim().length > 0 && draft.buyIn >= 0 && !rakeTooHigh;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-4 backdrop-blur-sm">
      <div className={cn(GLASS_PANEL, "my-6 w-full max-w-6xl border-gold/25 p-6")}>
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-muted">
              Tournament Center
            </p>
            <h2 className="mt-1 font-display text-3xl font-bold uppercase tracking-tight text-white">
              Comprehensive Tournament Setup
            </h2>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button variant="primary" onClick={() => valid && onPublish(draft)} disabled={busy || !valid}>
              {busy ? "Publishing…" : "♛ Save & Publish"}
            </Button>
          </div>
        </div>

        {/* Tabs */}
        <div className="mt-6 flex gap-1 rounded-xl border border-white/10 bg-black/30 p-1">
          <TabBtn id="general" active={tab} onClick={setTab}>
            General
          </TabBtn>
          <TabBtn id="structure" active={tab} onClick={setTab}>
            Structure
          </TabBtn>
          <TabBtn id="financials" active={tab} onClick={setTab}>
            Financials
          </TabBtn>
          <TabBtn id="rules" active={tab} onClick={setTab}>
            Rules
          </TabBtn>
        </div>

        {/* Body: form + summary */}
        <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_300px]">
          <div className="space-y-6">
            {tab === "general" && (
              <div className="grid gap-5 sm:grid-cols-2">
                <Field label="Tournament Name" className="sm:col-span-2">
                  <Input
                    value={draft.name}
                    onChange={(e) => set("name", e.target.value)}
                    placeholder="High Rollers Weekly Championship"
                  />
                </Field>
                <Field label="Start Date & Time">
                  <Input
                    type="datetime-local"
                    value={draft.scheduledAt}
                    onChange={(e) => set("scheduledAt", e.target.value)}
                  />
                </Field>
                <Field label="Variant">
                  <Select value={draft.variant} onChange={(e) => set("variant", e.target.value)}>
                    <option value="texas-holdem">Texas Hold&apos;em</option>
                    <option value="omaha">Pot-Limit Omaha</option>
                  </Select>
                </Field>
                <Field label="Club" hint="Leave as Platform for a network-wide event.">
                  <Select value={draft.clubId} onChange={(e) => set("clubId", e.target.value)}>
                    <option value="">Platform (no club)</option>
                    {clubs.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Buy-in Amount ($)">
                  <Input
                    type="number"
                    min={0}
                    value={draft.buyIn}
                    onChange={(e) => set("buyIn", Number(e.target.value))}
                  />
                </Field>
                <Field label="Registration Fee ($)">
                  <Input
                    type="number"
                    min={0}
                    value={draft.fee}
                    onChange={(e) => set("fee", Number(e.target.value))}
                  />
                </Field>
                <Field label="Max Players">
                  <Input
                    type="number"
                    min={2}
                    value={draft.maxPlayers}
                    onChange={(e) => set("maxPlayers", Number(e.target.value))}
                  />
                </Field>
                {/* Knockout (PKO): part of each buy-in becomes a head bounty won
                    on elimination. Bounty must be less than the buy-in. */}
                <Field label="Knockout (Bounty)">
                  <label className="flex items-center gap-2 py-2 text-sm text-neutral-300">
                    <input
                      type="checkbox"
                      checked={Boolean(draft.knockout)}
                      onChange={(e) => set("knockout", e.target.checked)}
                      className="h-4 w-4 accent-gold"
                    />
                    Eliminating a player wins their bounty
                  </label>
                </Field>
                {draft.knockout && (
                  <Field label="Per-Player Bounty ($)" hint="Must be less than the buy-in.">
                    <Input
                      type="number"
                      min={1}
                      max={Math.max(0, draft.buyIn - 1)}
                      value={draft.bounty ?? 0}
                      onChange={(e) => set("bounty", Number(e.target.value))}
                    />
                  </Field>
                )}
                <Field label="Number of Levels">
                  <Input
                    type="number"
                    min={1}
                    value={draft.numLevels}
                    onChange={(e) => set("numLevels", Number(e.target.value))}
                  />
                </Field>
                <Field label="Registration Close Time" hint="Late registration ends" className="sm:col-span-2">
                  <Input
                    type="datetime-local"
                    value={draft.regCloseAt}
                    onChange={(e) => set("regCloseAt", e.target.value)}
                  />
                </Field>
                <label className="flex items-center justify-between rounded-xl border border-white/10 bg-black/30 px-4 py-3 sm:col-span-2">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400">
                    Late Registration
                  </span>
                  <input
                    type="checkbox"
                    checked={draft.lateReg}
                    onChange={(e) => set("lateReg", e.target.checked)}
                    className="h-5 w-9 cursor-pointer appearance-none rounded-full bg-neutral-700 transition checked:bg-green"
                  />
                </label>
              </div>
            )}

            {tab === "structure" && (
              <div className="space-y-5">
                <div className="grid gap-5 sm:grid-cols-2">
                  <Field label="Starting Stack (chips)">
                    <Input
                      type="number"
                      min={1000}
                      value={draft.startingStack}
                      onChange={(e) => set("startingStack", Number(e.target.value))}
                    />
                  </Field>
                  <Field label="Seats Per Table">
                    <Select
                      value={String(draft.maxSeatsPerTable)}
                      onChange={(e) => set("maxSeatsPerTable", Number(e.target.value))}
                    >
                      <option value="6">6-max</option>
                      <option value="9">9-handed</option>
                      <option value="2">Heads-up</option>
                    </Select>
                  </Field>
                  <Field label="Default Level Length (mins)" hint="Applied to new levels & Regenerate">
                    <Select
                      value={String(draft.levelMinutes)}
                      onChange={(e) => set("levelMinutes", Number(e.target.value))}
                    >
                      <option value="10">Every 10 mins</option>
                      <option value="15">Every 15 mins</option>
                      <option value="20">Every 20 mins</option>
                      <option value="30">Every 30 mins</option>
                    </Select>
                  </Field>
                </div>

                {/* Editable blind ladder — every SB/BB/ante/duration persists via
                    blind_level_add on publish. */}
                <div>
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-neutral-400">
                      Blind Structure · {blinds.length} rows
                    </p>
                    <button
                      type="button"
                      onClick={regenBlinds}
                      className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400 hover:text-gold"
                    >
                      ↻ Regenerate from settings
                    </button>
                  </div>
                  <div className="overflow-x-auto rounded-xl border border-white/10">
                    <table className="w-full text-left text-sm">
                      <thead>
                        <tr className="border-b border-white/10 bg-white/[0.03] text-[11px] uppercase tracking-wider text-muted">
                          <th className="px-3 py-2">Lvl</th>
                          <th className="px-2 py-2">Small</th>
                          <th className="px-2 py-2">Big</th>
                          <th className="px-2 py-2">Ante</th>
                          <th className="px-2 py-2">Mins</th>
                          <th className="px-2 py-2" />
                        </tr>
                      </thead>
                      <tbody>
                        {blinds.map((b, i) =>
                          b.is_break ? (
                            <tr key={i} className="border-b border-white/5 bg-gold/[0.04]">
                              <td className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-gold" colSpan={4}>
                                ☕ Break
                              </td>
                              <td className="px-1 py-1">
                                <input
                                  type="number"
                                  className={CELL}
                                  value={Math.round(b.duration_secs / 60)}
                                  onChange={(e) => editBlind(i, { duration_secs: (Number(e.target.value) || 0) * 60 })}
                                />
                              </td>
                              <td className="px-2 py-1 text-right">
                                <button type="button" onClick={() => removeBlind(i)} className="text-neutral-500 hover:text-brand">
                                  ✕
                                </button>
                              </td>
                            </tr>
                          ) : (
                            <tr key={i} className="border-b border-white/5">
                              <td className="px-3 py-1.5 text-neutral-400">{b.level}</td>
                              {(["small_blind", "big_blind", "ante"] as const).map((k) => (
                                <td key={k} className="px-1 py-1">
                                  <input
                                    type="number"
                                    className={CELL}
                                    value={b[k]}
                                    onChange={(e) => editBlind(i, { [k]: Number(e.target.value) || 0 })}
                                  />
                                </td>
                              ))}
                              <td className="px-1 py-1">
                                <input
                                  type="number"
                                  className={CELL}
                                  value={Math.round(b.duration_secs / 60)}
                                  onChange={(e) => editBlind(i, { duration_secs: (Number(e.target.value) || 0) * 60 })}
                                />
                              </td>
                              <td className="px-2 py-1 text-right">
                                <button type="button" onClick={() => removeBlind(i)} className="text-neutral-500 hover:text-brand">
                                  ✕
                                </button>
                              </td>
                            </tr>
                          ),
                        )}
                      </tbody>
                    </table>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-4">
                    <button
                      type="button"
                      onClick={addBlind}
                      className="text-xs font-semibold uppercase tracking-wider text-neutral-300 hover:text-white"
                    >
                      + Add level
                    </button>
                    <button
                      type="button"
                      onClick={addBreak}
                      className="text-xs font-semibold uppercase tracking-wider text-neutral-300 hover:text-gold"
                    >
                      + Add break
                    </button>
                  </div>
                </div>
              </div>
            )}

            {tab === "financials" && (
              <div className="space-y-5">
                <div className="grid gap-5 sm:grid-cols-2">
                  <Field label="Payout Preset" hint="Loads a ladder you can then edit" className="sm:col-span-2">
                    <Select
                      value={draft.payoutStructure}
                      onChange={(e) => {
                        const structure = e.target.value;
                        setDraft((d) => ({ ...d, payoutStructure: structure, customPrizes: buildPrizeTiers(structure) }));
                      }}
                    >
                      {Object.entries(PAYOUT_LABEL).map(([k, v]) => (
                        <option key={k} value={k}>
                          {v}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Guaranteed Prize ($)">
                    <Input
                      type="number"
                      min={0}
                      value={draft.guaranteedPrize}
                      onChange={(e) => set("guaranteedPrize", Number(e.target.value))}
                    />
                  </Field>
                  <Field
                    label="Admin Fee (% of buy-in)"
                    hint="The club's percentage, charged on top of the flat entry fee. Both come out of the buy-in, so the entry price does not change."
                  >
                    <Input
                      type="number"
                      min={0}
                      max={50}
                      step={0.5}
                      value={draft.adminFeePct}
                      onChange={(e) => set("adminFeePct", Math.max(0, Math.min(50, Number(e.target.value) || 0)))}
                    />
                  </Field>
                  {rakeTooHigh && (
                    <p className="text-xs text-gold-lite sm:col-span-2">
                      The ${draft.fee.toLocaleString()} entry fee plus {draft.adminFeePct}% admin fee take
                      the whole ${draft.buyIn.toLocaleString()} buy-in — there would be nothing left to
                      play for. The server rejects this too.
                    </p>
                  )}
                </div>

                {/* Editable payout tiers — rank range, share %, and per-tier
                    guarantee ($) all persist via prize_pool_add on publish. */}
                <div>
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-neutral-400">
                    Payout Ladder · {prizes.length} tiers
                  </p>
                  <div className="overflow-x-auto rounded-xl border border-white/10">
                    <table className="w-full text-left text-sm">
                      <thead>
                        <tr className="border-b border-white/10 bg-white/[0.03] text-[11px] uppercase tracking-wider text-muted">
                          <th className="px-3 py-2">From</th>
                          <th className="px-2 py-2">To</th>
                          <th className="px-2 py-2">Share %</th>
                          <th className="px-2 py-2">Min Guarantee ($)</th>
                          <th className="px-2 py-2" />
                        </tr>
                      </thead>
                      <tbody>
                        {prizes.map((p, i) => (
                          <tr key={i} className="border-b border-white/5">
                            {(["rank_from", "rank_to"] as const).map((k) => (
                              <td key={k} className="px-1 py-1">
                                <input
                                  type="number"
                                  className={CELL}
                                  value={p[k]}
                                  onChange={(e) => editPrize(i, { [k]: Number(e.target.value) || 0 })}
                                />
                              </td>
                            ))}
                            <td className="px-1 py-1">
                              <input
                                type="number"
                                step="0.5"
                                className={CELL}
                                value={p.payout_bps / 100}
                                onChange={(e) => editPrize(i, { payout_bps: Math.round((Number(e.target.value) || 0) * 100) })}
                              />
                            </td>
                            <td className="px-1 py-1">
                              <input
                                type="number"
                                min={0}
                                className={CELL}
                                value={Math.round((p.guaranteed_minor || 0) / 100)}
                                onChange={(e) => editPrize(i, { guaranteed_minor: (Number(e.target.value) || 0) * 100 })}
                              />
                            </td>
                            <td className="px-2 py-1 text-right">
                              <button type="button" onClick={() => removePrize(i)} className="text-neutral-500 hover:text-brand">
                                ✕
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex gap-4">
                      <button
                        type="button"
                        onClick={addPrize}
                        className="text-xs font-semibold uppercase tracking-wider text-neutral-300 hover:text-white"
                      >
                        + Add tier
                      </button>
                      <button
                        type="button"
                        onClick={regenPrizes}
                        className="text-xs font-semibold uppercase tracking-wider text-neutral-400 hover:text-gold"
                      >
                        ↻ Reset to preset
                      </button>
                    </div>
                    <p className={cn("text-sm font-semibold", payoutOk ? "text-green" : "text-brand")}>
                      Total {(payoutTotalBps / 100).toFixed(1)}% {payoutOk ? "✓" : "— must equal 100% to start"}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {tab === "rules" && (
              <div className="grid gap-5 sm:grid-cols-2">
                <label className="flex cursor-pointer items-center justify-between rounded-xl border border-white/10 bg-black/30 px-4 py-3 transition hover:border-white/20 sm:col-span-2">
                  <span>
                    <span className="block text-[11px] font-semibold uppercase tracking-wider text-neutral-300">
                      Auto-Away on 2× Timeout
                    </span>
                    <span className="mt-0.5 block text-[11px] text-neutral-500">
                      Two consecutive time-outs sit the player out. Their stack stays at the table —
                      a tournament seat is never stood up.
                    </span>
                  </span>
                  <input
                    type="checkbox"
                    checked={draft.autoAway}
                    onChange={(e) => set("autoAway", e.target.checked)}
                    className="h-4 w-4 shrink-0 accent-[#22c55e]"
                  />
                </label>

                <Field label="Time Bank" hint="Total banked seconds, plus a top-up each hand">
                  <Select
                    value={timeBankPresetId}
                    onChange={(e) => {
                      const preset = TIMEBANK_PRESETS.find((t) => t.id === e.target.value);
                      if (!preset) return;
                      setDraft((d) => ({
                        ...d,
                        timeBankSecs: preset.total,
                        timeBankPerHandSecs: preset.perHand,
                      }));
                    }}
                  >
                    {TIMEBANK_PRESETS.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.label}
                      </option>
                    ))}
                  </Select>
                </Field>

                <Field
                  label="Operating Hours"
                  hint="Registration is refused outside this daily window"
                >
                  <Select
                    value={hoursPresetId}
                    onChange={(e) => {
                      const preset = HOURS_PRESETS.find((h) => h.id === e.target.value);
                      if (!preset) return;
                      setDraft((d) => ({
                        ...d,
                        operatingStartMin: preset.start,
                        operatingEndMin: preset.end,
                      }));
                    }}
                  >
                    {HOURS_PRESETS.map((h) => (
                      <option key={h.id} value={h.id}>
                        {h.label}
                      </option>
                    ))}
                  </Select>
                </Field>

                <label className="flex cursor-pointer items-center justify-between rounded-xl border border-white/10 bg-black/30 px-4 py-3 transition hover:border-white/20 sm:col-span-2">
                  <span>
                    <span className="block text-[11px] font-semibold uppercase tracking-wider text-neutral-300">
                      Late Registration
                    </span>
                    <span className="mt-0.5 block text-[11px] text-neutral-500">
                      {draft.lateReg
                        ? lateRegSecs > 0
                          ? `Open for ${Math.round(lateRegSecs / 60)} min after the scheduled start — set the close time on the General tab.`
                          : "On, but no close time set on the General tab — registration would still shut at the start time."
                        : "Registration closes the moment the tournament starts."}
                    </span>
                  </span>
                  <input
                    type="checkbox"
                    checked={draft.lateReg}
                    onChange={(e) => set("lateReg", e.target.checked)}
                    className="h-4 w-4 shrink-0 accent-[#22c55e]"
                  />
                </label>
              </div>
            )}
          </div>

          {/* Summary sidebar */}
          <div className={cn(GLASS_PANEL, "h-fit border-gold/20 p-5")}>
            <p className="font-display text-sm font-bold uppercase tracking-wider text-gold">
              Tournament Summary
            </p>
            <dl className="mt-4 space-y-3 text-sm">
              <SummaryRow
                label="Est. Prize Pool"
                value={dollars(econ.poolMinor, { compact: true })}
                tone="cyan"
              />
              <SummaryRow label="Entry Price" value={dollars(totalBuyInMinor)} />
              <SummaryRow
                label="Club Take"
                value={`${dollars(econ.rakeMinor, { compact: true })} · ${dollars(econ.perEntryRake)}/entry`}
                tone="gold"
              />
              {econ.overlayMinor > 0 && (
                <SummaryRow
                  label="Overlay Risk"
                  value={dollars(econ.overlayMinor, { compact: true })}
                  tone="brand"
                />
              )}
              <SummaryRow label="Starting Chips" value={draft.startingStack.toLocaleString()} />
              <SummaryRow
                label="Blind Levels"
                value={`${blinds.filter((b) => !b.is_break).length} lvls · ${blinds.filter((b) => b.is_break).length} breaks`}
              />
              <SummaryRow
                label="Payout"
                value={`${prizes.length} tiers · ${(payoutTotalBps / 100).toFixed(0)}%`}
                tone={payoutOk ? "cyan" : undefined}
              />
              <div className="flex items-center justify-between border-t border-white/10 pt-3">
                <dt className="text-neutral-500">Status</dt>
                <dd>
                  <Tag tone="gold">Draft 🔒</Tag>
                </dd>
              </div>
            </dl>
            <p className="mt-4 text-[11px] leading-relaxed text-neutral-500">
              The estimate assumes a full {draft.maxPlayers.toLocaleString()}-player field. Entry fee and
              admin fee are withheld from the pool, not added to the entry price
              {econ.overlayMinor > 0 ? ", and the club funds the overlay if the field falls short" : ""}.
            </p>
            <p className="mt-3 text-[11px] text-neutral-600">
              Publishing calls <span className="text-gold-lite">tournament_create</span> and seeds the ladder
              via <span className="text-gold-lite">blind_level_add</span> /{" "}
              <span className="text-gold-lite">prize_pool_add</span>.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function SummaryRow({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  /** cyan = money in (green), gold = the club's cut, brand = a cost/risk. */
  tone?: "default" | "cyan" | "gold" | "brand";
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="shrink-0 text-neutral-500">{label}</dt>
      <dd
        className={cn(
          "text-right font-semibold tabular-nums",
          tone === "cyan"
            ? "text-green"
            : tone === "gold"
              ? "text-gold"
              : tone === "brand"
                ? "text-gold-lite"
                : "text-white",
        )}
      >
        {value}
      </dd>
    </div>
  );
}
