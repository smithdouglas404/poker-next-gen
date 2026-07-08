"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

interface SyncConfig {
  openProjectMcpUrl: string;
  openProjectApiBaseUrl: string;
  intervalSeconds: number;
  enabled: boolean;
  model: string;
  listToolName: string;
  listToolArguments: Record<string, unknown>;
  kgEnabled: boolean;
  kgGraphName: string;
  kgRetrieveLimit: number;
}

interface LastRun {
  at: string;
  trigger: string;
  fetched: number;
  changed: number;
  reviewed: number;
  posted: number;
  errors: string[];
}

interface Readiness {
  openProjectMcpUrl: boolean;
  openProjectMcpToken: boolean;
  openProjectApiBaseUrl: boolean;
  openProjectApiToken: boolean;
  anthropicApiKey: boolean;
}

interface ReviewRecord {
  id: string;
  workPackageId: string;
  subject: string;
  insight: string;
  recommendation: string;
  methodology: string;
  at: string;
  posted: boolean;
  error?: string;
}

const READINESS_LABELS: Record<keyof Readiness, string> = {
  openProjectMcpUrl: "OpenProject MCP URL",
  openProjectMcpToken: "OpenProject MCP token (env)",
  openProjectApiBaseUrl: "OpenProject API base URL",
  openProjectApiToken: "OpenProject API token (env)",
  anthropicApiKey: "Anthropic API key (env)",
};

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api/openproject-mcp/${path}`, init);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
  return data as T;
}

export default function McpConfigPage() {
  const [config, setConfig] = useState<SyncConfig | null>(null);
  const [lastRun, setLastRun] = useState<LastRun | null>(null);
  const [readiness, setReadiness] = useState<Readiness | null>(null);
  const [running, setRunning] = useState(false);
  const [reviews, setReviews] = useState<ReviewRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [discoveredTools, setDiscoveredTools] = useState<string[] | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const status = await api<{
        config: SyncConfig;
        lastRun: LastRun | null;
        readiness: Readiness;
        running: boolean;
      }>("status");
      setConfig(status.config);
      setLastRun(status.lastRun);
      setReadiness(status.readiness);
      setRunning(status.running);
      const r = await api<{ reviews: ReviewRecord[] }>("reviews");
      setReviews(r.reviews);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load MCP config");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const patch = useCallback((p: Partial<SyncConfig>) => {
    setConfig((c: SyncConfig | null) => (c ? { ...c, ...p } : c));
  }, []);

  const save = useCallback(async () => {
    if (!config) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await api("config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          openProjectMcpUrl: config.openProjectMcpUrl,
          openProjectApiBaseUrl: config.openProjectApiBaseUrl,
          intervalSeconds: config.intervalSeconds,
          enabled: config.enabled,
          model: config.model,
          listToolName: config.listToolName,
          kgEnabled: config.kgEnabled,
          kgGraphName: config.kgGraphName,
          kgRetrieveLimit: config.kgRetrieveLimit,
        }),
      });
      setNotice("Saved. The new interval applies on the next cycle.");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }, [config, load]);

  const testConnection = useCallback(async () => {
    setBusy(true);
    setError(null);
    setNotice(null);
    setDiscoveredTools(null);
    try {
      const { tools } = await api<{ tools: string[] }>("mcp/tools");
      setDiscoveredTools(tools);
      setNotice(`Connected. ${tools.length} tool(s) exposed by the OpenProject MCP server.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Test connection failed");
    } finally {
      setBusy(false);
    }
  }, []);

  const reviewNow = useCallback(async () => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const { run } = await api<{ run: LastRun }>("review-now", { method: "POST" });
      setNotice(
        `Review complete: fetched ${run.fetched}, changed ${run.changed}, posted ${run.posted}` +
          (run.errors.length ? `, ${run.errors.length} error(s)` : ""),
      );
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Review Now failed");
    } finally {
      setBusy(false);
    }
  }, [load]);

  const intervalMinutes = config ? Math.round(config.intervalSeconds / 60) : 60;

  return (
    <div className="min-h-screen bg-neutral-950 text-white">
      <header className="border-b border-white/10 px-6 py-8">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-amber-300/80">Admin · Integrations</p>
            <h1 className="mt-1 text-3xl font-semibold">OpenProject MCP</h1>
            <p className="mt-1 text-sm text-neutral-400">
              Read work-package changes via the OpenProject MCP server, review them with Claude
              (grounded on the FalkorDB knowledge graph), and post the review back via the OpenProject REST API.
            </p>
          </div>
          <Link href="/admin" className="whitespace-nowrap text-sm text-emerald-400 hover:underline">
            ← Admin
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-4xl space-y-6 px-6 py-8">
        {error && (
          <div className="rounded-xl border border-red-500/30 bg-red-950/20 p-4 text-sm text-red-200">{error}</div>
        )}
        {notice && (
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-950/20 p-4 text-sm text-emerald-200">
            {notice}
          </div>
        )}

        {!config && !error && <p className="text-sm text-neutral-500">Loading…</p>}

        {config && (
          <>
            <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
              <h2 className="text-lg font-semibold">Connection</h2>
              <div className="mt-4 grid gap-4">
                <Field
                  label="OpenProject MCP URL"
                  hint="The read-only MCP endpoint, usually https://your-openproject/mcp"
                  value={config.openProjectMcpUrl}
                  onChange={(v) => patch({ openProjectMcpUrl: v })}
                  placeholder="https://openproject.example.com/mcp"
                />
                <Field
                  label="OpenProject API base URL"
                  hint="Instance base URL used to POST the review back (no trailing /api/v3)"
                  value={config.openProjectApiBaseUrl}
                  onChange={(v) => patch({ openProjectApiBaseUrl: v })}
                  placeholder="https://openproject.example.com"
                />
                <Field
                  label="List tool name"
                  hint="The OpenProject MCP tool used to list work packages"
                  value={config.listToolName}
                  onChange={(v) => patch({ listToolName: v })}
                />
                <div>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void testConnection()}
                    className="rounded-full border border-sky-500/40 bg-sky-950/30 px-4 py-2 text-sm font-semibold text-sky-200 hover:bg-sky-900/30 disabled:opacity-50"
                  >
                    Test connection
                  </button>
                  {discoveredTools && (
                    <div className="mt-3">
                      <p className="text-xs uppercase tracking-wider text-neutral-500">
                        Tools exposed by your MCP server — click to use for listing:
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {discoveredTools.map((t) => (
                          <button
                            key={t}
                            type="button"
                            onClick={() => patch({ listToolName: t })}
                            className={`rounded-full border px-3 py-1 text-xs ${
                              config.listToolName === t
                                ? "border-emerald-500/50 bg-emerald-950/40 text-emerald-200"
                                : "border-white/15 bg-white/[0.03] text-neutral-300 hover:border-emerald-400/40"
                            }`}
                          >
                            {t}
                          </button>
                        ))}
                        {discoveredTools.length === 0 && (
                          <span className="text-xs text-neutral-500">
                            Connected, but the server reported no tools.
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </section>

            <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
              <h2 className="text-lg font-semibold">Schedule</h2>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
                    Sync interval (minutes)
                  </span>
                  <input
                    type="number"
                    min={1}
                    value={intervalMinutes}
                    onChange={(e) =>
                      patch({ intervalSeconds: Math.max(60, Number(e.target.value) * 60) })
                    }
                    className="mt-2 w-full rounded-xl border border-white/10 bg-black/40 p-3 text-sm outline-none focus:border-emerald-500/50"
                  />
                  <span className="mt-1 block text-xs text-neutral-500">
                    = {config.intervalSeconds}s. Default hourly. Minimum 1 minute.
                  </span>
                </label>
                <label className="flex items-center gap-3 pt-6">
                  <input
                    type="checkbox"
                    checked={config.enabled}
                    onChange={(e) => patch({ enabled: e.target.checked })}
                    className="h-5 w-5"
                  />
                  <span className="text-sm">Scheduled hourly sync enabled</span>
                </label>
              </div>
            </section>

            <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
              <h2 className="text-lg font-semibold">Knowledge graph (FalkorDB)</h2>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <Field
                  label="Graph name"
                  value={config.kgGraphName}
                  onChange={(v) => patch({ kgGraphName: v })}
                />
                <label className="block">
                  <span className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
                    Grounding facts per review
                  </span>
                  <input
                    type="number"
                    min={0}
                    value={config.kgRetrieveLimit}
                    onChange={(e) => patch({ kgRetrieveLimit: Math.max(0, Number(e.target.value)) })}
                    className="mt-2 w-full rounded-xl border border-white/10 bg-black/40 p-3 text-sm outline-none focus:border-emerald-500/50"
                  />
                </label>
                <label className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={config.kgEnabled}
                    onChange={(e) => patch({ kgEnabled: e.target.checked })}
                    className="h-5 w-5"
                  />
                  <span className="text-sm">Ground reviews on the knowledge graph</span>
                </label>
              </div>
              <p className="mt-3 text-xs text-neutral-500">
                FalkorDB connection + all secret tokens (MCP token, API token, Anthropic key, FalkorDB
                credentials) are set as service environment variables, not here.
              </p>
            </section>

            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                disabled={busy}
                onClick={() => void save()}
                className="rounded-full bg-emerald-700 px-6 py-2.5 text-sm font-semibold uppercase tracking-wider hover:bg-emerald-600 disabled:opacity-50"
              >
                Save
              </button>
              <button
                type="button"
                disabled={busy || running}
                onClick={() => void reviewNow()}
                className="rounded-full border border-amber-500/40 bg-amber-950/30 px-6 py-2.5 text-sm font-semibold uppercase tracking-wider text-amber-200 hover:bg-amber-900/30 disabled:opacity-50"
              >
                {running ? "Sync running…" : "Review now"}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void load()}
                className="rounded-full border border-white/20 px-6 py-2.5 text-sm font-semibold uppercase tracking-wider hover:bg-white/5 disabled:opacity-50"
              >
                Refresh
              </button>
            </div>

            {readiness && (
              <section className="rounded-2xl border border-white/10 bg-black/30 p-6">
                <h2 className="text-lg font-semibold">Readiness</h2>
                <div className="mt-4 grid gap-2 sm:grid-cols-2">
                  {(Object.keys(READINESS_LABELS) as Array<keyof Readiness>).map((k) => (
                    <div key={k} className="flex items-center gap-2 text-sm">
                      <span className={readiness[k] ? "text-emerald-400" : "text-red-400"}>
                        {readiness[k] ? "✓" : "✗"}
                      </span>
                      <span className="text-neutral-300">{READINESS_LABELS[k]}</span>
                    </div>
                  ))}
                </div>
              </section>
            )}

            <section className="rounded-2xl border border-white/10 bg-black/30 p-6">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">Last run</h2>
                {running && <span className="text-xs text-amber-300">running…</span>}
              </div>
              {lastRun ? (
                <div className="mt-3 text-sm text-neutral-300">
                  <p>
                    {new Date(lastRun.at).toLocaleString()} · {lastRun.trigger} · fetched{" "}
                    {lastRun.fetched} · changed {lastRun.changed} · reviewed {lastRun.reviewed} · posted{" "}
                    {lastRun.posted}
                  </p>
                  {lastRun.errors.length > 0 && (
                    <ul className="mt-2 list-disc pl-5 text-red-300">
                      {lastRun.errors.map((e, i) => (
                        <li key={i}>{e}</li>
                      ))}
                    </ul>
                  )}
                </div>
              ) : (
                <p className="mt-3 text-sm text-neutral-500">No runs yet.</p>
              )}
            </section>

            <section className="rounded-2xl border border-white/10 bg-black/30 p-6">
              <h2 className="text-lg font-semibold">Recent reviews</h2>
              <div className="mt-4 space-y-3">
                {reviews.length === 0 && <p className="text-sm text-neutral-500">No reviews yet.</p>}
                {reviews.slice(0, 15).map((r) => (
                  <div key={r.id} className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-medium">
                        #{r.workPackageId} · {r.subject}
                      </p>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] uppercase ${
                          r.posted ? "bg-emerald-500/20 text-emerald-300" : "bg-red-500/20 text-red-300"
                        }`}
                      >
                        {r.posted ? "posted" : "failed"}
                      </span>
                    </div>
                    {r.posted ? (
                      <div className="mt-2 space-y-1 text-sm text-neutral-300">
                        <p>
                          <span className="text-amber-200">Insight:</span> {r.insight}
                        </p>
                        <p>
                          <span className="text-amber-200">Recommendation:</span> {r.recommendation}
                        </p>
                        <p>
                          <span className="text-amber-200">Methodology:</span> {r.methodology}
                        </p>
                      </div>
                    ) : (
                      <p className="mt-2 text-sm text-red-300">{r.error}</p>
                    )}
                    <p className="mt-2 text-[10px] text-neutral-500">{new Date(r.at).toLocaleString()}</p>
                  </div>
                ))}
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  );
}

function Field({
  label,
  hint,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="text-xs font-semibold uppercase tracking-wider text-neutral-500">{label}</span>
      <input
        type="text"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="mt-2 w-full rounded-xl border border-white/10 bg-black/40 p-3 text-sm outline-none focus:border-emerald-500/50"
      />
      {hint && <span className="mt-1 block text-xs text-neutral-500">{hint}</span>}
    </label>
  );
}
