"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

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
  clubName,
  roster,
  canManage,
  demo,
  onChanged,
}: {
  clubId: string;
  clubName?: string;
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

  // Ownership transfer + licence state.
  const [transferTo, setTransferTo] = useState("");
  const [transferBusy, setTransferBusy] = useState(false);
  const [transferMsg, setTransferMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [licence, setLicence] = useState<{
    can_host_cash: boolean;
    licensed_by?: string;
    reason?: string;
  } | null>(null);

  const loadLicence = useCallback(() => {
    if (!clubId || demo) return;
    void ownerApi
      .licence(clubId)
      .then(setLicence)
      .catch(() => setLicence(null));
  }, [clubId, demo]);

  useEffect(loadLicence, [loadLicence]);

  // Seat removal state.
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [removeMsg, setRemoveMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const removeSeat = async (op: RosterRow) => {
    if (
      typeof window !== "undefined" &&
      !window.confirm(
        `Remove ${op.username}'s ${op.role} seat from ${clubName || "this club"}?\n\n` +
          "They lose operator access and their equity split. This cannot be undone from here.",
      )
    ) {
      return;
    }
    setRemovingId(op.user_id);
    setRemoveMsg(null);
    try {
      const res = await ownerApi.removeOwner(clubId, op.user_id);
      setRemoveMsg({ ok: true, text: `Removed ${op.username}'s ${res.removed_role} seat.` });
      loadLicence();
      onChanged();
    } catch (e) {
      // The server refuses to remove a club's only owner, and refuses removing
      // an owner whose licence nothing else would cover — both messages tell
      // the operator exactly what to do instead, so show them verbatim.
      setRemoveMsg({ ok: false, text: e instanceof Error ? e.message : "Could not remove that seat." });
    } finally {
      setRemovingId(null);
    }
  };

  // Transfer is irreversible from this side — the outgoing owner is demoted to
  // manager and cannot transfer it back. Name the consequence before the click,
  // not in a toast afterwards.
  const doTransfer = async () => {
    if (!transferTo) return;
    const name = roster.find((r) => r.user_id === transferTo)?.username ?? "that member";
    if (
      typeof window !== "undefined" &&
      !window.confirm(
        `Transfer ${clubName || "this club"} to ${name}?\n\n` +
          "They become the primary owner. You are demoted to manager and cannot " +
          "undo this yourself — only the new owner can transfer it back.",
      )
    ) {
      return;
    }
    setTransferBusy(true);
    setTransferMsg(null);
    try {
      await ownerApi.transferOwnership(clubId, transferTo);
      setTransferMsg({ ok: true, text: `${name} is now the primary owner of this club.` });
      setTransferTo("");
      loadLicence();
      onChanged();
    } catch (e) {
      // The server refuses a transfer that would revoke the club's cash licence
      // and says exactly what the recipient is missing. Show it verbatim — a
      // generic "transfer failed" leaves the operator with nothing to act on.
      setTransferMsg({ ok: false, text: e instanceof Error ? e.message : "Transfer failed." });
    } finally {
      setTransferBusy(false);
    }
  };

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
              <div key={op.user_id} className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.06] bg-black/30 px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-white">{op.username}</p>
                  <p className="text-[11px] text-white/45">{op.role}{op.can_configure ? " · can configure" : ""}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="rounded-full bg-gold/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-gold">
                    {op.role}
                  </span>
                  <button
                    type="button"
                    onClick={() => void removeSeat(op)}
                    disabled={disabled || removingId === op.user_id}
                    aria-label={`Remove ${op.username}'s seat`}
                    className="rounded-md px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-white/40 transition hover:bg-gold/10 hover:text-gold-lite disabled:opacity-30"
                  >
                    {removingId === op.user_id ? "…" : "Remove"}
                  </button>
                </div>
              </div>
            ))}
            {removeMsg && (
              <p className={cn("text-[12px]", removeMsg.ok ? "text-green" : "text-brand")}>
                {removeMsg.text}
              </p>
            )}
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

      {/* Transfer primary ownership. `club_transfer_ownership` shipped with the
          club backend and its only caller was in the dead features/clubs/sections
          tree, so in the running app an owner could not hand over a club at all. */}
      <div className={cn(GLASS_PANEL, "flex flex-col gap-4 p-5")}>
        <div>
          <p className="font-display text-lg font-semibold text-white">Transfer Ownership</p>
          <p className="mt-1 text-[11px] text-white/45">
            Hand this club to another member. They become the primary owner; you are
            demoted to manager and cannot reverse it yourself.
          </p>
        </div>

        {/* The licence travels with the owner, so the transfer's real consequence
            is whether the club can still run cash games afterwards. */}
        {licence && (
          <div
            className={cn(
              "rounded-xl border px-3 py-2.5 text-[12px]",
              licence.can_host_cash
                ? "border-emerald-500/25 bg-emerald-500/[0.06] text-green"
                : "border-white/10 bg-black/30 text-white/60",
            )}
          >
            {licence.can_host_cash ? (
              <>
                This club is licensed for cash games. That licence belongs to an
                owner — transferring to someone without a sponsor-capable membership
                and completed KYC will be refused unless another qualified owner
                remains.
              </>
            ) : (
              <>Cash games are not currently licensed here{licence.reason ? ` — ${licence.reason}` : ""}.</>
            )}
          </div>
        )}

        <div className="flex flex-wrap items-end gap-3">
          <label className="min-w-[220px] flex-1">
            <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-white/45">
              New primary owner
            </span>
            <Select
              value={transferTo}
              onChange={(e) => setTransferTo(e.target.value)}
              disabled={disabled}
            >
              <option value="">Select a member…</option>
              {roster.map((r) => (
                <option key={r.user_id} value={r.user_id}>
                  {r.username} · {r.role}
                </option>
              ))}
            </Select>
          </label>
          <button
            type="button"
            onClick={doTransfer}
            disabled={disabled || transferBusy || !transferTo}
            className={cn(
              "rounded-lg border border-gold/50 bg-gold/10 px-5 py-2.5 font-display text-sm font-bold uppercase tracking-wider text-gold-lite transition",
              "hover:bg-gold/20 disabled:opacity-40",
            )}
          >
            {transferBusy ? "Transferring…" : "Transfer club"}
          </button>
        </div>
        {transferMsg && (
          <p className={cn("text-[12px]", transferMsg.ok ? "text-green" : "text-brand")}>
            {transferMsg.text}
          </p>
        )}
        {demo && <p className="text-[11px] text-white/40">Demo mode — transfer is disabled.</p>}
      </div>
    </div>
  );
}
