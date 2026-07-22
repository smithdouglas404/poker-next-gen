"use client";

import { useCallback, useEffect, useState } from "react";

import { Button, Field, Input, Select } from "@/features/ui";
import { cn } from "@/features/ui/tokens";

import { adminApi, money, relTime } from "../adminRpc";
import { Badge, Card, Empty, GoldHeading, Mono, Row, StatTile, Table, Td, Th, statusTone } from "../primitives";
import type { Settlement } from "../types";
import type { Notify } from "./shared";

type Tab = "settlements" | "sponsorship" | "rakeback";

const TABS: { id: Tab; label: string }[] = [
  { id: "settlements", label: "Settlements" },
  { id: "sponsorship", label: "Sponsorship" },
  { id: "rakeback", label: "Rakeback" },
];

export function Finance({ notify }: { notify: Notify }) {
  const [tab, setTab] = useState<Tab>("settlements");
  return (
    <div className="space-y-6">
      <div>
        <GoldHeading>Settlements & Payouts</GoldHeading>
        <p className="mt-1 text-sm text-neutral-500">
          Verify ledger settlements, record sponsorship payouts, and run the rakeback batch.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={cn(
              "rounded-full border px-4 py-1.5 text-xs font-semibold uppercase tracking-wider transition",
              tab === t.id
                ? "border-gold/40 bg-gold/[0.08] text-gold"
                : "border-white/10 text-neutral-400 hover:bg-white/[0.03] hover:text-white",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "settlements" && <Settlements notify={notify} />}
      {tab === "sponsorship" && <Sponsorship notify={notify} />}
      {tab === "rakeback" && <Rakeback notify={notify} />}
    </div>
  );
}

function SettlementTable({
  rows,
  loading,
  busy,
  onVerify,
}: {
  rows: Settlement[];
  loading: boolean;
  busy: string | null;
  onVerify: (id: string) => void;
}) {
  if (rows.length === 0) return <Empty>{loading ? "Loading…" : "No settlements in view."}</Empty>;
  return (
    <Table
      head={
        <>
          <Th>Reference</Th>
          <Th>Counterparty</Th>
          <Th>Amount</Th>
          <Th>Status</Th>
          <Th className="text-right">Verify</Th>
        </>
      }
    >
      {rows.map((s) => (
        <Row key={s.id}>
          <Td>
            <p className="font-medium text-white">{s.reference || s.kind}</p>
            <Mono>{s.id}</Mono>
          </Td>
          <Td className="text-neutral-300">{s.counterparty || "—"}</Td>
          <Td className="font-display text-gold">
            {money(s.amount_cents)}
            <span className="ml-1 text-[10px] uppercase text-neutral-500">{s.currency || "usd"}</span>
          </Td>
          <Td>
            <Badge tone={statusTone(s.status)}>{s.status}</Badge>
            <p className="text-[11px] text-neutral-600">{relTime(s.created_at)}</p>
          </Td>
          <Td className="text-right">
            {s.status === "verified" ? (
              <span className="text-xs text-neutral-600">✓ verified</span>
            ) : (
              <Button size="sm" onClick={() => onVerify(s.id)} disabled={busy === s.id}>
                Verify
              </Button>
            )}
          </Td>
        </Row>
      ))}
    </Table>
  );
}

function Settlements({ notify }: { notify: Notify }) {
  const [rows, setRows] = useState<Settlement[]>([]);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminApi.settlementList("", status);
      setRows(res.settlements ?? []);
    } catch (err) {
      notify(err instanceof Error ? err.message : "Failed to load settlements", "err");
    } finally {
      setLoading(false);
    }
  }, [status, notify]);

  useEffect(() => {
    void load();
  }, [load]);

  const verify = (id: string) =>
    void (async () => {
      setBusy(id);
      try {
        await adminApi.settlementVerify(id);
        notify("Settlement verified");
        await load();
      } catch (err) {
        notify(err instanceof Error ? err.message : "Verify failed", "err");
      } finally {
        setBusy(null);
      }
    })();

  return (
    <Card
      eyebrow="Ledger"
      title="Settlements"
      actions={
        <Select value={status} onChange={(e) => setStatus(e.target.value)} className="w-40">
          <option value="">All</option>
          <option value="pending">Pending</option>
          <option value="verified">Verified</option>
        </Select>
      }
    >
      <SettlementTable rows={rows} loading={loading} busy={busy} onVerify={verify} />
    </Card>
  );
}

function Sponsorship({ notify }: { notify: Notify }) {
  const [rows, setRows] = useState<Settlement[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const [counterparty, setCounterparty] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("usd");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminApi.sponsorshipList();
      setRows(res.payouts ?? []);
    } catch (err) {
      notify(err instanceof Error ? err.message : "Failed to load payouts", "err");
    } finally {
      setLoading(false);
    }
  }, [notify]);

  useEffect(() => {
    void load();
  }, [load]);

  const verify = (id: string) =>
    void (async () => {
      setBusy(id);
      try {
        await adminApi.settlementVerify(id);
        notify("Payout verified");
        await load();
      } catch (err) {
        notify(err instanceof Error ? err.message : "Verify failed", "err");
      } finally {
        setBusy(null);
      }
    })();

  const create = () =>
    void (async () => {
      const cents = Math.round(parseFloat(amount) * 100);
      if (counterparty.trim() === "" || !Number.isFinite(cents) || cents <= 0) {
        notify("Counterparty and positive amount required", "err");
        return;
      }
      setBusy("create");
      try {
        await adminApi.sponsorshipCreate({
          counterparty: counterparty.trim(),
          amount_cents: cents,
          currency,
          reference: reference.trim(),
          note: note.trim(),
        });
        notify("Payout recorded");
        setCounterparty("");
        setAmount("");
        setReference("");
        setNote("");
        await load();
      } catch (err) {
        notify(err instanceof Error ? err.message : "Create failed", "err");
      } finally {
        setBusy(null);
      }
    })();

  return (
    <div className="space-y-6">
      <Card eyebrow="Record" title="New sponsorship payout">
        <div className="grid gap-3 lg:grid-cols-2">
          <Field label="Counterparty">
            <Input value={counterparty} onChange={(e) => setCounterparty(e.target.value)} placeholder="Team / creator" />
          </Field>
          <Field label="Amount (USD)">
            <Input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="500.00" inputMode="decimal" />
          </Field>
          <Field label="Reference">
            <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="contract / invoice" />
          </Field>
          <Field label="Currency">
            <Select value={currency} onChange={(e) => setCurrency(e.target.value)}>
              <option value="usd">USD</option>
              <option value="eur">EUR</option>
              <option value="usdt">USDT</option>
            </Select>
          </Field>
          <Field label="Note" className="lg:col-span-2">
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="optional" />
          </Field>
        </div>
        <div className="mt-3 flex justify-end">
          <Button onClick={create} disabled={busy === "create"}>
            Record payout
          </Button>
        </div>
      </Card>

      <Card eyebrow="History" title={`Sponsorship payouts · ${rows.length}`}>
        <SettlementTable rows={rows} loading={loading} busy={busy} onVerify={verify} />
      </Card>
    </div>
  );
}

function Rakeback({ notify }: { notify: Notify }) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{
    users_paid: number;
    total_cents: number;
    candidates: number;
  } | null>(null);

  const run = () =>
    void (async () => {
      setBusy(true);
      try {
        const res = await adminApi.rakebackProcessAll();
        setResult(res);
        notify(`Paid ${res.users_paid} users · ${money(res.total_cents)}`);
      } catch (err) {
        notify(err instanceof Error ? err.message : "Batch failed", "err");
      } finally {
        setBusy(false);
      }
    })();

  return (
    <Card eyebrow="Batch" title="Process all rakeback">
      <p className="text-sm text-neutral-400">
        Sweeps every player&apos;s accrued rakeback into their wallet in one atomic batch. Safe to
        run repeatedly — only positive balances are paid.
      </p>
      <div className="mt-4 flex justify-start">
        <Button onClick={run} disabled={busy}>
          {busy ? "Processing…" : "Run rakeback batch"}
        </Button>
      </div>
      {result && (
        <div className="mt-5 grid gap-4 sm:grid-cols-3">
          <StatTile label="Users Paid" value={result.users_paid} accent="green" />
          <StatTile label="Total Paid" value={money(result.total_cents)} accent="gold" />
          <StatTile label="Candidates" value={result.candidates} accent="neutral" />
        </div>
      )}
    </Card>
  );
}
