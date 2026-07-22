"use client";

import { useCallback, useEffect, useState } from "react";

import { Button } from "@/features/ui";

import { adminApi, relTime } from "../adminRpc";
import { Badge, Card, Empty, GoldHeading, Mono, Row, Table, Td, Th } from "../primitives";
import type { AuditRow } from "../types";
import type { Notify } from "./shared";

const PAGE = 100;

export function Audit({ notify }: { notify: Notify }) {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);

  const load = useCallback(
    async (off: number) => {
      setLoading(true);
      try {
        const res = await adminApi.auditList(PAGE, off);
        const list = res.audit ?? [];
        setRows(list);
        setOffset(off);
        setHasMore(list.length === PAGE);
      } catch (err) {
        notify(err instanceof Error ? err.message : "Failed to load audit log", "err");
      } finally {
        setLoading(false);
      }
    },
    [notify],
  );

  useEffect(() => {
    void load(0);
  }, [load]);

  const detailText = (d: unknown): string => {
    if (d === null || d === undefined) return "";
    if (typeof d === "string") return d;
    try {
      const s = JSON.stringify(d);
      return s === "{}" ? "" : s;
    } catch {
      return "";
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <GoldHeading>Audit Log</GoldHeading>
          <p className="mt-1 text-sm text-neutral-500">
            Immutable trail of every mutating admin action.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => void load(Math.max(0, offset - PAGE))}
            disabled={loading || offset === 0}
          >
            ← Newer
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void load(offset + PAGE)}
            disabled={loading || !hasMore}
          >
            Older →
          </Button>
        </div>
      </div>

      <Card eyebrow="Trail" title={`Actions ${offset + 1}–${offset + rows.length}`}>
        {rows.length === 0 ? (
          <Empty>{loading ? "Loading…" : "No audit entries."}</Empty>
        ) : (
          <Table
            head={
              <>
                <Th>Action</Th>
                <Th>Target</Th>
                <Th>Admin</Th>
                <Th>Detail</Th>
                <Th className="text-right">When</Th>
              </>
            }
          >
            {rows.map((r) => (
              <Row key={r.id}>
                <Td>
                  <Badge tone="cyan">{r.action}</Badge>
                </Td>
                <Td>
                  <Mono className="text-neutral-300">{r.target || "—"}</Mono>
                </Td>
                <Td>
                  <Mono>{r.admin_user_id}</Mono>
                </Td>
                <Td className="max-w-[280px]">
                  <span className="block truncate font-mono text-[11px] text-neutral-500">
                    {detailText(r.detail) || "—"}
                  </span>
                </Td>
                <Td className="text-right text-neutral-500">{relTime(r.created_at)}</Td>
              </Row>
            ))}
          </Table>
        )}
      </Card>
    </div>
  );
}
