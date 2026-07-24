"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { COMMAND_REGISTRY, commandsByCategory, getCommand } from "./commandRegistry";
import type { CommandCategory, CommandDefinition, CommandResult } from "./types";
import { CATEGORY_META } from "./types";
import { canAccessCommand, canSeeCommand, useMeRoles, useMeVerification } from "./useMeRoles";
import { canRunInClub, clubStandingLabel } from "./access";
import { ResultView } from "./ResultView";
import { ClubSetupWizard } from "./ClubSetupWizard";
import { TournamentBuilderWizard } from "./TournamentBuilderWizard";
import {
  WORKSPACE_META,
  WORKSPACE_ORDER,
  workspaceForCommand,
  type Workspace,
} from "./workspaces";

// Relative/local timestamp for the command log (UI review P1-2): "2s ago",
// "3m ago", else a local time — never a raw ISO string.
function formatWhen(iso: string): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return iso;
  const secs = Math.round((Date.now() - t) / 1000);
  if (secs < 5) return "just now";
  if (secs < 60) return `${secs}s ago`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  return new Date(iso).toLocaleTimeString();
}
import { callSessionRpc } from "@/lib/nakama/sessionRpc";
import { getRpcSchema } from "./schemas";
import { SchemaForm } from "./schemaForm/SchemaForm";
import { initialValues, validate } from "./schemaForm/validate";
import {
  ActiveClubProvider,
  ActiveClubSwitcher,
  useActiveClub,
} from "./schemaForm/activeClub";
import {
  describeSubmission,
  maxMoneyMinor,
  needsConfirm,
  riskOf,
  TYPED_CONFIRM_THRESHOLD_MINOR,
} from "./schemaForm/confirm";
import type { RpcSchema } from "./schemaForm/schemaTypes";
import { orderedFields } from "./schemaForm/schemaTypes";
import { schemaFromExample, coerceSynthPayload } from "./schemaForm/autoSchema";

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

const NO_PAYLOAD_COMMANDS = new Set(["healthz", "club_list", "table_list", "tournament_list", "wallet_get", "auth_profile", "auth_sign_in"]);

// GGPoker nav chips — clean neutral surface with tone accents for primary/premium.
const NAV_CHIP =
  "rounded-xl border border-white/10 bg-white/[0.03] px-5 py-3 text-sm font-semibold text-neutral-200 transition hover:border-white/20 hover:bg-white/[0.06]";
const NAV_CHIP_RED =
  "rounded-xl border border-red-400/40 bg-red-400/10 px-5 py-3 text-sm font-semibold text-red-300 transition hover:bg-red-400/15";
const NAV_CHIP_GOLD =
  "rounded-xl border border-gold/50 bg-gold/10 px-5 py-3 text-sm font-semibold text-gold transition hover:bg-gold/15";

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
    <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-300">
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
        <span aria-hidden="true" className="text-2xl leading-none text-gold">{command.icon}</span>
        <StatusBadge />
      </div>
      <h3 className="mt-4 text-base font-semibold text-white">{command.title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-neutral-300">{command.description}</p>
      <div className="mt-4 text-xs font-semibold uppercase tracking-wider text-gold">
        {isLink ? "Open →" : "Run Command →"}
      </div>
    </>
  );

  if (isLink) {
    return (
      <Link
        href={command.href!}
        className="group rounded-2xl border border-white/[0.06] bg-[#262d38] p-5 transition hover:border-brand/40 hover:bg-white/[0.04]"
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
      className="group w-full rounded-2xl border border-white/[0.06] bg-[#262d38] p-5 text-left transition hover:border-brand/40 hover:bg-white/[0.04] disabled:opacity-60"
    >
      {inner}
    </button>
  );
}

export function CommandCenter() {
  return (
    <ActiveClubProvider>
      <CommandCenterInner />
    </ActiveClubProvider>
  );
}

function CommandCenterInner() {
  const roles = useMeRoles();
  const verification = useMeVerification();
  const { clubs, activeClubId, refresh: refreshClubs } = useActiveClub();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [activeCommand, setActiveCommand] = useState<CommandDefinition | null>(null);
  const [formValues, setFormValues] = useState<Record<string, unknown>>({});
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [typedConfirm, setTypedConfirm] = useState("");
  const [memberNames, setMemberNames] = useState<Record<string, string>>({});
  const [results, setResults] = useState<CommandResult[]>([]);
  const [dismissedKey, setDismissedKey] = useState<string | null>(null);
  const [bannerExpanded, setBannerExpanded] = useState(false);
  const [view, setView] = useState<"workspaces" | "console">("workspaces");
  const [wizardOpen, setWizardOpen] = useState(false);
  const [tourneyWizardOpen, setTourneyWizardOpen] = useState(false);

  // The form schema for the active command: the generated one (P0-1) if present,
  // otherwise one synthesised from the command's example so EVERY command with
  // inputs renders labelled fields (money in dollars, id pickers) — never raw
  // JSON. `activeSynth` marks the synthesised case so submit coerces values back.
  const { schema: activeSchema, synth: activeSynth } = useMemo<{
    schema: RpcSchema | undefined;
    synth: boolean;
  }>(() => {
    if (!activeCommand?.rpc) return { schema: undefined, synth: false };
    const gen = getRpcSchema(activeCommand.rpc);
    if (gen) return { schema: gen, synth: false };
    const s = schemaFromExample(activeCommand.rpc, activeCommand.example);
    return orderedFields(s).length > 0 ? { schema: s, synth: true } : { schema: undefined, synth: false };
  }, [activeCommand]);

  // Resolve club/user ids to names for the confirm sentence (P0-3), so the
  // operator reads real names, not ids.
  const clubName = useCallback(
    (id: string) => clubs.find((c) => c.id === id)?.name,
    [clubs],
  );
  const userName = useCallback((id: string) => memberNames[id], [memberNames]);

  // Load member names for the selected club so the confirm sentence and any
  // resolved user shows a username.
  const formClubId = (formValues["club_id"] as string) || activeClubId || "";
  useEffect(() => {
    if (!activeSchema || !formClubId) return;
    let cancelled = false;
    void (async () => {
      try {
        const data = (await callSessionRpc("club_members", { club_id: formClubId })) as
          | { members?: Array<{ user_id: string; username: string }> }
          | null;
        if (!cancelled && Array.isArray(data?.members)) {
          const map: Record<string, string> = {};
          for (const m of data!.members!) map[m.user_id] = m.username;
          setMemberNames(map);
        }
      } catch {
        /* non-fatal */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeSchema, formClubId]);

  const latest = results[0];
  const bannerVisible = Boolean(latest) && latest.at !== dismissedKey;

  const stats = useMemo(() => {
    const live = COMMAND_REGISTRY.filter((c) => c.status === "live").length;
    return { live, total: COMMAND_REGISTRY.length };
  }, []);

  // A command opens a form modal only if it actually takes inputs. Zero-input
  // reads (loyalty, wallet, lists…) just run — no empty JSON box.
  const needsModal = useCallback((command: CommandDefinition) => {
    if (!command.rpc || command.id === "healthz") return false;
    const gen = getRpcSchema(command.rpc);
    if (gen && orderedFields(gen).length > 0) return true;
    return orderedFields(schemaFromExample(command.rpc, command.example)).length > 0;
  }, []);

  const handleRun = useCallback(
    async (command: CommandDefinition) => {
      if (needsModal(command)) {
        setActiveCommand(command);
        setConfirmOpen(false);
        setTypedConfirm("");
        const seed = activeClubId ? { club_id: activeClubId } : {};
        const gen = command.rpc ? getRpcSchema(command.rpc) : undefined;
        if (gen) {
          // Generated form (P0-1): prefill from example, inherit the active club
          // so club_id is never typed (P0-4).
          setFormValues(initialValues(gen, seed));
        } else {
          // Synthesised form from the example — labelled fields (pickers, card
          // pickers, sliders, dropdowns), never raw JSON.
          setFormValues(initialValues(schemaFromExample(command.rpc!, command.example), seed));
        }
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
    [needsModal, activeClubId],
  );

  const closeModal = useCallback(() => {
    setActiveCommand(null);
    setConfirmOpen(false);
    setTypedConfirm("");
    setFormValues({});
  }, []);

  // Escape closes the top-most overlay (accessibility P1-5): confirm, then
  // wizard, then the command form.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      if (confirmOpen) setConfirmOpen(false);
      else if (wizardOpen) setWizardOpen(false);
      else if (activeCommand) closeModal();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [confirmOpen, wizardOpen, activeCommand, closeModal]);

  // Execute the active command with the current form values (after confirm).
  const executeActive = useCallback(async () => {
    if (!activeCommand) return;
    setBusyId(activeCommand.id);
    try {
      const payload =
        activeSynth && activeSchema
          ? coerceSynthPayload(activeSchema, formValues, activeCommand.example)
          : formValues;
      const result = await runLiveCommand(activeCommand, payload);
      setResults((prev) => [result, ...prev.slice(0, 9)]);
      setBannerExpanded(false);
      closeModal();
    } finally {
      setBusyId(null);
    }
  }, [activeCommand, formValues, activeSynth, activeSchema, closeModal]);

  // "Review & Run": validate, then either confirm (money/destructive/write) or
  // run directly.
  const proceedFromForm = useCallback(() => {
    if (!activeCommand?.rpc || !activeSchema) return;
    const errors = validate(activeSchema, formValues);
    if (errors.length > 0) return; // form shows the errors inline
    if (needsConfirm(activeCommand.rpc)) {
      setTypedConfirm("");
      setConfirmOpen(true);
    } else {
      void executeActive();
    }
  }, [activeCommand, activeSchema, formValues, executeActive]);

  return (
    <div className="min-h-screen bg-background text-foreground">
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
                      {bannerExpanded ? "Hide details ▲" : "View details ▼"}
                    </button>
                    {bannerExpanded && (
                      <div className="mt-2 max-h-72 overflow-auto rounded-lg bg-black/30 p-3">
                        <ResultView commandId={latest.commandId} data={latest.data} />
                      </div>
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

      <header className="border-b border-white/[0.06] bg-surface px-6 py-10">
        <div className="mx-auto flex max-w-6xl flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.4em] text-gold/80">High Rollers Club</p>
            <h1 className="mt-2 text-4xl font-semibold tracking-tight sm:text-5xl">Command Center</h1>
            <p className="mt-3 max-w-2xl text-neutral-400">
              Every platform action — communities, wallets, cash games, tournaments, and the live table.
              All {stats.live} actions run live against the platform.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <ActiveClubSwitcher />
            <div
              className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2"
              title="Your role in the active club drives which commands are shown. The server enforces every action."
            >
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted">You are</span>
              <span className="text-sm font-semibold text-white">
                {clubStandingLabel(roles, activeClubId)}
              </span>
            </div>
            <Link href="/lobby" className={NAV_CHIP}>
              Table Lobby →
            </Link>
            <Link href="/table" className={NAV_CHIP_RED}>
              Open Table →
            </Link>
            <Link href="/tournaments" className={NAV_CHIP}>
              Tournaments →
            </Link>
            <Link href="/membership" className={NAV_CHIP_GOLD}>
              Membership →
            </Link>
            <Link href="/clubs" className={NAV_CHIP}>
              Clubs →
            </Link>
            <Link href="/capabilities" className={NAV_CHIP}>
              Capabilities →
            </Link>
            <Link href="/studio" className={NAV_CHIP}>
              Character Studio →
            </Link>
            <Link href="/marketplace" className={NAV_CHIP}>
              Marketplace →
            </Link>
            <Link
              href="/provably-fair"
              className="rounded-xl border border-cyan/40 bg-cyan/10 px-5 py-3 text-sm font-semibold text-cyan transition hover:bg-cyan/15"
            >
              Provably Fair →
            </Link>
            <Link href="/login" className={NAV_CHIP}>
              Sign In →
            </Link>
            {roles.platform_admin && (
              <Link href="/admin" className={NAV_CHIP_RED}>
                Admin →
              </Link>
            )}
            <div className="rounded-xl border border-green/30 bg-green/10 px-4 py-3 text-center">
              <p className="text-2xl font-bold text-green">{stats.live}</p>
              <p className="text-[10px] uppercase tracking-wider text-muted">Live Commands</p>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-10">
        {/* View toggle: operator jobs (default) vs the flat command console. */}
        <div className="mb-8 flex items-center justify-between gap-4">
          <div className="inline-flex rounded-xl border border-white/10 bg-white/[0.03] p-1">
            <button
              type="button"
              onClick={() => setView("workspaces")}
              className={`rounded-lg px-4 py-1.5 text-sm font-semibold transition ${
                view === "workspaces" ? "bg-gold text-black" : "text-neutral-300 hover:text-white"
              }`}
            >
              Workspaces
            </button>
            <button
              type="button"
              onClick={() => setView("console")}
              className={`rounded-lg px-4 py-1.5 text-sm font-semibold transition ${
                view === "console" ? "bg-gold text-black" : "text-neutral-300 hover:text-white"
              }`}
            >
              Console
            </button>
          </div>
          <p className="text-xs text-muted">
            {view === "workspaces"
              ? "Organized around what you're trying to do."
              : "Every command, grouped by system."}
          </p>
        </div>

        {view === "workspaces" ? (
          WORKSPACE_ORDER.map((workspace: Workspace) => {
            const meta = WORKSPACE_META[workspace];
            const commands = COMMAND_REGISTRY.filter(
              (c) =>
                workspaceForCommand(c) === workspace &&
                canSeeCommand(c, roles) &&
                canAccessCommand(c, verification) &&
                canRunInClub(c.id, roles, activeClubId),
            );
            const showSetupCta = workspace === "my_club" && clubs.length === 0;
            // Show the tournament builder CTA to anyone who can build one.
            const showTourneyCta =
              workspace === "run_games" && canRunInClub("tournament_create", roles, activeClubId);
            if (commands.length === 0 && !showSetupCta && !showTourneyCta) return null;
            return (
              <section key={workspace} className="mb-12">
                <div className={`mb-5 flex items-center gap-3 rounded-2xl border bg-surface/60 p-5 ${meta.accent}`}>
                  <span aria-hidden="true" className="text-2xl text-gold">{meta.icon}</span>
                  <div>
                    <h2 className="text-xl font-semibold text-white">{meta.label}</h2>
                    <p className="mt-0.5 text-sm text-neutral-400">{meta.subtitle}</p>
                  </div>
                </div>

                {showSetupCta && (
                  <button
                    type="button"
                    onClick={() => setWizardOpen(true)}
                    className="mb-4 flex w-full items-center justify-between gap-4 rounded-2xl border border-gold/40 bg-gradient-to-r from-gold/10 to-transparent p-5 text-left transition hover:border-gold/60"
                  >
                    <div>
                      <p className="text-base font-semibold text-white">Set up your club</p>
                      <p className="mt-1 text-sm text-neutral-300">
                        A guided walkthrough: create → set rake → add a manager → allocate a balance.
                      </p>
                    </div>
                    <span className="shrink-0 rounded-full bg-gradient-to-r from-[#9a7b2c] via-gold to-gold-lite px-5 py-2 text-sm font-bold uppercase tracking-wider text-black">
                      Start →
                    </span>
                  </button>
                )}

                {showTourneyCta && (
                  <button
                    type="button"
                    onClick={() => setTourneyWizardOpen(true)}
                    className="mb-4 flex w-full items-center justify-between gap-4 rounded-2xl border border-gold/40 bg-gradient-to-r from-gold/10 to-transparent p-5 text-left transition hover:border-gold/60"
                  >
                    <div>
                      <p className="text-base font-semibold text-white">Build a tournament</p>
                      <p className="mt-1 text-sm text-neutral-300">
                        Guided setup: basics → blind structure (templates) → payouts with a live 100% check → start.
                      </p>
                    </div>
                    <span className="shrink-0 rounded-full bg-gradient-to-r from-[#9a7b2c] via-gold to-gold-lite px-5 py-2 text-sm font-bold uppercase tracking-wider text-black">
                      Start →
                    </span>
                  </button>
                )}

                {commands.length > 0 && (
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {commands.map((command) => (
                      <CommandCard key={command.id} command={command} busy={busyId !== null} onRun={handleRun} />
                    ))}
                  </div>
                )}
              </section>
            );
          })
        ) : (
          CATEGORY_ORDER.map((category) => {
            const meta = CATEGORY_META[category];
            const commands = commandsByCategory(category).filter(
              (c) =>
                canSeeCommand(c, roles) &&
                canAccessCommand(c, verification) &&
                canRunInClub(c.id, roles, activeClubId),
            );
            if (commands.length === 0) return null;
            return (
              <section key={category} className="mb-12">
                <div className={`mb-5 rounded-2xl border p-5 ${meta.accent}`}>
                  <h2 className="text-xl font-semibold text-white">{meta.label}</h2>
                  <p className="mt-1 text-sm text-neutral-400">{meta.subtitle}</p>
                </div>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {commands.map((command) => (
                    <CommandCard key={command.id} command={command} busy={busyId !== null} onRun={handleRun} />
                  ))}
                </div>
              </section>
            );
          })
        )}

        <section className="rounded-2xl border border-white/10 bg-black/30 p-6">
          <h2 className="text-lg font-semibold text-white">Command Log</h2>
          <p className="mt-1 text-sm text-neutral-400">Responses from live RPCs appear here.</p>
          <div className="mt-4 space-y-3">
            {results.length === 0 && (
              <p className="text-sm text-neutral-400">
                Run <strong className="text-green">Check Backend Health</strong> or{" "}
                <strong className="text-green">View Player Profile</strong> to get started.
              </p>
            )}
            {results.map((result, i) => {
              const cmd = getCommand(result.commandId);
              return (
                <div
                  key={`${result.at}-${i}`}
                  className={`rounded-xl border p-4 ${
                    result.ok
                      ? "border-green/30 bg-green/[0.08]"
                      : "border-brand/30 bg-brand/[0.08]"
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-medium text-white">{cmd?.title ?? result.commandId}</p>
                    <span className="text-[10px] text-neutral-500">{formatWhen(result.at)}</span>
                  </div>
                  <p className="mt-1 text-sm text-neutral-300">{result.message}</p>
                  {result.data !== undefined && (
                    <div className="mt-3">
                      <ResultView commandId={result.commandId} data={result.data} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      </main>

      {activeCommand && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label={`Run command: ${activeCommand.title}`}
          onClick={(e) => {
            if (e.target === e.currentTarget) closeModal();
          }}
        >
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-white/10 bg-surface-2 p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-wider text-gold/80">Run Command</p>
                <h3 className="mt-1 text-xl font-semibold">{activeCommand.title}</h3>
              </div>
              <StatusBadge />
            </div>
            <p className="mt-3 text-sm text-neutral-400">{activeCommand.description}</p>

            {activeSchema ? (
              <>
                <div className="mt-5">
                  <SchemaForm schema={activeSchema} values={formValues} onChange={setFormValues} />
                </div>
                <div className="mt-6 flex flex-wrap gap-3">
                  <button
                    type="button"
                    disabled={busyId !== null || validate(activeSchema, formValues).length > 0}
                    onClick={proceedFromForm}
                    className="rounded-full bg-gradient-to-r from-[#9a7b2c] via-gold to-gold-lite px-6 py-2.5 text-sm font-bold uppercase tracking-wider text-black transition hover:shadow-[0_0_22px_rgba(212,175,55,0.35)] disabled:opacity-50"
                  >
                    {needsConfirm(activeCommand.rpc ?? "") ? "Review & Run" : "Run"}
                  </button>
                  <button
                    type="button"
                    onClick={closeModal}
                    className="rounded-full border border-white/20 px-6 py-2.5 text-sm font-semibold uppercase tracking-wider text-neutral-300 hover:bg-white/5"
                  >
                    Cancel
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="mt-5 text-sm text-neutral-400">This command takes no inputs.</p>
                <div className="mt-5 flex flex-wrap gap-3">
                  <button
                    type="button"
                    disabled={busyId !== null}
                    onClick={executeActive}
                    className="rounded-full bg-gradient-to-r from-[#9a7b2c] via-gold to-gold-lite px-6 py-2.5 text-sm font-bold uppercase tracking-wider text-black transition hover:shadow-[0_0_22px_rgba(212,175,55,0.35)] disabled:opacity-50"
                  >
                    Run
                  </button>
                  <button
                    type="button"
                    onClick={closeModal}
                    className="rounded-full border border-white/20 px-6 py-2.5 text-sm font-semibold uppercase tracking-wider text-neutral-300 hover:bg-white/5"
                  >
                    Close
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {activeCommand && activeSchema && confirmOpen && (() => {
        const desc = describeSubmission(activeCommand.rpc ?? "", activeSchema, formValues, {
          clubName,
          userName,
        });
        const risk = riskOf(activeCommand.rpc ?? "");
        const money = maxMoneyMinor(activeSchema, formValues);
        const needsTyped = money >= TYPED_CONFIRM_THRESHOLD_MINOR;
        const confirmWord = risk === "destructive" ? "DELETE" : "CONFIRM";
        const typedOk = !needsTyped || typedConfirm.trim().toUpperCase() === confirmWord;
        return (
          <div
            className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
            role="alertdialog"
            aria-modal="true"
            aria-label={desc.title}
          >
            <div className="w-full max-w-md rounded-2xl border-2 border-gold/40 bg-surface-2 p-6 shadow-2xl">
              <p className="text-xs uppercase tracking-[0.3em] text-gold/80">
                {risk === "destructive" ? "Destructive action" : risk === "money" ? "Money movement" : "Confirm"}
              </p>
              <h3 className="mt-2 text-lg font-semibold text-white">{desc.title}</h3>
              <p className="mt-3 text-sm leading-relaxed text-neutral-200">{desc.sentence}</p>

              {desc.lines.length > 0 && (
                <dl className="mt-4 space-y-1 rounded-xl border border-white/10 bg-black/40 p-3 text-xs">
                  {desc.lines.map((line) => (
                    <div key={line} className="text-neutral-300">{line}</div>
                  ))}
                </dl>
              )}

              {needsTyped && (
                <div className="mt-4">
                  <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-red-400">
                    Type {confirmWord} to authorize this {money >= TYPED_CONFIRM_THRESHOLD_MINOR ? "large " : ""}action
                  </label>
                  <input
                    autoFocus
                    value={typedConfirm}
                    onChange={(e) => setTypedConfirm(e.target.value)}
                    placeholder={confirmWord}
                    className="w-full rounded-xl border border-brand/40 bg-black/40 px-3 py-2 text-sm text-white outline-none focus:border-brand"
                  />
                </div>
              )}

              <div className="mt-6 flex flex-wrap gap-3">
                <button
                  type="button"
                  disabled={busyId !== null || !typedOk}
                  onClick={executeActive}
                  className="rounded-full bg-gradient-to-r from-[#9a7b2c] via-gold to-gold-lite px-6 py-2.5 text-sm font-bold uppercase tracking-wider text-black transition hover:shadow-[0_0_22px_rgba(212,175,55,0.35)] disabled:opacity-40"
                >
                  Confirm &amp; Run
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmOpen(false)}
                  className="rounded-full border border-white/20 px-6 py-2.5 text-sm font-semibold uppercase tracking-wider text-neutral-300 hover:bg-white/5"
                >
                  Back
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {tourneyWizardOpen && (
        <TournamentBuilderWizard
          onClose={() => setTourneyWizardOpen(false)}
          onComplete={(tid) => {
            setTourneyWizardOpen(false);
            setResults((prev) => [
              {
                ok: true,
                commandId: "tournament_create",
                message: tid ? "Tournament built and started." : "Tournament wizard closed.",
                at: new Date().toISOString(),
              },
              ...prev.slice(0, 9),
            ]);
          }}
        />
      )}

      {wizardOpen && (
        <ClubSetupWizard
          onClose={() => setWizardOpen(false)}
          onComplete={(clubId) => {
            setWizardOpen(false);
            void refreshClubs();
            if (clubId) setResults((prev) => [
              {
                ok: true,
                commandId: "club_create",
                message: "Club setup complete.",
                at: new Date().toISOString(),
              },
              ...prev.slice(0, 9),
            ]);
          }}
        />
      )}
    </div>
  );
}
