"use client";

import { useCallback, useState } from "react";

import { Button, Field, Input } from "@/features/ui";

import { adminApi, money } from "../adminRpc";
import { Badge, Card, Empty, GoldHeading, Mono, Row, Table, Td, Th } from "../primitives";
import type { UserRow } from "../types";
import type { Notify } from "./shared";

export function Users({ notify }: { notify: Notify }) {
  const [query, setQuery] = useState("");
  const [users, setUsers] = useState<UserRow[]>([]);
  const [searched, setSearched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<UserRow | null>(null);
  const [delta, setDelta] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

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
                    <Badge tone={u.banned ? "red" : "green"}>{u.banned ? "banned" : "active"}</Badge>
                  </Td>
                  <Td className="text-right">
                    <Button
                      size="sm"
                      variant={selected?.user_id === u.user_id ? "gold" : "outline"}
                      onClick={() => {
                        setSelected(u);
                        setReason("");
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
    </div>
  );
}
