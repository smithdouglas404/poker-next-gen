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

import { Button, Field, Input, Select } from "@/features/ui";

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
      <CatalogEditor notify={notify} />

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


/** Sponsor + reward catalog editor.
 *
 * reward_sponsor_upsert and reward_item_upsert both shipped and neither had a
 * caller, so the rewards marketplace could only ever show rows seeded directly
 * into the database. An operator could not add a sponsor or a reward at all.
 *
 * Deliberately minimal: the fields the RPCs actually validate, nothing more. A
 * reward needs a sponsor, so the sponsor form comes first and the item form
 * refuses to submit until one exists. */
function CatalogEditor({ notify }: { notify: Notify }) {
  const [sponsors, setSponsors] = useState<Array<{ id: string; name: string; category: string }>>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const [sName, setSName] = useState("");
  const [sCat, setSCat] = useState("experiences");
  const [sDesc, setSDesc] = useState("");

  const [iSponsor, setISponsor] = useState("");
  const [iTitle, setITitle] = useState("");
  const [iPoints, setIPoints] = useState("1000");
  const [iValue, setIValue] = useState("");
  const [iStock, setIStock] = useState("-1");

  const load = useCallback(async () => {
    try {
      const res = await adminApi.rewardsCatalog();
      setSponsors(res.sponsors ?? []);
      setCategories(res.categories ?? []);
      if (!iSponsor && (res.sponsors ?? []).length > 0) setISponsor(res.sponsors[0].id);
    } catch {
      /* catalog unreadable — the forms still work, the picker is just empty */
    }
  }, [iSponsor]);

  useEffect(() => {
    void load();
  }, [load]);

  const addSponsor = () =>
    void (async () => {
      if (!sName.trim()) return;
      setBusy(true);
      try {
        await adminApi.rewardSponsorUpsert({
          name: sName.trim(),
          category: sCat,
          description: sDesc.trim(),
        });
        notify(`Sponsor "${sName.trim()}" saved.`);
        setSName("");
        setSDesc("");
        await load();
      } catch (err) {
        notify(err instanceof Error ? err.message : "Could not save the sponsor", "err");
      } finally {
        setBusy(false);
      }
    })();

  const addItem = () =>
    void (async () => {
      const points = Number(iPoints);
      if (!iSponsor || !iTitle.trim() || !Number.isFinite(points) || points <= 0) return;
      setBusy(true);
      try {
        const sponsor = sponsors.find((s) => s.id === iSponsor);
        await adminApi.rewardItemUpsert({
          sponsor_id: iSponsor,
          // The item inherits its sponsor's category unless the catalog has none;
          // a reward filed under a different category than its sponsor is how the
          // marketplace filters start disagreeing with themselves.
          category: sponsor?.category ?? sCat,
          title: iTitle.trim(),
          points_cost: Math.round(points),
          cash_value_cents: iValue ? Math.round(Number(iValue) * 100) : 0,
          stock: Number(iStock),
        });
        notify(`Reward "${iTitle.trim()}" saved.`);
        setITitle("");
        setIValue("");
        await load();
      } catch (err) {
        notify(err instanceof Error ? err.message : "Could not save the reward", "err");
      } finally {
        setBusy(false);
      }
    })();

  return (
    <Card>
      <GoldHeading>Catalog</GoldHeading>
      <p className="mt-2 text-[12px] leading-snug text-neutral-500">
        Sponsors and the rewards they offer. Players spend loyalty points here, so anything added
        becomes immediately redeemable — and lands in the fulfilment queue below when it is.
      </p>

      <div className="mt-5 grid gap-6 lg:grid-cols-2">
        {/* Sponsor */}
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-neutral-400">
            Add a sponsor
          </p>
          <div className="mt-3 space-y-3">
            <Field label="Name">
              <Input value={sName} onChange={(e) => setSName(e.target.value)} placeholder="Brand name" />
            </Field>
            <Field label="Category">
              <Select value={sCat} onChange={(e) => setSCat(e.target.value)}>
                {(categories.length > 0
                  ? categories
                  : ["travel", "food", "recreation", "experiences", "merch"]
                ).map((c) => (
                  <option key={c} value={c} className="bg-[#262d38]">
                    {c}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Description" hint="Optional.">
              <Input value={sDesc} onChange={(e) => setSDesc(e.target.value)} placeholder="Short blurb" />
            </Field>
            <Button variant="gold" size="sm" disabled={busy || !sName.trim()} onClick={addSponsor}>
              {busy ? "Saving…" : "Save sponsor"}
            </Button>
          </div>
        </div>

        {/* Reward */}
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-neutral-400">
            Add a reward
          </p>
          {sponsors.length === 0 ? (
            <p className="mt-3 text-[13px] text-neutral-500">
              Add a sponsor first — every reward belongs to one.
            </p>
          ) : (
            <div className="mt-3 space-y-3">
              <Field label="Sponsor">
                <Select value={iSponsor} onChange={(e) => setISponsor(e.target.value)}>
                  {sponsors.map((s) => (
                    <option key={s.id} value={s.id} className="bg-[#262d38]">
                      {s.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Title">
                <Input value={iTitle} onChange={(e) => setITitle(e.target.value)} placeholder="What the player gets" />
              </Field>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Points cost">
                  <Input
                    type="number"
                    min={1}
                    value={iPoints}
                    onChange={(e) => setIPoints(e.target.value)}
                  />
                </Field>
                <Field label="Cash value ($)" hint="Optional; display only.">
                  <Input value={iValue} onChange={(e) => setIValue(e.target.value)} placeholder="0" />
                </Field>
              </div>
              <Field label="Stock" hint="-1 for unlimited. Redeeming reserves a unit.">
                <Input type="number" value={iStock} onChange={(e) => setIStock(e.target.value)} />
              </Field>
              <Button
                variant="gold"
                size="sm"
                disabled={busy || !iTitle.trim() || !iSponsor}
                onClick={addItem}
              >
                {busy ? "Saving…" : "Save reward"}
              </Button>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
