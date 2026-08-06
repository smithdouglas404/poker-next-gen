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
import type { LedgerAccountBalance, LedgerEntryRow, ReconcileReport } from "../types";
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

  const [recon, setRecon] = useState<ReconcileReport | null>(null);
  const [reconBusy, setReconBusy] = useState(false);

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

  // Drift check, on every load. "Balanced" only means the postings sum to zero —
  // it says nothing about whether they describe reality, and on a platform where
  // the ledger was added after money was already moving they do not. Running the
  // dry-run reconciliation alongside the trial balance is what turns the green
  // light into a claim worth believing.
  const checkDrift = useCallback(async () => {
    try {
      setRecon(await adminApi.ledgerReconcile(false));
    } catch {
      setRecon(null);
    }
  }, []);

  useEffect(() => {
    void load();
    void checkDrift();
  }, [load, checkDrift]);

  const applyReconcile = useCallback(() => {
    const r = recon;
    if (!r || r.lines.length === 0) return;
    if (
      !window.confirm(
        `Book opening balances for ${r.lines.length} account(s)?\n\n` +
          "This writes one balanced transaction to the ledger so account balances match the wallet and club-balance tables. " +
          "It does not move any player's money — it records history the ledger was not keeping. Run only after reviewing the drift below.",
      )
    ) {
      return;
    }
    void (async () => {
      setReconBusy(true);
      try {
        const res = await adminApi.ledgerReconcile(true);
        notify(`Opening balances booked for ${res.lines.length} account(s).`);
        await load();
        await checkDrift();
      } catch (err) {
        notify(err instanceof Error ? err.message : "Reconciliation failed", "err");
      } finally {
        setReconBusy(false);
      }
    })();
  }, [recon, notify, load, checkDrift]);

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
          {" "}
          <span className="text-neutral-400">
            Zero on its own only proves the postings balance; the drift check below is what shows
            they match reality.
          </span>
        </p>

        {failed && (
          <p className="mt-3 text-[12px] font-semibold text-gold-lite">
            Couldn&apos;t reach the ledger. The books are in an unknown state — this is not a
            passing check.
          </p>
        )}
        {balanced === false && (
          <p className="mt-3 text-[12px] font-semibold text-gold-lite">
            The ledger does not balance by {money(Math.abs(total))}. Open the largest accounts below
            and compare their entries against the wallet ledger.
          </p>
        )}
      </Card>

      {/* Drift: does the ledger describe reality? */}
      {recon && (
        <Card>
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <GoldHeading>Reality Check</GoldHeading>
            {recon.lines.length > 0 && (
              <Button size="sm" variant="gold" disabled={reconBusy} onClick={applyReconcile}>
                {reconBusy ? "Booking…" : "Book opening balances"}
              </Button>
            )}
          </div>

          {recon.lines.length === 0 ? (
            <p className="mt-3 text-[13px] text-green">
              All {recon.accounts_read} accounts match their wallet and club-balance tables. The
              trial balance above is describing real money.
            </p>
          ) : (
            <>
              <p className="mt-3 text-[13px] leading-snug text-neutral-300">
                <span className="font-semibold text-gold">{recon.lines.length}</span> of{" "}
                {recon.accounts_read} accounts do not match their authoritative table, by{" "}
                <span className="font-semibold text-gold">{money(recon.total_drift_minor)}</span> in
                total.
              </p>
              <p className="mt-2 text-[12px] leading-snug text-neutral-500">
                This is expected once: the ledger was added after the platform had been moving
                money, and wallet opening balances were never posted. Booking opening balances
                writes ONE balanced transaction that makes each account match its table. It moves
                nobody&apos;s money — it records history the ledger was not keeping. A drift that
                reappears afterwards is a live bug, not history.
              </p>
              <div className="mt-4">
                <Table
                  head={
                    <>
                      <Th>Account</Th>
                      <Th className="text-right">Ledger says</Th>
                      <Th className="text-right">Actually holds</Th>
                      <Th className="text-right">Drift</Th>
                    </>
                  }
                >
                  {recon.lines.slice(0, 25).map((l) => (
                    <Row key={l.account}>
                      <Td>
                        <Mono>{l.account}</Mono>
                      </Td>
                      <Td className="text-right tabular-nums text-neutral-400">
                        {money(l.ledger_minor)}
                      </Td>
                      <Td className="text-right tabular-nums text-white">{money(l.actual_minor)}</Td>
                      <Td
                        className={`text-right tabular-nums ${
                          l.drift_minor < 0 ? "text-brand" : "text-gold"
                        }`}
                      >
                        {money(l.drift_minor)}
                      </Td>
                    </Row>
                  ))}
                </Table>
                {recon.lines.length > 25 && (
                  <p className="mt-2 text-[11px] text-neutral-500">
                    Showing 25 of {recon.lines.length} drifted accounts. Booking covers all of them.
                  </p>
                )}
              </div>
            </>
          )}
        </Card>
      )}

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
