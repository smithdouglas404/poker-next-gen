"use client";

// Reward fulfilment queue.
//
// The rewards backend shipped complete: a player spends loyalty points (which
// they can buy outright with chips via `points_purchase`) on a catalog item,
// `reward_redeem` debits the points, reserves a unit of stock and writes a
// redemption with a voucher code and `status: "pending"`.
//
// Nothing then fulfilled it. `reward_redemptions_pending` and
// `reward_redemption_fulfil` were registered in main.go and called by no code
// anywhere in the app, so every redemption a player had paid for sat pending
// forever with no operator surface to work it. This is that surface.

import { useCallback, useEffect, useMemo, useState } from "react";

import { Button } from "@/features/ui";

import { adminApi, relTime } from "../adminRpc";
import { Badge, Card, Empty, GoldHeading, Mono, Row, Table, Td, Th } from "../primitives";
import type { RewardRedemptionRow } from "../types";
import type { Notify } from "./shared";

/** Age in whole days, for flagging a queue that has been left to rot. */
function ageDays(iso: string): number {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return 0;
  return Math.floor((Date.now() - t) / 86_400_000);
}

export function Rewards({ notify }: { notify: Notify }) {
  const [rows, setRows] = useState<RewardRedemptionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminApi.rewardRedemptionsPending();
      setRows(res.redemptions ?? []);
      setFailed(false);
    } catch (err) {
      // An empty table and an unreachable server look identical, and here they
      // mean opposite things: "nothing to do" versus "you cannot see the
      // backlog". Say which.
      setFailed(true);
      notify(err instanceof Error ? err.message : "Failed to load redemptions", "err");
    } finally {
      setLoading(false);
    }
  }, [notify]);

  useEffect(() => {
    void load();
  }, [load]);

  const resolve = (row: RewardRedemptionRow, status: "fulfilled" | "cancelled") =>
    void (async () => {
      setBusy(row.id);
      try {
        const res = await adminApi.rewardRedemptionFulfil(row.id, status);
        notify(
          status === "fulfilled"
            ? `Fulfilled — ${row.title}`
            : res.points_refunded > 0
              ? `Cancelled — ${res.points_refunded.toLocaleString()} points refunded`
              : "Cancelled",
        );
        await load();
      } catch (err) {
        notify(err instanceof Error ? err.message : "Could not resolve the redemption", "err");
      } finally {
        setBusy(null);
      }
    })();

  // Oldest first: a fulfilment queue is worked front to back, and the player who
  // has waited longest is the one to serve next.
  const ordered = useMemo(
    () =>
      [...rows].sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
      ),
    [rows],
  );
  const totalPoints = useMemo(
    () => ordered.reduce((n, r) => n + (r.points_spent ?? 0), 0),
    [ordered],
  );

  return (
    <div className="space-y-6">
      <Card>
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <GoldHeading>Reward Fulfilment</GoldHeading>
          <div className="flex items-center gap-4 text-xs text-neutral-400">
            <span>
              <span className="font-semibold text-white">{ordered.length}</span> pending
            </span>
            <span>
              <span className="font-semibold text-gold">{totalPoints.toLocaleString()}</span> points
              owed
            </span>
            <Button size="sm" variant="outline" onClick={() => void load()} disabled={loading}>
              {loading ? "Loading…" : "Refresh"}
            </Button>
          </div>
        </div>
        <p className="mt-2 text-[12px] leading-snug text-neutral-500">
          Players have already paid for these. Fulfilling records the voucher as delivered;
          cancelling refunds the points and returns the unit to stock.
        </p>

        <div className="mt-5">
          {loading ? (
            <Empty>Loading redemptions…</Empty>
          ) : failed ? (
            <Empty>
              Couldn&apos;t reach the rewards service. This is not the same as an empty queue —
              pending redemptions may exist that aren&apos;t shown.
            </Empty>
          ) : ordered.length === 0 ? (
            <Empty>No redemptions waiting.</Empty>
          ) : (
            <Table
              head={
                <>
                  <Th>Reward</Th>
                  <Th>Player</Th>
                  <Th>Voucher</Th>
                  <Th className="text-right">Points</Th>
                  <Th>Waiting</Th>
                  <Th className="text-right">Action</Th>
                </>
              }
            >
              {ordered.map((r) => {
                const days = ageDays(r.created_at);
                return (
                  <Row key={r.id}>
                    <Td>
                      <span className="font-semibold text-white">{r.title}</span>
                      {r.category ? (
                        <span className="ml-2 text-[11px] uppercase tracking-wider text-neutral-500">
                          {r.category}
                        </span>
                      ) : null}
                    </Td>
                    <Td>
                      <Mono>{r.user_id.slice(0, 12)}</Mono>
                    </Td>
                    <Td>
                      <Mono>{r.voucher_code}</Mono>
                    </Td>
                    <Td className="text-right tabular-nums text-gold">
                      {(r.points_spent ?? 0).toLocaleString()}
                    </Td>
                    <Td>
                      {/* A week-old unfulfilled redemption is a support ticket
                          waiting to happen, so the queue says so itself. */}
                      {days >= 7 ? (
                        <Badge tone="danger">{relTime(r.created_at)}</Badge>
                      ) : (
                        <span className="text-neutral-400">{relTime(r.created_at)}</span>
                      )}
                    </Td>
                    <Td className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          size="sm"
                          variant="gold"
                          disabled={busy === r.id}
                          onClick={() => resolve(r, "fulfilled")}
                        >
                          {busy === r.id ? "…" : "Fulfil"}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busy === r.id}
                          onClick={() => resolve(r, "cancelled")}
                        >
                          Cancel & refund
                        </Button>
                      </div>
                    </Td>
                  </Row>
                );
              })}
            </Table>
          )}
        </div>
      </Card>
    </div>
  );
}
