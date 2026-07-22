"use client";

import { useCallback, useEffect, useState } from "react";

import { Button, Field, Input } from "@/features/ui";

import { adminApi, money, relTime } from "../adminRpc";
import { Badge, Card, Empty, GoldHeading, Mono, Row, Table, Td, Th, statusTone } from "../primitives";
import type { WithdrawalRow } from "../types";
import type { Notify } from "./shared";

export function Withdrawals({ notify }: { notify: Notify }) {
  const [rows, setRows] = useState<WithdrawalRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [manualId, setManualId] = useState("");
  const [rejectReason, setRejectReason] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminApi.withdrawalList();
      setRows(res.withdrawals ?? []);
    } catch (err) {
      notify(err instanceof Error ? err.message : "Failed to load withdrawals", "err");
    } finally {
      setLoading(false);
    }
  }, [notify]);

  useEffect(() => {
    void load();
  }, [load]);

  const approve = (id: string) =>
    void (async () => {
      setBusy(id);
      try {
        const res = await adminApi.withdrawalApprove(id);
        notify(res.auto_payout ? `Paid — payout ${res.payout_id}` : "Marked paid");
        await load();
      } catch (err) {
        notify(err instanceof Error ? err.message : "Approve failed", "err");
      } finally {
        setBusy(null);
      }
    })();

  const reject = (id: string, reason: string) =>
    void (async () => {
      setBusy(id);
      try {
        await adminApi.withdrawalReject(id, reason.trim() || "rejected by admin");
        notify("Rejected & refunded");
        await load();
      } catch (err) {
        notify(err instanceof Error ? err.message : "Reject failed", "err");
      } finally {
        setBusy(null);
      }
    })();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <GoldHeading>Withdrawals</GoldHeading>
          <p className="mt-1 text-sm text-neutral-500">
            Approve to release payout (auto for crypto), or reject to refund the held funds.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
          {loading ? "Refreshing…" : "Refresh"}
        </Button>
      </div>

      <Card eyebrow="Manual" title="Action by request id">
        <div className="grid gap-3 lg:grid-cols-[1fr_1fr_auto_auto] lg:items-end">
          <Field label="Withdrawal id">
            <Input
              value={manualId}
              onChange={(e) => setManualId(e.target.value)}
              placeholder="wd_…"
            />
          </Field>
          <Field label="Reject reason">
            <Input
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="optional"
            />
          </Field>
          <Button onClick={() => approve(manualId.trim())} disabled={busy !== null || manualId.trim() === ""}>
            Approve
          </Button>
          <Button
            variant="danger"
            onClick={() => reject(manualId.trim(), rejectReason)}
            disabled={busy !== null || manualId.trim() === ""}
          >
            Reject
          </Button>
        </div>
      </Card>

      <Card eyebrow="Recent" title="Withdrawal requests">
        {rows.length === 0 ? (
          <Empty>{loading ? "Loading…" : "No withdrawal requests in view."}</Empty>
        ) : (
          <Table
            head={
              <>
                <Th>Request</Th>
                <Th>Amount</Th>
                <Th>Destination</Th>
                <Th>Status</Th>
                <Th className="text-right">Manage</Th>
              </>
            }
          >
            {rows.map((w) => {
              const pending = w.status === "pending";
              return (
                <Row key={w.id}>
                  <Td>
                    <Mono>{w.id}</Mono>
                    <p className="text-[11px] text-neutral-600">{relTime(w.created_at)}</p>
                  </Td>
                  <Td className="font-display text-gold">
                    {money(w.amount_cents)}
                    <span className="ml-1 text-[10px] uppercase text-neutral-500">{w.currency}</span>
                  </Td>
                  <Td>
                    <Mono>{w.destination}</Mono>
                    <p className="text-[11px] uppercase tracking-wider text-neutral-600">{w.gateway}</p>
                  </Td>
                  <Td>
                    <Badge tone={statusTone(w.status)}>{w.status}</Badge>
                  </Td>
                  <Td className="text-right">
                    {pending ? (
                      <div className="inline-flex gap-2">
                        <Button size="sm" onClick={() => approve(w.id)} disabled={busy === w.id}>
                          Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="danger"
                          onClick={() => reject(w.id, "")}
                          disabled={busy === w.id}
                        >
                          Reject
                        </Button>
                      </div>
                    ) : (
                      <span className="text-xs text-neutral-600">settled</span>
                    )}
                  </Td>
                </Row>
              );
            })}
          </Table>
        )}
      </Card>
    </div>
  );
}
