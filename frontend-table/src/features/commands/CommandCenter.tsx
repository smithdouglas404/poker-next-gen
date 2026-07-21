"use client";

import Link from "next/link";
import { useCallback, useMemo, useState } from "react";

import { COMMAND_REGISTRY, commandsByCategory, getCommand } from "./commandRegistry";
import type { CommandCategory, CommandDefinition, CommandResult } from "./types";
import { CATEGORY_META } from "./types";
import { callSessionRpc } from "@/lib/nakama/sessionRpc";

const CATEGORY_ORDER: CommandCategory[] = [
  "platform",
  "community",
  "game",
  "tournament",
  "math",
  "coaching",
  "security",
  "audit",
  "table",
];

const NO_PAYLOAD_COMMANDS = new Set(["healthz", "club_list", "table_list", "tournament_list", "wallet_get", "profile_get"]);

async function runLiveCommand(
  command: CommandDefinition,
  payload?: Record<string, unknown>,
): Promise<CommandResult> {
  const at = new Date().toISOString();

  if (!command.rpc) {
    return {
      ok: true,
      commandId: command.id,
      message: `Open ${command.href} to use this command.`,
      at,
    };
  }

  try {
    let body: unknown = payload ?? command.example ?? {};
    if (NO_PAYLOAD_COMMANDS.has(command.id)) {
      body = {};
    }

    if (command.id === "healthz") {
      const res = await fetch("/api/nakama/health", { method: "POST" });
      const json = await res.json();
      return {
        ok: res.ok && json.ok,
        commandId: command.id,
        message: res.ok && json.ok ? "Backend is online." : "Backend check failed.",
        data: json.data ?? json.error,
        at,
      };
    }

    const data = await callSessionRpc(command.rpc, body as Record<string, unknown>);
    return {
      ok: true,
      commandId: command.id,
      message: `${command.title} completed successfully.`,
      data,
      at,
    };
  } catch (error) {
    return {
      ok: false,
      commandId: command.id,
      message: error instanceof Error ? error.message : "Command failed.",
      at,
    };
  }
}

function StatusBadge() {
  return (
    <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-300">
      Live
    </span>
  );
}

function CommandCard({
  command,
  busy,
  onRun,
}: {
  command: CommandDefinition;
  busy: boolean;
  onRun: (command: CommandDefinition) => void;
}) {
  const isLink = Boolean(command.href) && !command.rpc;

  const inner = (
    <>
      <div className="flex items-start justify-between gap-3">
        <span className="text-2xl leading-none text-amber-300/90">{command.icon}</span>
        <StatusBadge />
      </div>
      <h3 className="mt-4 text-base font-semibold text-white">{command.title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-neutral-400">{command.description}</p>
      {command.rpc && (
        <p className="mt-3 font-mono text-[10px] text-emerald-400/80">rpc/{command.rpc}</p>
      )}
      <div className="mt-4 text-xs font-semibold uppercase tracking-wider text-amber-200/80">
        {isLink ? "Open →" : "Run Command →"}
      </div>
    </>
  );

  if (isLink) {
    return (
      <Link
        href={command.href!}
        className="group rounded-2xl border border-white/10 bg-white/[0.03] p-5 transition hover:border-amber-400/40 hover:bg-white/[0.06]"
      >
        {inner}
      </Link>
    );
  }

  return (
    <button
      type="button"
      disabled={busy}
      onClick={() => onRun(command)}
      className="group w-full rounded-2xl border border-white/10 bg-white/[0.03] p-5 text-left transition hover:border-amber-400/40 hover:bg-white/[0.06] disabled:opacity-60"
    >
      {inner}
    </button>
  );
}

export function CommandCenter() {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [activeCommand, setActiveCommand] = useState<CommandDefinition | null>(null);
  const [formJson, setFormJson] = useState("");
  const [results, setResults] = useState<CommandResult[]>([]);
  const [dismissedKey, setDismissedKey] = useState<string | null>(null);
  const [bannerExpanded, setBannerExpanded] = useState(false);

  const latest = results[0];
  const bannerVisible = Boolean(latest) && latest.at !== dismissedKey;

  const stats = useMemo(() => {
    const live = COMMAND_REGISTRY.filter((c) => c.status === "live").length;
    return { live, total: COMMAND_REGISTRY.length };
  }, []);

  const needsModal = useCallback((command: CommandDefinition) => {
    return Boolean(command.rpc) && !NO_PAYLOAD_COMMANDS.has(command.id) && command.id !== "healthz";
  }, []);

  const handleRun = useCallback(
    async (command: CommandDefinition) => {
      if (needsModal(command)) {
        setActiveCommand(command);
        setFormJson(JSON.stringify(command.example ?? {}, null, 2));
        return;
      }

      setBusyId(command.id);
      try {
        const result = await runLiveCommand(command);
        setResults((prev) => [result, ...prev.slice(0, 9)]);
        setBannerExpanded(false);
      } finally {
        setBusyId(null);
      }
    },
    [needsModal],
  );

  const submitModal = useCallback(async () => {
    if (!activeCommand) return;
    setBusyId(activeCommand.id);
    try {
      let payload: Record<string, unknown> = {};
      if (formJson.trim()) {
        payload = JSON.parse(formJson) as Record<string, unknown>;
      }
      const result = await runLiveCommand(activeCommand, payload);
      setResults((prev) => [result, ...prev.slice(0, 9)]);
      setBannerExpanded(false);
      setActiveCommand(null);
    } catch {
      setResults((prev) => [
        {
          ok: false,
          commandId: activeCommand.id,
          message: "Invalid JSON payload.",
          at: new Date().toISOString(),
        },
        ...prev.slice(0, 9),
      ]);
      setBannerExpanded(false);
    } finally {
      setBusyId(null);
    }
  }, [activeCommand, formJson]);

  return (
    <div className="min-h-screen bg-neutral-950 text-white">
      {bannerVisible && latest && (
        <div className="pointer-events-none fixed inset-x-0 top-0 z-[60] flex justify-center px-4 pt-4">
          <div
            role="status"
            aria-live="assertive"
            className={`pointer-events-auto w-full max-w-2xl rounded-2xl border-2 shadow-2xl backdrop-blur-md ${
              latest.ok
                ? "border-emerald-400/70 bg-emerald-950/80"
                : "border-red-500/70 bg-red-950/80"
            }`}
          >
            <div className="flex items-start gap-3 p-4">
              <span
                className={`mt-0.5 text-xl leading-none ${
                  latest.ok ? "text-emerald-300" : "text-red-300"
                }`}
              >
                {latest.ok ? "✓" : "✕"}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                      latest.ok
                        ? "bg-emerald-500/25 text-emerald-200"
                        : "bg-red-500/25 text-red-200"
                    }`}
                  >
                    {latest.ok ? "Success" : "Error"}
                  </span>
                  <p className="truncate text-sm font-semibold text-white">
                    {getCommand(latest.commandId)?.title ?? latest.commandId}
                  </p>
                  <span className="ml-auto text-[10px] text-white/50">{latest.at}</span>
                </div>
                <p
                  className={`mt-1 break-words text-sm ${
                    latest.ok ? "text-emerald-100" : "text-red-100"
                  }`}
                >
                  {latest.message}
                </p>
                {latest.data !== undefined && (
                  <div className="mt-2">
                    <button
                      type="button"
                      onClick={() => setBannerExpanded((v) => !v)}
                      className="text-[11px] font-semibold uppercase tracking-wider text-white/70 hover:text-white"
                    >
                      {bannerExpanded ? "Hide details ▲" : "Show details ▼"}
                    </button>
                    {bannerExpanded && (
                      <pre className="mt-2 max-h-64 overflow-auto rounded-lg bg-black/50 p-3 text-xs text-emerald-100">
                        {JSON.stringify(latest.data, null, 2)}
                      </pre>
                    )}
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={() => setDismissedKey(latest.at)}
                aria-label="Dismiss"
                className="shrink-0 rounded-lg px-2 py-1 text-lg leading-none text-white/60 hover:bg-white/10 hover:text-white"
              >
                ×
              </button>
            </div>
          </div>
        </div>
      )}

      <header className="border-b border-white/10 bg-gradient-to-b from-emerald-950/40 to-neutral-950 px-6 py-10">
        <div className="mx-auto flex max-w-6xl flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.4em] text-amber-300/80">Poker Next-Gen</p>
            <h1 className="mt-2 text-4xl font-semibold tracking-tight sm:text-5xl">Command Center</h1>
            <p className="mt-3 max-w-2xl text-neutral-400">
              Every platform action — communities, wallets, cash games, tournaments, and the live table.
              All {stats.live} commands are wired to live Nakama RPCs.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/stack"
              className="rounded-xl border border-violet-500/40 bg-violet-950/40 px-5 py-3 text-sm font-semibold text-violet-200 hover:bg-violet-900/40"
            >
              Live Stack →
            </Link>
            <Link
              href="/lobby"
              className="rounded-xl border border-sky-500/40 bg-sky-950/40 px-5 py-3 text-sm font-semibold text-sky-200 hover:bg-sky-900/40"
            >
              Table Lobby →
            </Link>
            <a
              href={process.env.NEXT_PUBLIC_ODDSLINGERS_URL ?? "http://localhost:8888"}
              target="_blank"
              rel="noreferrer"
              className="rounded-xl border border-amber-500/40 bg-amber-950/30 px-5 py-3 text-sm font-semibold text-amber-200 hover:bg-amber-900/30"
            >
              OddSlingers →
            </a>
            <Link
              href="/table"
              className="rounded-xl border border-emerald-500/40 bg-emerald-950/40 px-5 py-3 text-sm font-semibold text-emerald-200 hover:bg-emerald-900/40"
            >
              Open Table →
            </Link>
            <Link
              href="/tournaments"
              className="rounded-xl border border-violet-500/40 bg-violet-950/30 px-5 py-3 text-sm font-semibold text-violet-200 hover:bg-violet-900/30"
            >
              Tournaments →
            </Link>
            <Link
              href="/membership"
              className="rounded-xl border border-amber-400/50 bg-gradient-to-r from-amber-950/40 to-yellow-900/20 px-5 py-3 text-sm font-semibold text-amber-200 hover:from-amber-900/40"
            >
              Membership →
            </Link>
            <Link
              href="/clubs"
              className="rounded-xl border border-amber-400/40 bg-amber-950/20 px-5 py-3 text-sm font-semibold text-amber-200 hover:bg-amber-900/20"
            >
              Clubs →
            </Link>
            <Link
              href="/capabilities"
              className="rounded-xl border border-cyan/40 bg-cyan/5 px-5 py-3 text-sm font-semibold text-cyan hover:bg-cyan/10"
            >
              Capabilities →
            </Link>
            <Link
              href="/studio"
              className="rounded-xl border border-fuchsia-400/40 bg-fuchsia-950/20 px-5 py-3 text-sm font-semibold text-fuchsia-200 hover:bg-fuchsia-900/20"
            >
              Character Studio →
            </Link>
            <Link
              href="/login"
              className="rounded-xl border border-sky-500/40 bg-sky-950/30 px-5 py-3 text-sm font-semibold text-sky-200 hover:bg-sky-900/30"
            >
              Sign In →
            </Link>
            <Link
              href="/admin"
              className="rounded-xl border border-amber-500/40 bg-amber-950/20 px-5 py-3 text-sm font-semibold text-amber-200 hover:bg-amber-900/20"
            >
              Admin →
            </Link>
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-950/30 px-4 py-3 text-center">
              <p className="text-2xl font-bold text-emerald-300">{stats.live}</p>
              <p className="text-[10px] uppercase tracking-wider text-neutral-400">Live Commands</p>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-10">
        {CATEGORY_ORDER.map((category) => {
          const meta = CATEGORY_META[category];
          const commands = commandsByCategory(category);
          return (
            <section key={category} className="mb-12">
              <div className={`mb-5 rounded-2xl border p-5 ${meta.accent}`}>
                <h2 className="text-xl font-semibold text-white">{meta.label}</h2>
                <p className="mt-1 text-sm text-neutral-400">{meta.subtitle}</p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {commands.map((command) => (
                  <CommandCard
                    key={command.id}
                    command={command}
                    busy={busyId !== null}
                    onRun={handleRun}
                  />
                ))}
              </div>
            </section>
          );
        })}

        <section className="rounded-2xl border border-white/10 bg-black/30 p-6">
          <h2 className="text-lg font-semibold text-white">Command Log</h2>
          <p className="mt-1 text-sm text-neutral-500">Responses from live RPCs appear here.</p>
          <div className="mt-4 space-y-3">
            {results.length === 0 && (
              <p className="text-sm text-neutral-500">
                Run <strong className="text-emerald-400">Check Backend Health</strong> or{" "}
                <strong className="text-emerald-400">View Player Profile</strong> to get started.
              </p>
            )}
            {results.map((result, i) => {
              const cmd = getCommand(result.commandId);
              return (
                <div
                  key={`${result.at}-${i}`}
                  className={`rounded-xl border p-4 ${
                    result.ok
                      ? "border-emerald-500/30 bg-emerald-950/20"
                      : "border-amber-500/20 bg-amber-950/10"
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-medium text-white">{cmd?.title ?? result.commandId}</p>
                    <span className="text-[10px] text-neutral-500">{result.at}</span>
                  </div>
                  <p className="mt-1 text-sm text-neutral-300">{result.message}</p>
                  {result.data !== undefined && (
                    <pre className="mt-3 overflow-x-auto rounded-lg bg-black/40 p-3 text-xs text-emerald-200">
                      {JSON.stringify(result.data, null, 2)}
                    </pre>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      </main>

      {activeCommand && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-neutral-900 p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-wider text-amber-300/80">Run Command</p>
                <h3 className="mt-1 text-xl font-semibold">{activeCommand.title}</h3>
              </div>
              <StatusBadge />
            </div>
            <p className="mt-3 text-sm text-neutral-400">{activeCommand.description}</p>

            <label className="mt-5 block text-xs font-semibold uppercase tracking-wider text-neutral-500">
              JSON Payload
            </label>
            <textarea
              value={formJson}
              onChange={(e) => setFormJson(e.target.value)}
              rows={10}
              className="mt-2 w-full rounded-xl border border-white/10 bg-black/40 p-3 font-mono text-xs text-emerald-100 outline-none focus:border-emerald-500/50"
            />

            <div className="mt-5 flex flex-wrap gap-3">
              <button
                type="button"
                disabled={busyId !== null}
                onClick={submitModal}
                className="rounded-full bg-emerald-700 px-6 py-2.5 text-sm font-semibold uppercase tracking-wider text-white hover:bg-emerald-600 disabled:opacity-50"
              >
                Run
              </button>
              <button
                type="button"
                onClick={() => setActiveCommand(null)}
                className="rounded-full border border-white/20 px-6 py-2.5 text-sm font-semibold uppercase tracking-wider text-neutral-300 hover:bg-white/5"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
