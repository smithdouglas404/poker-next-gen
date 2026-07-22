"use client";

import { useMemo, useState } from "react";

import { Button, Field, Input, Select } from "@/features/ui";
import { GLASS_PANEL, cn } from "@/features/ui/tokens";

import { Tag } from "./atoms";
import { dollars } from "./format";
import type { DraftForm } from "./types";

type SetupTab = "general" | "structure" | "financials" | "rules";

const EMPTY_DRAFT: DraftForm = {
  name: "",
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
  lateReg: true,
  scheduledAt: "",
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
  const [draft, setDraft] = useState<DraftForm>(EMPTY_DRAFT);

  const set = <K extends keyof DraftForm>(k: K, v: DraftForm[K]) =>
    setDraft((d) => ({ ...d, [k]: v }));

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
                    <option value="plo">Pot-Limit Omaha</option>
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
                <Field label="Number of Levels">
                  <Input
                    type="number"
                    min={1}
                    value={draft.numLevels}
                    onChange={(e) => set("numLevels", Number(e.target.value))}
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
                <Field label="Blind Level Increase Interval">
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
                <Field label="Break Schedule" hint="Add a break between levels">
                  <Button variant="outline" size="md" className="w-full justify-start" onClick={() => {}}>
                    + Add Break
                  </Button>
                </Field>
              </div>
            )}

            {tab === "financials" && (
              <div className="grid gap-5 sm:grid-cols-2">
                <Field label="Payout Structure" className="sm:col-span-2">
                  <Select
                    value={draft.payoutStructure}
                    onChange={(e) => set("payoutStructure", e.target.value)}
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
              <SummaryRow label="Blind Levels" value={`${draft.numLevels} × ${draft.levelMinutes}m`} />
              <SummaryRow label="Payout" value={PAYOUT_LABEL[draft.payoutStructure]} />
              <div className="flex items-center justify-between border-t border-white/10 pt-3">
                <dt className="text-neutral-500">Status</dt>
                <dd>
                  <Tag tone="gold">Draft 🔒</Tag>
                </dd>
              </div>
            </dl>
            <p className="mt-4 text-[11px] text-neutral-500">
              Publishing calls <span className="text-brand">tournament_create</span> and opens registration
              immediately.
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
