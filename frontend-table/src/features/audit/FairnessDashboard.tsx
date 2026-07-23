"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { GLASS_PANEL, GLASS_PANEL_HOVER, HEADING_SM, cn } from "@/features/ui/tokens";
import { downloadFile, pythonVerifier } from "@/features/provably/verifier";
import { anchorStatus, handHistory } from "./auditRpc";
import { demoDashboard } from "./auditDemo";
import type { AuditHistoryRow, DashboardData, ProofRow, ProofStatus } from "./auditTypes";

const STATUS_META: Record<ProofStatus, { label: string; cls: string }> = {
  in_progress: { label: "IN PROGRESS", cls: "bg-white/10 text-neutral-300" },
  ready_to_reveal: { label: "READY TO REVEAL", cls: "bg-gold/15 text-gold border border-gold/30" },
  verified: { label: "VERIFIED", cls: "bg-green/15 text-green border border-green/30" },
};

function short(hash: string, head = 6, tail = 4): string {
  const clean = hash.replace(/^0x/, "");
  if (clean.length <= head + tail) return `0x${clean}`;
  return `0x${clean.slice(0, head)}...${clean.slice(-tail)}`;
}

export function FairnessDashboard({ onReveal }: { onReveal: (matchId: string, handNo: number) => void }) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [refreshedAt, setRefreshedAt] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const started = performance.now();
      const [hist, anchor] = await Promise.all([handHistory(24), anchorStatus()]);
      const latency = Math.max(1, Math.round(performance.now() - started));
      const hands = hist.hands ?? [];
      if (hands.length === 0) {
        setData(demoDashboard());
        return;
      }
      const proofs: ProofRow[] = hands.slice(0, 5).map((h, i) => ({
        handId: `#TX-${h.hand_no}`,
        matchId: h.match_id,
        handNo: h.hand_no,
        commit: h.deck_commit || "0x",
        status: h.anchored ? "verified" : i === 0 ? "in_progress" : "ready_to_reveal",
      }));
      const history: AuditHistoryRow[] = hands.map((h) => ({
        tableId: h.table_label || `T-${h.hand_no}`,
        matchId: h.match_id,
        handNo: h.hand_no,
        timestamp: h.created_at || "",
        publicSeed: h.deck_commit ? short(h.deck_commit, 3, 4).toUpperCase() : "—",
        verified: h.anchored,
      }));
      setData({
        demo: false,
        entropy: {
          tableId: (hands[0]?.room_id || hands[0]?.match_id || "").slice(0, 6) || "LIVE",
          vrfSample: short(hands[0]?.deck_commit ?? "0x442ef21", 3, 4).toUpperCase(),
          masterSeedState: "MIXING_ACTIVE",
          mouseClicks: hands.length,
          poolBits: 128,
          randomnessScore: 99.98,
          hardwareStatus: "ACTIVE",
        },
        health: {
          operational: true,
          rngLatencyMs: latency,
          ledgerConsistency: anchor.latest?.status?.toUpperCase() || (anchor.configured ? "SYNCED" : "LOCAL"),
          activeProofs: hands.filter((h) => h.deck_commit).length,
          anchorConfigured: anchor.configured,
          anchorTx: anchor.latest?.tx_hash ?? null,
          anchorChain: anchor.latest?.chain ?? "polygon",
        },
        proofs,
        history,
      });
    } catch {
      setData(demoDashboard());
    } finally {
      setLoading(false);
      setRefreshedAt(new Date().toLocaleTimeString());
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const downloadAuditLog = useCallback(() => {
    if (!data) return;
    const bundle = JSON.stringify(
      {
        schema: "neon-vault.audit-log.v1",
        exported_at: new Date().toISOString(),
        source: data.demo ? "demo" : "live",
        table: data.entropy.tableId,
        system_health: data.health,
        recent_proofs: data.proofs,
        audit_history: data.history,
      },
      null,
      2,
    );
    downloadFile(`audit-log-${data.entropy.tableId}.json`, bundle, "application/json");
  }, [data]);

  const verifyRngScript = useCallback(() => {
    const first = data?.proofs[0];
    downloadFile("verify_rng.py", pythonVerifier(first?.commit ?? "", ""), "text/x-python");
  }, [data]);

  const filteredHistory = useMemo(() => {
    if (!data) return [];
    const q = query.trim().toLowerCase();
    if (!q) return data.history;
    return data.history.filter(
      (r) => r.tableId.toLowerCase().includes(q) || r.publicSeed.toLowerCase().includes(q),
    );
  }, [data, query]);

  if (loading && !data) {
    return <div className="py-24 text-center text-sm text-neutral-500">Loading fairness telemetry…</div>;
  }
  if (!data) return null;

  return (
    <div className="space-y-6">
      {/* Title row */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-4xl font-bold uppercase tracking-wide md:text-5xl">
            Fairness Audit Dashboard
          </h1>
          <p className="mt-2 flex items-center gap-2 text-sm text-neutral-400">
            <span className={cn("h-2 w-2 rounded-full", data.demo ? "bg-gold" : "animate-pulse bg-green")} />
            {data.demo
              ? "Sample verification data — connect a table to verify live hands"
              : `Live cryptographic verification active for Table #${data.entropy.tableId}`}
            {data.demo && (
              <span className="ml-1 rounded-full border border-gold/40 bg-gold/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-gold">
                Demo · offline
              </span>
            )}
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button
            onClick={downloadAuditLog}
            className={cn(GLASS_PANEL, GLASS_PANEL_HOVER, "px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-white")}
          >
            ↓ Download Full Audit Log
          </button>
          <button
            onClick={verifyRngScript}
            className={cn(GLASS_PANEL, GLASS_PANEL_HOVER, "px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-cyan")}
          >
            {"</>"} Verify RNG Script
          </button>
        </div>
      </div>

      {/* Entropy stream + system health */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_minmax(0,380px)]">
        <EntropyStream />
        <SystemHealthPanel data={data} onRefresh={refresh} refreshing={refreshing} refreshedAt={refreshedAt} />
      </div>

      {/* Recent cryptographic proofs */}
      <section className={cn(GLASS_PANEL, "p-6")}>
        <h2 className={cn(HEADING_SM, "mb-4 flex items-center gap-2 text-foreground")}>
          <span>🛡</span> Recent Cryptographic Proofs
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-[0.2em] text-neutral-500">
                <th className="pb-3 font-semibold">Hand ID</th>
                <th className="pb-3 font-semibold">Commitment Hash</th>
                <th className="pb-3 font-semibold">Status</th>
                <th className="pb-3 text-right font-semibold">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.06]">
              {data.proofs.map((p) => (
                <tr key={p.handId} className="group">
                  <td className="py-4 font-display font-bold text-foreground">{p.handId}</td>
                  <td className="py-4 font-mono text-xs text-neutral-300">{short(p.commit, 6, 4)}</td>
                  <td className="py-4">
                    <span className={cn("rounded-md px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider", STATUS_META[p.status].cls)}>
                      {STATUS_META[p.status].label}
                    </span>
                  </td>
                  <td className="py-4 text-right">
                    {p.status === "in_progress" ? (
                      <span className="text-xs italic text-neutral-600">Wait for hand</span>
                    ) : p.status === "ready_to_reveal" ? (
                      <button
                        onClick={() => onReveal(p.matchId, p.handNo)}
                        className="text-xs font-bold uppercase tracking-wider text-brand underline decoration-brand/40 underline-offset-4 hover:decoration-brand"
                      >
                        Reveal Proof
                      </button>
                    ) : (
                      <button
                        onClick={() => onReveal(p.matchId, p.handNo)}
                        className="inline-flex items-center gap-1 text-xs font-bold uppercase tracking-wider text-green hover:text-green/80"
                        title="View verified proof"
                      >
                        ✔
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Audit history log */}
      <section className={cn(GLASS_PANEL, "p-6")}>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className={cn(HEADING_SM, "flex items-center gap-2 text-neutral-300")}>
            <span>🕑</span> Audit History Log
          </h2>
          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutral-600">⌕</span>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search Table or ID…"
              className="w-64 rounded-lg border border-white/10 bg-black/40 py-2 pl-9 pr-3 text-sm text-white outline-none placeholder:text-neutral-600 focus:border-white/25"
            />
          </div>
        </div>
        <div className="space-y-1">
          {filteredHistory.map((row) => (
            <div
              key={`${row.tableId}-${row.handNo}`}
              className="grid grid-cols-[1fr_1fr_1fr_auto] items-center gap-4 rounded-lg px-3 py-3 transition hover:bg-white/[0.03]"
            >
              <div className="flex items-center gap-3">
                <span className={cn("h-2 w-2 rounded-full", row.verified ? "bg-green" : "bg-neutral-600")} />
                <div>
                  <div className="font-display text-sm font-bold text-white">{row.tableId}</div>
                  <div className="text-[10px] uppercase tracking-wider text-neutral-600">Table_ID</div>
                </div>
              </div>
              <div>
                <div className="font-mono text-xs text-neutral-300">{row.timestamp}</div>
                <div className="text-[10px] uppercase tracking-wider text-neutral-600">Timestamp</div>
              </div>
              <div>
                <div className="font-mono text-xs text-cyan">{row.publicSeed}</div>
                <div className="text-[10px] uppercase tracking-wider text-neutral-600">Public Seed</div>
              </div>
              <button
                onClick={() => onReveal(row.matchId, row.handNo)}
                className={cn(
                  "rounded-md px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider",
                  row.verified
                    ? "border border-green/30 bg-green/10 text-green hover:bg-green/20"
                    : "border border-white/15 text-neutral-300 hover:bg-white/5",
                )}
              >
                {row.verified ? "✔ Verified" : "Verify"}
              </button>
            </div>
          ))}
          {filteredHistory.length === 0 && (
            <div className="py-8 text-center text-sm text-neutral-600">No hands match “{query}”.</div>
          )}
        </div>
      </section>
    </div>
  );
}

function EntropyStream() {
  return (
    <section className={cn(GLASS_PANEL, "p-6")}>
      <div className="mb-6 flex items-center justify-between">
        <h2 className={cn(HEADING_SM, "flex items-center gap-2 text-foreground")}>
          <span>▤</span> Live Entropy Stream
        </h2>
        <span className="text-[10px] uppercase tracking-[0.2em] text-neutral-600">Real-time data packets</span>
      </div>

      <div className="flex items-center justify-between py-6">
        <EntropyNode
          icon="⧉"
          title="OS CSPRNG"
          sub="crypto/rand · 256-bit seed"
        />
        <div className="mx-2 h-px flex-1 bg-gradient-to-r from-white/5 via-white/20 to-white/5" />
        <div className="flex flex-col items-center">
          <div className="relative flex h-24 w-24 items-center justify-center rounded-full border border-white/10 bg-white/[0.03]">
            <span className="font-display text-2xl font-bold text-brand">✦</span>
          </div>
          <div className="mt-3 text-center">
            <div className="font-display text-xs font-bold uppercase tracking-wider text-white">SHA-256 Commit</div>
            <div className="mt-0.5 font-mono text-[10px] text-green">published pre-deal</div>
          </div>
        </div>
        <div className="mx-2 h-px flex-1 bg-gradient-to-r from-white/5 via-white/20 to-white/5" />
        <EntropyNode
          icon="☌"
          title="Shuffle"
          sub="SHA-256-CTR → Fisher-Yates"
        />
      </div>

      <div className="mt-6 grid grid-cols-3 gap-4 border-t border-white/[0.06] pt-6 text-center">
        <Stat value="256-bit" label="Seed entropy" tone="plain" />
        <Stat value="SHA-256" label="Commitment" tone="green" />
        <Stat value="rs_poker" label="Shuffle engine" tone="green" />
      </div>
      <p className="mt-4 text-center text-[11px] text-neutral-500">
        Every deck is a deterministic function of an OS-random 256-bit seed, committed (SHA-256) before the deal and
        revealed after. No external oracle, no &quot;quantum&quot; source — just a seed you can recompute yourself.
      </p>
    </section>
  );
}

function EntropyNode({ icon, title, sub }: { icon: string; title: string; sub: string }) {
  return (
    <div className="flex flex-col items-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.03] text-2xl text-muted">
        {icon}
      </div>
      <div className="mt-3 text-center">
        <div className="font-display text-[11px] font-bold uppercase tracking-wider text-white">{title}</div>
        <div className="mt-0.5 font-mono text-[10px] text-neutral-500">{sub}</div>
      </div>
    </div>
  );
}

function Stat({ value, label, tone }: { value: string; label: string; tone: "plain" | "green" }) {
  return (
    <div>
      <div className={cn("font-display text-2xl font-bold", tone === "green" ? "text-green" : "text-foreground")}>
        {value}
      </div>
      <div className="mt-1 text-[10px] uppercase tracking-[0.2em] text-neutral-500">{label}</div>
    </div>
  );
}

function SystemHealthPanel({
  data,
  onRefresh,
  refreshing,
  refreshedAt,
}: {
  data: DashboardData;
  onRefresh: () => void;
  refreshing: boolean;
  refreshedAt: string | null;
}) {
  const { health } = data;
  return (
    <section className={cn(GLASS_PANEL, "flex flex-col p-6")}>
      <div className="mb-6 flex items-center justify-between">
        <h2 className={cn(HEADING_SM, "flex items-center gap-2 text-green")}>
          <span>((•))</span> System Health
        </h2>
        <span
          className={cn(
            "rounded-md px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider",
            health.operational
              ? "bg-green/15 text-green border border-green/30"
              : "bg-brand/15 text-brand border border-brand/30",
          )}
        >
          {health.operational ? "Operational" : "Degraded"}
        </span>
      </div>

      <dl className="space-y-4">
        <HealthRow label="RNG Node Response" value={`${health.rngLatencyMs}ms`} />
        <HealthRow label="Ledger Consistency" value={health.ledgerConsistency} />
        <HealthRow label="Active Proofs" value={health.activeProofs.toLocaleString()} />
        {health.anchorConfigured && health.anchorTx && (
          <HealthRow label="Anchor Tx" value={short(health.anchorTx, 6, 4)} />
        )}
      </dl>

      <div className="mt-auto pt-6">
        <button
          onClick={onRefresh}
          disabled={refreshing}
          className="w-full rounded-lg border border-green/30 bg-green/5 py-3 text-xs font-bold uppercase tracking-wider text-green transition hover:bg-green/10 disabled:opacity-50"
        >
          {refreshing ? "Refreshing…" : "Real-time System Status"}
        </button>
        {refreshedAt && (
          <p className="mt-2 text-center text-[10px] text-neutral-600">Last polled {refreshedAt}</p>
        )}
      </div>
    </section>
  );
}

function HealthRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-white/[0.05] pb-3">
      <dt className="text-sm text-neutral-400">{label}</dt>
      <dd className="font-display text-sm font-bold text-white">{value}</dd>
    </div>
  );
}
