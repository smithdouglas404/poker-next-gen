"use client";

import { useCallback, useEffect, useState } from "react";

import { Button } from "@/features/ui";

import { adminApi, compactNum, money, moneyCompact } from "../adminRpc";
import { Badge, Card, Empty, GoldHeading, StatTile } from "../primitives";
import type { EnvKey, Financials, GlobalStats, SystemLock } from "../types";
import type { Notify } from "./shared";

export function Overview({ notify }: { notify: Notify }) {
  const [fin, setFin] = useState<Financials | null>(null);
  const [env, setEnv] = useState<EnvKey[]>([]);
  const [gs, setGs] = useState<GlobalStats | null>(null);
  const [lock, setLock] = useState<SystemLock | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [f, e, g, l] = await Promise.all([
        adminApi.financials(),
        adminApi.envStatus(),
        adminApi.globalStats(),
        adminApi.systemLockGet(),
      ]);
      setFin(f.financials);
      setEnv(e.env ?? []);
      setGs(g);
      setLock(l);
    } catch (err) {
      notify(err instanceof Error ? err.message : "Failed to load overview", "err");
    } finally {
      setLoading(false);
    }
  }, [notify]);

  useEffect(() => {
    void load();
  }, [load]);

  const configured = env.filter((k) => k.set).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <GoldHeading>Platform Overview</GoldHeading>
          <p className="mt-1 text-sm text-neutral-500">
            Live money, integrations, and network health at a glance.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
          {loading ? "Refreshing…" : "Refresh"}
        </Button>
      </div>

      {lock?.locked && (
        <div className="rounded-2xl border border-red-500/40 bg-red-950/30 px-5 py-4 text-sm text-red-200">
          <span className="font-display font-bold uppercase tracking-wider">Maintenance lock active.</span>{" "}
          {lock.message || "The platform is currently locked to players."}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Rake Collected"
          value={moneyCompact(fin?.rake_collected_cents)}
          sub={money(fin?.rake_collected_cents)}
          accent="gold"
        />
        <StatTile
          label="Wallet Float"
          value={moneyCompact(fin?.wallet_float_cents)}
          sub="Player liability held"
          accent="cyan"
        />
        <StatTile
          label="Deposits Credited"
          value={moneyCompact(fin?.deposits_credited_cents)}
          sub={`Withdrawn ${moneyCompact(fin?.withdrawals_paid_cents)}`}
          accent="green"
        />
        <StatTile
          label="Withdrawals Pending"
          value={moneyCompact(fin?.withdrawals_pending_cents)}
          sub="Awaiting approval"
          accent="red"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="Users" value={compactNum(fin?.user_count)} sub={`${fin?.banned_count ?? 0} banned`} accent="neutral" />
        <StatTile label="Hands Dealt" value={compactNum(gs?.hands)} accent="neutral" />
        <StatTile label="Open Tables" value={compactNum(gs?.open_tables)} accent="cyan" />
        <StatTile label="Clubs" value={compactNum(gs?.clubs)} accent="gold" />
      </div>

      <Card
        eyebrow="Integrations"
        title={`Environment · ${configured}/${env.length} configured`}
      >
        {env.length === 0 ? (
          <Empty>No environment keys reported.</Empty>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {env.map((k) => (
              <div
                key={k.key}
                className="flex items-center justify-between gap-2 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2.5"
              >
                <span className="truncate font-mono text-xs text-neutral-300">{k.key}</span>
                <Badge tone={k.set ? "green" : "neutral"}>{k.set ? "set" : "unset"}</Badge>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
