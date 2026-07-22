"use client";

import { useCallback, useEffect, useState } from "react";

import { Button } from "@/features/ui";

import { adminApi, relTime } from "../adminRpc";
import { Badge, Card, Empty, GoldHeading, Mono, Row, Table, Td, Th, statusTone } from "../primitives";
import type { KycPendingRow } from "../types";
import type { Notify } from "./shared";

export function Kyc({ notify }: { notify: Notify }) {
  const [rows, setRows] = useState<KycPendingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminApi.kycPending();
      setRows(res.pending ?? []);
    } catch (err) {
      notify(err instanceof Error ? err.message : "Failed to load KYC queue", "err");
    } finally {
      setLoading(false);
    }
  }, [notify]);

  useEffect(() => {
    void load();
  }, [load]);

  const decide = (row: KycPendingRow, status: "verified" | "rejected") =>
    void (async () => {
      setBusy(row.user_id);
      try {
        await adminApi.kycVerify(row.user_id, status, row.level || "kyc_aml", "");
        notify(`${row.user_id} ${status}`);
        setRows((prev) => prev.filter((r) => r.user_id !== row.user_id));
      } catch (err) {
        notify(err instanceof Error ? err.message : "Review failed", "err");
      } finally {
        setBusy(null);
      }
    })();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <GoldHeading>KYC Review Queue</GoldHeading>
          <p className="mt-1 text-sm text-neutral-500">
            Identity submissions awaiting a verification decision.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
          {loading ? "Refreshing…" : "Refresh"}
        </Button>
      </div>

      <Card eyebrow="Compliance" title={`Pending · ${rows.length}`}>
        {rows.length === 0 ? (
          <Empty>{loading ? "Loading…" : "No submissions awaiting review."}</Empty>
        ) : (
          <Table
            head={
              <>
                <Th>User</Th>
                <Th>Level</Th>
                <Th>Provider</Th>
                <Th>Submitted</Th>
                <Th className="text-right">Decision</Th>
              </>
            }
          >
            {rows.map((r) => (
              <Row key={r.user_id}>
                <Td>
                  <Mono>{r.user_id}</Mono>
                </Td>
                <Td>
                  <Badge tone="cyan">{r.level || "—"}</Badge>
                </Td>
                <Td className="text-neutral-400">{r.provider || "—"}</Td>
                <Td className="text-neutral-500">
                  <Badge tone={statusTone(r.status)} className="mr-2">
                    {r.status}
                  </Badge>
                  {relTime(r.updated_at)}
                </Td>
                <Td className="text-right">
                  <div className="inline-flex gap-2">
                    <Button size="sm" onClick={() => decide(r, "verified")} disabled={busy === r.user_id}>
                      Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="danger"
                      onClick={() => decide(r, "rejected")}
                      disabled={busy === r.user_id}
                    >
                      Reject
                    </Button>
                  </div>
                </Td>
              </Row>
            ))}
          </Table>
        )}
      </Card>
    </div>
  );
}
