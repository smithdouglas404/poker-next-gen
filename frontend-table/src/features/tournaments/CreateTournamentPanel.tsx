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
};

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
          ? "bg-brand text-white shadow-[0_6px_18px_-6px_rgba(224,30,43,0.4)]"
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

  const estPrizeMinor = useMemo(
    () => Math.max(draft.guaranteedPrize * 100, draft.buyIn * 100 * draft.maxPlayers),
    [draft.guaranteedPrize, draft.buyIn, draft.maxPlayers],
  );
  const totalBuyInMinor = (draft.buyIn + draft.fee) * 100;
  const valid = draft.name.trim().length > 0 && draft.buyIn >= 0;

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
                  <Field label="Admin Fee (% of buy-in)" hint="Deducted from each entry as rake">
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      value={draft.buyIn > 0 ? Math.round((draft.fee / draft.buyIn) * 100) : 0}
                      onChange={(e) =>
                        set("fee", Math.round((Number(e.target.value) / 100) * draft.buyIn))
                      }
                    />
                  </Field>
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
                <label className="flex items-center justify-between rounded-xl border border-white/10 bg-black/30 px-4 py-3 sm:col-span-2">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400">
                    Auto-Away on 2× Timeout
                  </span>
                  <span className="text-[11px] text-green">Enabled</span>
                </label>
                <Field label="Time Bank">
                  <Select defaultValue="60">
                    <option value="30">30s total, 5s per hand</option>
                    <option value="60">60s total, 5s per hand</option>
                    <option value="120">120s total, 10s per hand</option>
                  </Select>
                </Field>
                <Field label="Operating Hours">
                  <Select defaultValue="18-04">
                    <option value="00-24">24 hours</option>
                    <option value="18-04">18:00 - 04:00 UTC</option>
                    <option value="12-00">12:00 - 00:00 UTC</option>
                  </Select>
                </Field>
              </div>
            )}
          </div>

          {/* Summary sidebar */}
          <div className={cn(GLASS_PANEL, "h-fit border-gold/20 p-5")}>
            <p className="font-display text-sm font-bold uppercase tracking-wider text-gold">
              Tournament Summary
            </p>
            <dl className="mt-4 space-y-3 text-sm">
              <SummaryRow label="Est. Prize Pool" value={`${dollars(estPrizeMinor, { compact: true })}+`} tone="cyan" />
              <SummaryRow label="Total Buy-in" value={dollars(totalBuyInMinor)} />
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
            <p className="mt-4 text-[11px] text-neutral-500">
              Publishing calls <span className="text-brand">tournament_create</span>, seeds the ladder via{" "}
              <span className="text-brand">blind_level_add</span> /{" "}
              <span className="text-brand">prize_pool_add</span>, and opens registration immediately.
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
  tone?: "default" | "cyan";
}) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-neutral-500">{label}</dt>
      <dd className={cn("font-semibold", tone === "cyan" ? "text-green" : "text-white")}>{value}</dd>
    </div>
  );
}
