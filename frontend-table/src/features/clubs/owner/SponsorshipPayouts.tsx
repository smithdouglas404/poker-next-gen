"use client";

// Screen 1 — Sponsorship Payout ledger. KPIs (Total Paid / Next Scheduled) +
// a transaction table (id / wallet / amount / status / date), plus an owner
// form to record a new payout. Wired to sponsorship_payout_list (load) and
// sponsorship_payout_create (record). Admin-gated RPCs → non-admin owners see
// the labelled demo ledger.

import { useCallback, useEffect, useMemo, useState } from "react";

import { Button, Field, Input } from "@/features/ui";
import { GLASS_PANEL, cn } from "@/features/ui/tokens";

import { OwnerPageShell, Toast, useToast } from "./OwnerPageShell";
import { useOwnedClub } from "./useOwnedClub";
import {
  DEMO_PAYOUTS,
  dateTime,
  screensApi,
  shortWallet,
  usd,
  type Settlement,
} from "./screensRpc";
import { EmptyState } from "./ui";

function StatusPill({ status }: { status: string }) {
  const s = (status || "pending").toLowerCase();
  const done = s === "verified" || s === "completed" || s === "cleared";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold",
        done
          ? "border-[#22c55e]/40 bg-[#22c55e]/10 text-[#22c55e]"
          : "border-[#f5c518]/40 bg-[#f5c518]/10 text-[#f5c518]",
      )}
    >
      <span className="inline-block h-1.5 w-1.5 rounded-full bg-current" />
      {done ? "Completed" : "Pending"}
    </span>
  );
}

export function SponsorshipPayouts() {
  const owned = useOwnedClub();
  const { toast, notify } = useToast();
  const [payouts, setPayouts] = useState<Settlement[]>([]);
  const [demoData, setDemoData] = useState(false);
  const [wallet, setWallet] = useState("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await screensApi.sponsorshipList("", 100);
      setPayouts(res.payouts ?? []);
      setDemoData(false);
    } catch {
      setPayouts(DEMO_PAYOUTS);
      setDemoData(true);
    }
  }, []);

  useEffect(() => {
    if (owned.loading) return;
    if (owned.demo) {
      setPayouts(DEMO_PAYOUTS);
      setDemoData(true);
      return;
    }
    void load();
  }, [owned.loading, owned.demo, load]);

  const demo = owned.demo || demoData;

  const totalPaid = useMemo(
    () =>
      payouts
        .filter((p) => ["verified", "completed", "cleared"].includes(p.status.toLowerCase()))
        .reduce((s, p) => s + p.amount_cents, 0),
    [payouts],
  );
  const nextScheduled = useMemo(() => {
    const pending = payouts
      .filter((p) => p.status.toLowerCase() === "pending")
      .sort((a, b) => +new Date(a.created_at) - +new Date(b.created_at));
    return pending[0]?.created_at ?? null;
  }, [payouts]);

  const submit = () => {
    const cents = Math.round(parseFloat(amount) * 100);
    if (!wallet.trim() || !Number.isFinite(cents) || cents <= 0) {
      notify("Enter a recipient wallet and a positive amount.", "err");
      return;
    }
    void (async () => {
      setBusy(true);
      if (demo) {
        setPayouts((prev) => [
          {
            id: `TX-${Math.floor(100000 + Math.random() * 899999)}`,
            kind: "sponsorship",
            reference: `SPR-${Date.now().toString(36)}`,
            counterparty: wallet.trim(),
            amount_cents: cents,
            currency: "USD",
            status: "pending",
            note: note.trim(),
            created_by: "owner",
            created_at: new Date().toISOString(),
            verified_at: null,
          },
          ...prev,
        ]);
        notify(`Recorded ${usd(cents)} payout (demo).`);
        setWallet("");
        setAmount("");
        setNote("");
        setBusy(false);
        return;
      }
      try {
        await screensApi.sponsorshipCreate(wallet.trim(), cents, note.trim());
        notify(`Payout of ${usd(cents)} recorded.`);
        setWallet("");
        setAmount("");
        setNote("");
        await load();
      } catch (e) {
        notify(e instanceof Error ? e.message : "Payout failed", "err");
      } finally {
        setBusy(false);
      }
    })();
  };

  return (
    <OwnerPageShell
      clubName={owned.club?.name ?? "High Rollers Club"}
      title="Sponsorship Payout Details"
      subtitle="Sponsorship payout ledger and settlement history."
      demo={demo}
    >
      <Toast toast={toast} />

      {/* KPIs */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className={cn(GLASS_PANEL, "p-6")}>
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/45">
            Total Paid Out
          </p>
          <p className="font-display mt-2 text-4xl font-bold text-gold md:text-5xl">
            {usd(totalPaid)}
          </p>
        </div>
        <div className={cn(GLASS_PANEL, "p-6")}>
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/45">
            Next Scheduled Payout
          </p>
          <p className="font-display mt-2 text-3xl font-bold text-white md:text-4xl">
            {nextScheduled
              ? new Date(nextScheduled).toLocaleDateString("en-US", {
                  month: "long",
                  day: "numeric",
                  year: "numeric",
                })
              : "None scheduled"}
          </p>
        </div>
      </div>

      {/* Record a payout */}
      <div className={cn(GLASS_PANEL, "mt-5 p-5")}>
        <p className="font-display text-[11px] font-bold uppercase tracking-[0.25em] text-gold/80">
          Record Sponsorship Payout
        </p>
        <div className="mt-4 grid gap-3 md:grid-cols-[1.6fr_1fr_1.6fr_auto] md:items-end">
          <Field label="Recipient Wallet">
            <Input
              value={wallet}
              onChange={(e) => setWallet(e.target.value)}
              placeholder="0x… or account id"
            />
          </Field>
          <Field label="Amount (USD)">
            <Input
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              inputMode="decimal"
              placeholder="15000"
            />
          </Field>
          <Field label="Note (optional)">
            <Input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Weekly sponsorship"
            />
          </Field>
          <Button variant="gold" disabled={busy} onClick={submit}>
            {busy ? "Saving…" : "Record"}
          </Button>
        </div>
      </div>

      {/* Ledger table */}
      <div className={cn(GLASS_PANEL, "mt-5 overflow-hidden")}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead>
              <tr className="border-b border-white/[0.08] text-[11px] uppercase tracking-[0.14em] text-white/45">
                <th className="px-5 py-3 font-semibold">Transaction ID</th>
                <th className="px-5 py-3 font-semibold">Recipient Wallet</th>
                <th className="px-5 py-3 font-semibold">Amount</th>
                <th className="px-5 py-3 font-semibold">Status</th>
                <th className="px-5 py-3 font-semibold">Date / Time</th>
              </tr>
            </thead>
            <tbody>
              {payouts.map((p) => (
                <tr key={p.id} className="border-b border-white/[0.05] last:border-0">
                  <td className="px-5 py-3.5 font-mono text-white/80">{p.id}</td>
                  <td className="px-5 py-3.5 font-mono text-white/60">
                    {shortWallet(p.counterparty)}
                  </td>
                  <td className="px-5 py-3.5 font-bold text-gold">{usd(p.amount_cents)}</td>
                  <td className="px-5 py-3.5">
                    <StatusPill status={p.status} />
                  </td>
                  <td className="px-5 py-3.5 text-white/55">{dateTime(p.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {payouts.length === 0 && <EmptyState>No sponsorship payouts recorded yet.</EmptyState>}
      </div>
    </OwnerPageShell>
  );
}
