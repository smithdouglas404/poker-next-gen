"use client";

import { useMemo, useState } from "react";

import { Select } from "@/features/ui";
import { GLASS_PANEL, cn } from "@/features/ui/tokens";

import { ownerApi } from "./ownerRpc";
import { SectionTitle } from "./ui";
import type { RosterRow } from "./types";

// Operators & Equity — the rich home for club_owner_add (grant owner/manager/
// agent seats with a revenue-equity split + can_configure) and balance_get
// (look up a player's club bankroll). These flows previously existed ONLY in the
// Command Center; this is their dedicated screen.

const ROLES = ["owner", "manager", "agent"] as const;
type OpRole = (typeof ROLES)[number];

export function OperatorsEquity({
  clubId,
  roster,
  canManage,
  demo,
  onChanged,
}: {
  clubId: string;
  roster: RosterRow[];
  canManage: boolean;
  demo: boolean;
  onChanged: () => void;
}) {
  // Current operator seats (owner/manager/agent, or anyone who can configure).
  const operators = useMemo(
    () => roster.filter((r) => ROLES.includes(r.role as OpRole) || r.can_configure),
    [roster],
  );

  // Add-operator form state.
  const [userId, setUserId] = useState("");
  const [role, setRole] = useState<OpRole>("manager");
  const [equityPct, setEquityPct] = useState("25");
  const [canConfigure, setCanConfigure] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // Balance-lookup state.
  const [lookupId, setLookupId] = useState("");
  const [lookup, setLookup] = useState<string | null>(null);

  const disabled = !canManage || demo;
  const equityBps = Math.round(Math.max(0, Math.min(100, Number(equityPct) || 0)) * 100);

  const grant = async () => {
    if (!userId) {
      setMsg({ ok: false, text: "Pick a member to grant a seat to." });
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      await ownerApi.addOwner(clubId, userId, role, equityBps, canConfigure);
      const name = roster.find((r) => r.user_id === userId)?.username ?? "member";
      setMsg({ ok: true, text: `${name} is now a ${role} with ${(equityBps / 100).toFixed(1)}% equity.` });
      onChanged();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Grant failed." });
    } finally {
      setBusy(false);
    }
  };

  const doLookup = async () => {
    if (!lookupId) return;
    setLookup("…");
    try {
      const b = await ownerApi.getBalance(clubId, lookupId);
      const cents = Number(b.balance ?? 0);
      const locked = Number(b.locked_amount ?? 0);
      setLookup(`$${(cents / 100).toFixed(2)} ${b.currency ?? "USD"}${locked ? ` (locked $${(locked / 100).toFixed(2)})` : ""}`);
    } catch (e) {
      setLookup(e instanceof Error ? e.message : "lookup failed");
    }
  };

  return (
    <div className="space-y-6">
      <SectionTitle eyebrow="Ownership" title="Operators & Equity" />

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Grant an operator seat */}
        <div className={cn(GLASS_PANEL, "flex flex-col gap-4 p-5")}>
          <p className="font-display text-lg font-semibold text-white">Grant Operator Seat</p>
          <p className="-mt-2 text-[11px] text-white/45">
            Add an owner, manager, or agent with a revenue-equity split. Managers/agents
            with &ldquo;can configure&rdquo; may edit club settings.
          </p>

          <label className="block">
            <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-white/45">Member</span>
            <Select value={userId} onChange={(e) => setUserId(e.target.value)} disabled={disabled}>
              <option value="">Select a member…</option>
              {roster.map((r) => (
                <option key={r.user_id} value={r.user_id}>
                  {r.username} · {r.role}
                </option>
              ))}
            </Select>
          </label>

          <label className="block">
            <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-white/45">Role</span>
            <Select value={role} onChange={(e) => setRole(e.target.value as OpRole)} disabled={disabled}>
              {ROLES.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </Select>
          </label>

          <label className="block">
            <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-white/45">
              Equity split — {(equityBps / 100).toFixed(1)}%
            </span>
            <div className="flex items-center gap-3">
              <input
                type="range" min={0} max={100} step={0.5}
                value={equityPct} onChange={(e) => setEquityPct(e.target.value)} disabled={disabled}
                className="flex-1 accent-[#f5c518]"
              />
              <div className="flex items-center gap-1 rounded-lg border border-white/12 bg-black/40 px-2 py-1.5">
                <input
                  type="number" min={0} max={100} step={0.5}
                  value={equityPct} onChange={(e) => setEquityPct(e.target.value)} disabled={disabled}
                  className="w-12 bg-transparent text-right text-sm text-white outline-none"
                />
                <span className="text-white/40">%</span>
              </div>
            </div>
          </label>

          <label className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-white/90">Can configure club</p>
              <p className="text-[11px] text-white/40">Grant permission to edit rake, tables, and settings.</p>
            </div>
            <button
              type="button" role="switch" aria-checked={canConfigure}
              onClick={() => setCanConfigure((v) => !v)} disabled={disabled}
              className={cn(
                "relative h-7 w-12 shrink-0 rounded-full border transition disabled:opacity-50",
                canConfigure ? "border-transparent bg-gold" : "border-white/15 bg-white/5",
              )}
            >
              <span className={cn("absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all", canConfigure ? "left-[26px]" : "left-0.5")} />
            </button>
          </label>

          <button
            type="button" onClick={grant} disabled={disabled || busy}
            className={cn(
              "mt-auto rounded-lg py-2.5 font-display text-sm font-bold uppercase tracking-wider text-black transition",
              "bg-gradient-to-r from-[#9a7b2c] via-[#f5c518] to-[#f3e2ad] hover:shadow-[0_0_20px_rgba(245,197,24,0.3)]",
              (disabled || busy) && "opacity-40",
            )}
          >
            {busy ? "Granting…" : "Grant Seat"}
          </button>
          {msg && (
            <p className={cn("text-[12px]", msg.ok ? "text-green" : "text-brand")}>{msg.text}</p>
          )}
          {demo && <p className="text-[11px] text-white/40">Demo mode — grants are disabled.</p>}
        </div>

        {/* Current operators + balance lookup */}
        <div className="flex flex-col gap-4">
          <div className={cn(GLASS_PANEL, "flex flex-col gap-3 p-5")}>
            <p className="font-display text-lg font-semibold text-white">Current Operators</p>
            {operators.length === 0 && <p className="text-sm text-white/45">No operator seats yet.</p>}
            {operators.map((op) => (
              <div key={op.user_id} className="flex items-center justify-between rounded-xl border border-white/[0.06] bg-black/30 px-3 py-2">
                <div>
                  <p className="text-sm font-medium text-white">{op.username}</p>
                  <p className="text-[11px] text-white/45">{op.role}{op.can_configure ? " · can configure" : ""}</p>
                </div>
                <span className="rounded-full bg-gold/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-gold">
                  {op.role}
                </span>
              </div>
            ))}
          </div>

          <div className={cn(GLASS_PANEL, "flex flex-col gap-3 p-5")}>
            <p className="font-display text-lg font-semibold text-white">Player Balance Lookup</p>
            <Select value={lookupId} onChange={(e) => { setLookupId(e.target.value); setLookup(null); }}>
              <option value="">Select a member…</option>
              {roster.map((r) => (
                <option key={r.user_id} value={r.user_id}>{r.username}</option>
              ))}
            </Select>
            <button
              type="button" onClick={doLookup} disabled={!lookupId}
              className="rounded-lg border border-gold/40 bg-gold/10 py-2 text-sm font-semibold uppercase tracking-wider text-gold transition hover:bg-gold/15 disabled:opacity-40"
            >
              Look up balance
            </button>
            {lookup && (
              <p className="rounded-lg border border-white/[0.06] bg-black/30 px-3 py-2 text-sm text-white">
                Club balance: <span className="font-semibold text-green">{lookup}</span>
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
