"use client";

import Link from "next/link";
import { useCallback, useMemo, useState } from "react";

import { COMMAND_REGISTRY, commandsByCategory, getCommand } from "./commandRegistry";
import type { CommandCategory, CommandDefinition, CommandResult } from "./types";
import { CATEGORY_META } from "./types";

const CATEGORY_ORDER: CommandCategory[] = [
  "platform",
  "community",
  "game",
  "tournament",
  "table",
];

async function runLiveCommand(
  command: CommandDefinition,
  payload?: Record<string, unknown>,
): Promise<CommandResult> {
  const at = new Date().toISOString();

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

  if (command.id === "club_create") {
    const res = await fetch("/api/nakama/club", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload ?? command.example ?? {}),
    });
    const json = await res.json();
    return {
      ok: res.ok && json.ok,
      commandId: command.id,
      message: res.ok && json.ok ? "Community created (demo — not yet persisted)." : "Create community failed.",
      data: json.data ?? json.error,
      at,
    };
  }

  return {
    ok: false,
    commandId: command.id,
    message: "Unknown live command.",
    at,
  };
}

function StatusBadge({ status }: { status: CommandDefinition["status"] }) {
  return (
    <span
      className={
        status === "live"
          ? "rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-300"
          : "rounded-full bg-neutral-500/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-neutral-400"
      }
    >
      {status === "live" ? "Live" : "Coming Soon"}
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
  const isLink = Boolean(command.href);

  const inner = (
    <>
      <div className="flex items-start justify-between gap-3">
        <span className="text-2xl leading-none text-amber-300/90">{command.icon}</span>
        <StatusBadge status={command.status} />
      </div>
      <h3 className="mt-4 text-base font-semibold text-white">{command.title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-neutral-400">{command.description}</p>
      {command.rpc && (
        <p className="mt-3 font-mono text-[10px] text-emerald-400/80">rpc/{command.rpc}</p>
      )}
      <div className="mt-4 text-xs font-semibold uppercase tracking-wider text-amber-200/80">
        {isLink ? "Open →" : command.status === "live" ? "Run Command →" : "Preview →"}
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

  const stats = useMemo(() => {
    const live = COMMAND_REGISTRY.filter((c) => c.status === "live").length;
    const planned = COMMAND_REGISTRY.filter((c) => c.status === "planned").length;
    return { live, planned, total: COMMAND_REGISTRY.length };
  }, []);

  const handleRun = useCallback(async (command: CommandDefinition) => {
    if (command.status === "planned") {
      setActiveCommand(command);
      setFormJson(JSON.stringify(command.example ?? {}, null, 2));
      setResults((prev) => [
        {
          ok: false,
          commandId: command.id,
          message: `"${command.title}" is on the roadmap. Backend RPC not wired yet.`,
          data: command.example,
          at: new Date().toISOString(),
        },
        ...prev.slice(0, 9),
      ]);
      return;
    }

    if (command.id === "club_create") {
      setActiveCommand(command);
      setFormJson(JSON.stringify(command.example ?? {}, null, 2));
      return;
    }

    setBusyId(command.id);
    try {
      const result = await runLiveCommand(command);
      setResults((prev) => [result, ...prev.slice(0, 9)]);
    } finally {
      setBusyId(null);
    }
  }, []);

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
    } finally {
      setBusyId(null);
    }
  }, [activeCommand, formJson]);

  return (
    <div className="min-h-screen bg-neutral-950 text-white">
      {/* Hero */}
      <header className="border-b border-white/10 bg-gradient-to-b from-emerald-950/40 to-neutral-950 px-6 py-10">
        <div className="mx-auto flex max-w-6xl flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.4em] text-amber-300/80">Poker Next-Gen</p>
            <h1 className="mt-2 text-4xl font-semibold tracking-tight sm:text-5xl">Command Center</h1>
            <p className="mt-3 max-w-2xl text-neutral-400">
              Every action you can run on the network — create communities, games, tournaments, and
              open the live table canvas.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-950/30 px-4 py-3 text-center">
              <p className="text-2xl font-bold text-emerald-300">{stats.live}</p>
              <p className="text-[10px] uppercase tracking-wider text-neutral-400">Live Now</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-center">
              <p className="text-2xl font-bold text-neutral-200">{stats.planned}</p>
              <p className="text-[10px] uppercase tracking-wider text-neutral-400">Coming Soon</p>
            </div>
            <div className="rounded-xl border border-amber-500/30 bg-amber-950/20 px-4 py-3 text-center">
              <p className="text-2xl font-bold text-amber-200">{stats.total}</p>
              <p className="text-[10px] uppercase tracking-wider text-neutral-400">Total Commands</p>
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

        {/* Results log */}
        <section className="rounded-2xl border border-white/10 bg-black/30 p-6">
          <h2 className="text-lg font-semibold text-white">Command Log</h2>
          <p className="mt-1 text-sm text-neutral-500">
            Responses from live RPCs appear here. Planned commands show example payloads.
          </p>
          <div className="mt-4 space-y-3">
            {results.length === 0 && (
              <p className="text-sm text-neutral-500">
                Run <strong className="text-emerald-400">Check Backend Health</strong> or{" "}
                <strong className="text-emerald-400">Create Community</strong> to get started.
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

      {/* Modal for club create / planned preview */}
      {activeCommand && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-neutral-900 p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-wider text-amber-300/80">
                  {activeCommand.status === "live" ? "Run Command" : "Coming Soon"}
                </p>
                <h3 className="mt-1 text-xl font-semibold">{activeCommand.title}</h3>
              </div>
              <StatusBadge status={activeCommand.status} />
            </div>
            <p className="mt-3 text-sm text-neutral-400">{activeCommand.description}</p>

            <label className="mt-5 block text-xs font-semibold uppercase tracking-wider text-neutral-500">
              JSON Payload
            </label>
            <textarea
              value={formJson}
              onChange={(e) => setFormJson(e.target.value)}
              readOnly={activeCommand.status === "planned"}
              rows={10}
              className="mt-2 w-full rounded-xl border border-white/10 bg-black/40 p-3 font-mono text-xs text-emerald-100 outline-none focus:border-emerald-500/50"
            />

            <div className="mt-5 flex flex-wrap gap-3">
              {activeCommand.status === "live" && activeCommand.id === "club_create" && (
                <button
                  type="button"
                  disabled={busyId !== null}
                  onClick={submitModal}
                  className="rounded-full bg-emerald-700 px-6 py-2.5 text-sm font-semibold uppercase tracking-wider text-white hover:bg-emerald-600 disabled:opacity-50"
                >
                  Create Community
                </button>
              )}
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
