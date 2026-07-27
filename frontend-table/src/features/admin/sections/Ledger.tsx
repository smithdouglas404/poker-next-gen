"use client";

// The double-entry ledger, and the one number that checks every other money
// screen: the trial balance.
//
// The ledger's four RPCs shipped and none had a caller, so nobody could run a
// trial balance — the single figure that says whether the books have drifted.
// Worse, seven of the nine paths that move chips were skipping the ledger
// entirely (deposits, withdrawals, marketplace trades, rakeback, bonuses), so a
// trial balance would have reported a serene zero while blind to most of the
// economy. Both halves are fixed; this is the surface for the result.
//
// The honest framing matters here: a green "balanced" means the postings that
// exist sum to zero. That is a strong claim now that every money path posts,
// and it was a meaningless one before.

import { useCallback, useEffect, useMemo, useState } from "react";

import { Button, Input } from "@/features/ui";

import { adminApi, money, relTime } from "../adminRpc";
import { Card, Empty, GoldHeading, Mono, Row, StatTile, Table, Td, Th } from "../primitives";
import type { LedgerAccountBalance, LedgerEntryRow } from "../types";
import type { Notify } from "./shared";

/** Group accounts by their namespace prefix — user: / house: / external:. */
function namespaceOf(account: string): string {
  const i = account.indexOf(":");
  return i > 0 ? account.slice(0, i) : "other";
}

export function Ledger({ notify }: { notify: Notify }) {
  const [accounts, setAccounts] = useState<LedgerAccountBalance[] | null>(null);
  const [total, setTotal] = useState<number>(0);
  const [balanced, setBalanced] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const [account, setAccount] = useState("");
  const [entries, setEntries] = useState<LedgerEntryRow[] | null>(null);
  const [entriesBusy, setEntriesBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminApi.ledgerTrialBalance();
      setAccounts(res.accounts ?? []);
      setTotal(res.total ?? 0);
      setBalanced(!!res.balanced);
      setFailed(false);
    } catch (err) {
      // Never leave a stale "balanced" on screen after a failed read. An
      // unreachable ledger is an unknown state, not a healthy one.
      setFailed(true);
      setBalanced(null);
      notify(err instanceof Error ? err.message : "Failed to load the trial balance", "err");
    } finally {
      setLoading(false);
    }
  }, [notify]);

  useEffect(() => {
    void load();
  }, [load]);

  const openEntries = useCallback(
    (acct: string) =>
      void (async () => {
        setAccount(acct);
        setEntriesBusy(true);
        try {
          const res = await adminApi.ledgerEntries(acct, 100);
          setEntries(res.entries ?? []);
        } catch (err) {
          setEntries(null);
          notify(err instanceof Error ? err.message : "Failed to load entries", "err");
        } finally {
          setEntriesBusy(false);
        }
      })(),
    [notify],
  );

  // Grouped and sorted by absolute size: the accounts holding the most are the
  // ones an operator checks first.
  const grouped = useMemo(() => {
    const by = new Map<string, LedgerAccountBalance[]>();
    for (const a of accounts ?? []) {
      const ns = namespaceOf(a.account);
      by.set(ns, [...(by.get(ns) ?? []), a]);
    }
    for (const list of by.values()) {
      list.sort((x, y) => Math.abs(y.balance_minor) - Math.abs(x.balance_minor));
    }
    // house / external first — they are few and they are the interesting ones.
    const order = ["external", "house", "user", "other"];
    return [...by.entries()].sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0]));
  }, [accounts]);

  const userTotal = useMemo(
    () =>
      (accounts ?? [])
        .filter((a) => namespaceOf(a.account) === "user")
        .reduce((n, a) => n + a.balance_minor, 0),
    [accounts],
  );

  return (
    <div className="space-y-6">
      <Card>
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <GoldHeading>Trial Balance</GoldHeading>
          <Button size="sm" variant="outline" onClick={() => void load()} disabled={loading}>
            {loading ? "Loading…" : "Re-run"}
          </Button>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <StatTile
            label="Books"
            value={
              failed || balanced === null ? "Unknown" : balanced ? "Balanced" : "OUT OF BALANCE"
            }
            accent={failed || balanced === null ? "neutral" : balanced ? "green" : "red"}
          />
          <StatTile label="Sum of all postings" value={money(total)} />
          <StatTile label="Held by players" value={money(userTotal)} />
        </div>

        <p className="mt-3 text-[12px] leading-snug text-neutral-500">
          Every posting is one leg of a balanced transaction, so the sum across all accounts must be
          exactly zero. A non-zero total means chips were created or destroyed outside a balanced
          transaction — investigate before trusting any other financial screen.
        </p>

        {failed && (
          <p className="mt-3 text-[12px] font-semibold text-brand">
            Couldn&apos;t reach the ledger. The books are in an unknown state — this is not a
            passing check.
          </p>
        )}
        {balanced === false && (
          <p className="mt-3 text-[12px] font-semibold text-brand">
            The ledger does not balance by {money(Math.abs(total))}. Open the largest accounts below
            and compare their entries against the wallet ledger.
          </p>
        )}
      </Card>

      {/* Accounts, grouped by namespace */}
      {loading ? (
        <Card>
          <Empty>Loading accounts…</Empty>
        </Card>
      ) : (accounts?.length ?? 0) === 0 ? (
        <Card>
          <Empty>
            {failed
              ? "No accounts shown because the ledger could not be read."
              : "The ledger has no postings yet."}
          </Empty>
        </Card>
      ) : (
        grouped.map(([ns, list]) => (
          <Card key={ns}>
            <GoldHeading>
              {ns === "external"
                ? "External (money in / out)"
                : ns === "house"
                  ? "House accounts"
                  : ns === "user"
                    ? "Player balances"
                    : "Other"}
            </GoldHeading>
            <div className="mt-4">
              <Table
                head={
                  <>
                    <Th>Account</Th>
                    <Th className="text-right">Balance</Th>
                    <Th className="text-right">Entries</Th>
                  </>
                }
              >
                {list.slice(0, ns === "user" ? 25 : list.length).map((a) => (
                  <Row key={a.account}>
                    <Td>
                      <Mono>{a.account}</Mono>
                    </Td>
                    <Td
                      className={`text-right tabular-nums ${
                        a.balance_minor < 0 ? "text-brand" : "text-green"
                      }`}
                    >
                      {money(a.balance_minor)}
                    </Td>
                    <Td className="text-right">
                      <Button size="sm" variant="outline" onClick={() => openEntries(a.account)}>
                        View
                      </Button>
                    </Td>
                  </Row>
                ))}
              </Table>
              {/* Say what was cut rather than silently truncating — a hidden row
                  is exactly what an operator chasing an imbalance needs. */}
              {ns === "user" && list.length > 25 && (
                <p className="mt-2 text-[11px] text-neutral-500">
                  Showing the 25 largest of {list.length} player accounts.
                </p>
              )}
            </div>
          </Card>
        ))
      )}

      {/* Entry drill-down */}
      <Card>
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <GoldHeading>Account Entries</GoldHeading>
          <div className="flex items-center gap-2">
            <Input
              value={account}
              onChange={(e) => setAccount(e.target.value)}
              placeholder="user:… / house:… / external:…"
              className="w-72 font-mono text-xs"
            />
            <Button
              size="sm"
              variant="outline"
              disabled={entriesBusy || !account.trim()}
              onClick={() => openEntries(account.trim())}
            >
              {entriesBusy ? "Loading…" : "Load"}
            </Button>
          </div>
        </div>

        <div className="mt-4">
          {entries === null ? (
            <Empty>Pick an account above, or type one, to see its postings.</Empty>
          ) : entries.length === 0 ? (
            <Empty>No postings on {account}.</Empty>
          ) : (
            <Table
              head={
                <>
                  <Th>When</Th>
                  <Th>Transaction</Th>
                  <Th>Reason</Th>
                  <Th className="text-right">Amount</Th>
                </>
              }
            >
              {entries.map((e, i) => (
                <Row key={`${e.txn_id}-${i}`}>
                  <Td className="text-neutral-400">{relTime(e.created_at)}</Td>
                  <Td>
                    <Mono>{e.txn_id}</Mono>
                  </Td>
                  <Td className="text-neutral-300">{e.reason}</Td>
                  <Td
                    className={`text-right tabular-nums ${
                      e.amount_minor < 0 ? "text-brand" : "text-green"
                    }`}
                  >
                    {money(e.amount_minor)}
                  </Td>
                </Row>
              ))}
            </Table>
          )}
        </div>
      </Card>
    </div>
  );
}
