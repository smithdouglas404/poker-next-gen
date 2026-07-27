"use client";

import { useCallback, useEffect, useState } from "react";

import { Button, Field, Input, Select } from "@/features/ui";

import { adminApi, money } from "../adminRpc";
import { Badge, Card, Empty, GoldHeading, Mono, Row, Table, Td, Th } from "../primitives";
import type { UserRow } from "../types";
import type { Notify } from "./shared";
import { StaffPlayerProfile } from "./StaffPlayerProfile";

export function Users({ notify }: { notify: Notify }) {
  const [query, setQuery] = useState("");
  const [users, setUsers] = useState<UserRow[]>([]);
  const [searched, setSearched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<UserRow | null>(null);
  const [delta, setDelta] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [tierList, setTierList] = useState<Array<{ id: string; name: string }>>([]);
  const [grantTier, setGrantTier] = useState("");
  const [grantMonths, setGrantMonths] = useState("1");

  // The catalog, not a hardcoded list — a tier added in billing/tiers.go has to
  // show up here without a frontend change, or support can't comp it.
  useEffect(() => {
    void (async () => {
      try {
        const res = await adminApi.tiers();
        setTierList((res.tiers ?? []).map((t) => ({ id: t.id, name: t.name })));
      } catch {
        /* the grant control stays hidden rather than offering invented tiers */
      }
    })();
  }, []);

  const search = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminApi.userSearch(query.trim());
      setUsers(res.users ?? []);
      setSearched(true);
    } catch (err) {
      notify(err instanceof Error ? err.message : "Search failed", "err");
    } finally {
      setLoading(false);
    }
  }, [query, notify]);

  const refreshSelected = useCallback(
    async (userId: string) => {
      try {
        const res = await adminApi.userSearch(userId);
        const found = (res.users ?? []).find((u) => u.user_id === userId) ?? null;
        setUsers((prev) => prev.map((u) => (found && u.user_id === userId ? found : u)));
        setSelected(found);
      } catch {
        /* non-fatal */
      }
    },
    [],
  );

  const toggleBan = (u: UserRow) =>
    void (async () => {
      setBusy(true);
      try {
        if (u.banned) {
          await adminApi.unban(u.user_id);
          notify(`Unbanned ${u.username || u.user_id}`);
        } else {
          await adminApi.ban(u.user_id, reason.trim() || "policy violation");
          notify(`Banned ${u.username || u.user_id}`);
        }
        await refreshSelected(u.user_id);
      } catch (err) {
        notify(err instanceof Error ? err.message : "Action failed", "err");
      } finally {
        setBusy(false);
      }
    })();

  const adjust = () =>
    void (async () => {
      if (!selected) return;
      const cents = Math.round(parseFloat(delta) * 100);
      if (!Number.isFinite(cents) || cents === 0) {
        notify("Enter a non-zero dollar amount (use negative to debit).", "err");
        return;
      }
      setBusy(true);
      try {
        const res = await adminApi.adjustWallet(selected.user_id, cents, reason.trim());
        notify(`Wallet now ${money(res.balance_cents)}`);
        setDelta("");
        await refreshSelected(selected.user_id);
      } catch (err) {
        notify(err instanceof Error ? err.message : "Adjustment failed", "err");
      } finally {
        setBusy(false);
      }
    })();

  const grant = () =>
    void (async () => {
      if (!selected || !grantTier) return;
      const months = Math.max(1, Math.round(Number(grantMonths) || 1));
      setBusy(true);
      try {
        const res = await adminApi.grantTier(selected.user_id, grantTier, months, reason.trim());
        const until = res.subscription.expires_at
          ? ` until ${new Date(res.subscription.expires_at).toLocaleDateString()}`
          : "";
        notify(`Membership set to ${res.subscription.tier}${until}`);
        await refreshSelected(selected.user_id);
      } catch (err) {
        notify(err instanceof Error ? err.message : "Grant failed", "err");
      } finally {
        setBusy(false);
      }
    })();

  return (
    <div className="space-y-6">
      <div>
        <GoldHeading>User Management</GoldHeading>
        <p className="mt-1 text-sm text-neutral-500">
          Search by username, email, or user id. Ban, reinstate, and make audited wallet
          adjustments.
        </p>
      </div>

      <Card eyebrow="Directory" title="Search">
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Query" className="min-w-[240px] flex-1">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="username, email or id (blank = recent)"
              onKeyDown={(e) => {
                if (e.key === "Enter") void search();
              }}
            />
          </Field>
          <Button onClick={() => void search()} disabled={loading}>
            {loading ? "Searching…" : "Search"}
          </Button>
        </div>

        <div className="mt-5">
          {users.length === 0 ? (
            searched ? (
              <Empty>No users matched.</Empty>
            ) : (
              <Empty>Run a search to list accounts.</Empty>
            )
          ) : (
            <Table
              head={
                <>
                  <Th>User</Th>
                  <Th>Balance</Th>
                  <Th>Membership</Th>
                  <Th>Status</Th>
                  <Th className="text-right">Manage</Th>
                </>
              }
            >
              {users.map((u) => (
                <Row key={u.user_id}>
                  <Td>
                    <p className="font-medium text-white">{u.username || "—"}</p>
                    <Mono>{u.email || u.user_id}</Mono>
                  </Td>
                  <Td className="font-display text-gold">{money(u.balance_cents)}</Td>
                  <Td>
                    <span className="capitalize text-neutral-300">{u.tier || "free"}</span>
                    {u.cancel_at_period_end && (
                      <span className="ml-1.5 text-[10px] uppercase tracking-wider text-gold">
                        cancelling
                      </span>
                    )}
                  </Td>
                  <Td>
                    <Badge tone={u.banned ? "red" : "green"}>{u.banned ? "banned" : "active"}</Badge>
                  </Td>
                  <Td className="text-right">
                    <Button
                      size="sm"
                      variant={selected?.user_id === u.user_id ? "gold" : "outline"}
                      onClick={() => {
                        setSelected(u);
                        setReason("");
                        // Pre-select what they already hold, so the default action
                        // is "extend this membership" rather than a silent switch.
                        setGrantTier(u.tier || "free");
                      }}
                    >
                      {selected?.user_id === u.user_id ? "Selected" : "Select"}
                    </Button>
                  </Td>
                </Row>
              ))}
            </Table>
          )}
        </div>
      </Card>

      {selected && (
        <Card eyebrow="Actions" title={selected.username || selected.user_id}>
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="space-y-3">
              <Field label="Reason (audited)">
                <Input
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="e.g. chargeback fraud"
                />
              </Field>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant={selected.banned ? "outline" : "danger"}
                  onClick={() => toggleBan(selected)}
                  disabled={busy}
                >
                  {selected.banned ? "Reinstate account" : "Ban account"}
                </Button>
              </div>
            </div>

            <div className="space-y-3 border-t border-white/[0.06] pt-5 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
              <Field label="Wallet adjustment (USD)" hint="Positive credits, negative debits.">
                <Input
                  value={delta}
                  onChange={(e) => setDelta(e.target.value)}
                  placeholder="-25.00"
                  inputMode="decimal"
                />
              </Field>
              <div className="flex items-center justify-between">
                <span className="text-xs text-neutral-500">
                  Current: <span className="font-display text-gold">{money(selected.balance_cents)}</span>
                </span>
                <Button onClick={adjust} disabled={busy || delta.trim() === ""}>
                  Apply adjustment
                </Button>
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* Membership. `subscription_grant_admin` shipped with the tier system and
          had no caller anywhere, so support could not comp a tier, honour a
          goodwill upgrade, or repair a membership a failed Stripe sync had left
          on the wrong plan — the only route in was a hand-written SQL update. */}
      {selected && tierList.length > 0 && (
        <Card eyebrow="Membership" title="Grant or correct a tier">
          <div className="flex flex-wrap items-end gap-3">
            <Field label="Tier" className="min-w-[160px]">
              <Select value={grantTier} onChange={(e) => setGrantTier(e.target.value)}>
                {tierList.map((t) => (
                  <option key={t.id} value={t.id} className="bg-[#262d38]">
                    {t.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Months" className="w-28">
              <Input
                value={grantMonths}
                onChange={(e) => setGrantMonths(e.target.value)}
                inputMode="numeric"
                placeholder="1"
              />
            </Field>
            <Button onClick={grant} disabled={busy || !grantTier}>
              {grantTier === (selected.tier || "free") && grantTier !== "free"
                ? "Extend membership"
                : "Apply membership"}
            </Button>
          </div>

          <p className="mt-3 text-xs text-neutral-500">
            Currently{" "}
            <span className="capitalize text-neutral-300">{selected.tier || "free"}</span>
            {selected.tier_expires_at && (
              <>
                {" "}
                {selected.cancel_at_period_end ? "ending" : "until"}{" "}
                {new Date(selected.tier_expires_at).toLocaleDateString()}
              </>
            )}
            . Granting the same tier adds to the remaining term; a different tier
            replaces it starting today. The reason above is recorded in the admin audit
            log.
          </p>
        </Card>
      )}

      {selected && <StaffPlayerProfile user={selected} notify={notify} />}
    </div>
  );
}
