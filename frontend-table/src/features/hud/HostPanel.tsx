"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

import { formatCents, useGame } from "@/features/game/GameProvider";
import { GLASS_PANEL, BTN_GOLD, cn } from "@/features/ui/tokens";
// Read-only reuse of the already-built, already-audited live-table admin
// hook — this is the real spec (see plan doc): canAdmin = host OR
// platform_admin OR club_admin_of, Pause/Resume, comprehensive Table
// Settings, Player Management, Waiting List, Financial Summary, Broadcast
// News, all wired to real RPCs. Lives in the frozen features/table3d/ dir
// (built for the older cinematic screen) but the hook itself is pure
// RPC/state logic with no 3D rendering dependency — importing it here adds
// zero edits to that file (verify with `git diff -- table3d/`), avoiding a
// second, drifted copy of ~500 lines of already-correct logic.
import { useTableAdmin, DEFAULT_TABLE_SETTINGS, type TableSettingsValues } from "@/features/table3d/adminSession";
import { useTableOverlays } from "@/features/table3d/overlays/overlaySession";
import { BreakingNewsComposeModal } from "@/features/table3d/overlays";

function ModalShell({
  title,
  onClose,
  children,
  footer,
  wide,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div className="pointer-events-auto fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div
        className={cn(GLASS_PANEL, "relative flex max-h-[85vh] w-full flex-col overflow-hidden border-gold/25", wide ? "max-w-xl" : "max-w-lg")}
        style={{ background: "#262d38" }}
      >
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-3">
          <h2 className="font-display text-sm font-bold uppercase tracking-wider text-gold">{title}</h2>
          <button type="button" onClick={onClose} className="text-neutral-400 hover:text-white" aria-label="Close">
            ✕
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="border-t border-white/10 px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
}

/** A titled group of fields — the visual structure the original
 *  TableSettingsModal used (Blinds Configuration / Wallet & Credit Limits /
 *  Game Rules & Timing) that the flat single-list version was missing. */
function SettingsSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2.5">
      <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-gold/80">{title}</h3>
      <div className={cn(GLASS_PANEL, "space-y-0 divide-y divide-white/[0.06] border-white/[0.06] px-3")} style={{ background: "rgba(0,0,0,0.18)" }}>
        {children}
      </div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2.5">
      <span className="text-sm text-neutral-300">{label}</span>
      {children}
    </div>
  );
}

/** Two fields sharing a row (Small/Big Blind, Buy-in Min/Max, etc). */
function FieldRow({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 gap-4 py-2.5">{children}</div>;
}

function FieldLabel({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] uppercase tracking-wider text-neutral-500">{label}</span>
      {children}
    </label>
  );
}

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={value}
      onClick={() => onChange(!value)}
      className={cn("relative h-5 w-9 flex-shrink-0 rounded-full transition-colors", value ? "bg-gold/70" : "bg-white/15")}
    >
      <span className={cn("absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all", value ? "left-[18px]" : "left-0.5")} />
    </button>
  );
}

function moneyInput(value: number, onChange: (cents: number) => void, width = "w-full") {
  return (
    <span className="flex items-center rounded-lg border border-white/10 bg-black/40 px-2">
      <span className="text-xs text-neutral-500">$</span>
      <input
        type="text"
        inputMode="numeric"
        value={Math.round(value / 100).toLocaleString()}
        onChange={(e) => onChange((Math.round(Number(e.target.value.replace(/[^0-9]/g, "")) || 0)) * 100)}
        className={cn(width, "bg-transparent px-1 py-1.5 text-right text-sm font-semibold text-white outline-none")}
      />
    </span>
  );
}

function numberInput(value: number, onChange: (n: number) => void, min = 0, max?: number) {
  return (
    <input
      type="number"
      min={min}
      max={max}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className="w-full rounded-lg border border-white/10 bg-black/40 px-2 py-1.5 text-right text-sm text-white outline-none"
    />
  );
}

function TableSettingsSection({
  onSave,
  onClose,
}: {
  onSave: (v: TableSettingsValues) => Promise<void>;
  onClose: () => void;
}) {
  const [s, setS] = useState<TableSettingsValues>(DEFAULT_TABLE_SETTINGS);
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof TableSettingsValues>(k: K, v: TableSettingsValues[K]) => setS((prev) => ({ ...prev, [k]: v }));

  const save = async () => {
    setSaving(true);
    try {
      await onSave(s);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalShell
      title="Table Settings"
      onClose={onClose}
      wide
      footer={
        <div className="flex justify-center gap-2">
          <button type="button" disabled={saving} onClick={() => void save()} className={cn(BTN_GOLD, "rounded-lg px-6 py-2 text-xs uppercase tracking-wider disabled:opacity-50")}>
            {saving ? "Saving…" : "Save"}
          </button>
          <button type="button" onClick={onClose} className={cn(GLASS_PANEL, "rounded-lg border-white/15 px-6 py-2 text-xs font-semibold uppercase tracking-wider text-neutral-200")}>
            Cancel
          </button>
        </div>
      }
    >
      <div className="space-y-5">
        <SettingsSection title="Blinds & Ante">
          <FieldRow>
            <FieldLabel label="Small Blind">{moneyInput(s.smallBlindCents, (v) => set("smallBlindCents", v))}</FieldLabel>
            <FieldLabel label="Big Blind">{moneyInput(s.bigBlindCents, (v) => set("bigBlindCents", v))}</FieldLabel>
          </FieldRow>
          <Field label="Ante"><Toggle value={s.anteOn} onChange={(v) => set("anteOn", v)} /></Field>
          {s.anteOn && <Field label="Ante Amount">{moneyInput(s.anteCents, (v) => set("anteCents", v))}</Field>}
        </SettingsSection>

        <SettingsSection title="Buy-in & Wallet">
          <FieldRow>
            <FieldLabel label="Buy-in Min">{moneyInput(s.buyInMinCents, (v) => set("buyInMinCents", v))}</FieldLabel>
            <FieldLabel label="Buy-in Max">{moneyInput(s.buyInMaxCents, (v) => set("buyInMaxCents", v))}</FieldLabel>
          </FieldRow>
          <Field label="Table Privacy"><Toggle value={s.isPrivate} onChange={(v) => set("isPrivate", v)} /></Field>
          <Field label="Wallet Limit">{moneyInput(s.walletLimitCents, (v) => set("walletLimitCents", v))}</Field>
        </SettingsSection>

        <SettingsSection title="Game Rules">
          <Field label="Auto-start next hand"><Toggle value={s.autoStart} onChange={(v) => set("autoStart", v)} /></Field>
          <Field label="Deal to away players"><Toggle value={s.dealToAway} onChange={(v) => set("dealToAway", v)} /></Field>
          <Field label="Reveal all hands"><Toggle value={s.revealAllHands} onChange={(v) => set("revealAllHands", v)} /></Field>
          <Field label="Spectator mode"><Toggle value={s.spectatorMode} onChange={(v) => set("spectatorMode", v)} /></Field>
        </SettingsSection>

        <SettingsSection title="Timing">
          <FieldRow>
            <FieldLabel label="Turn Time (s)">{numberInput(s.turnTimeSecs, (v) => set("turnTimeSecs", v), 15, 60)}</FieldLabel>
            <FieldLabel label="Decision Time (s)">{numberInput(s.decisionSecs, (v) => set("decisionSecs", v), 5)}</FieldLabel>
          </FieldRow>
          <Field label="Time bank (s)">{numberInput(s.timeBankSecs, (v) => set("timeBankSecs", v), 0)}</Field>
        </SettingsSection>
      </div>
    </ModalShell>
  );
}

/** Live table-admin controls, reusing the real `useTableAdmin` hook's
 *  authorization (host OR platform_admin OR club_admin_of — the same
 *  `me_roles`-driven model the Owner Hub already uses) and control surface
 *  (Pause/Resume, comprehensive Table Settings, Player Management, Waiting
 *  List, Financial Summary, Broadcast News). Hidden entirely for anyone
 *  `canAdmin` is false for — matching how the reference `TableAdminOverlay`
 *  already works — rather than a grayed-out preview. */
export function HostPanel() {
  const { snapshot, profile, hostAction } = useGame();
  const demo = useSearchParams().get("demo") === "1";
  const admin = useTableAdmin(demo);
  const overlays = useTableOverlays(demo, admin);

  const [open, setOpen] = useState(false);
  const [sb, setSb] = useState<number>(0);
  const [bb, setBb] = useState<number>(0);
  const [modal, setModal] = useState<"settings" | "summary" | "news" | null>(null);

  useEffect(() => {
    if (admin.canAdmin) void admin.loadWaiting();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [admin.canAdmin, admin.clubId, admin.demo]);

  if (!admin.canAdmin) return null;

  // Real sponsor/delegate distinction — the table's actual host vs. a club
  // admin who administers the sponsoring club but isn't the host. Server-side
  // this now maps exactly to isClubAdminForTable in handler.go: "close" is
  // host-only there too, so this badge/gate isn't a client-only guess.
  const isHost = demo || (!!snapshot?.host_user_id && snapshot.host_user_id === profile.userId);

  const curSb = demo ? 500 : Math.round((snapshot?.small_blind ?? 0) / 100);
  const curBb = demo ? 1000 : Math.round((snapshot?.big_blind ?? 0) / 100);
  const canDeal = (snapshot?.phase ?? "waiting") === "waiting";
  const nextOpenSeat = (): number => {
    const maxSeats = snapshot?.max_seats ?? 6;
    const occupied = new Set((snapshot?.seats ?? []).filter((s) => (s.status ?? "") !== "empty").map((s) => s.index));
    for (let i = 0; i < maxSeats; i++) if (!occupied.has(i)) return i;
    return -1;
  };
  const isActing = (seat: number) => snapshot?.action_seat === seat && !canDeal;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={cn(GLASS_PANEL, "flex items-center gap-2 rounded-full border-gold/40 px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.16em] text-gold")}
      >
        <span className="h-1.5 w-1.5 rounded-full bg-gold" />
        Table Admin
        <span className={cn("rounded-full px-1.5 py-0.5 text-[9px]", isHost ? "bg-gold/20 text-gold" : "bg-cyan/20 text-cyan")}>
          {isHost ? "Sponsor" : "Delegate"}
        </span>
        <span className="opacity-70">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <aside className={cn(GLASS_PANEL, "absolute right-0 top-full z-50 mt-2 flex max-h-[70vh] w-72 flex-col gap-2 overflow-y-auto p-3")}>
          <div className="flex items-center justify-between">
            <p className="text-xs uppercase tracking-[0.25em] text-muted">Host Controls</p>
            {admin.paused && <span className="rounded-full bg-gold/15 px-2 py-0.5 text-[9px] font-bold uppercase text-gold">Paused</span>}
          </div>

          <button
            type="button"
            onClick={() => void admin.pauseResume()}
            className="rounded-lg border border-gold/40 bg-gold/10 px-2 py-1.5 text-xs font-semibold text-gold hover:bg-gold/20"
          >
            {admin.paused ? "▶ Resume dealing" : "❚❚ Pause dealing"}
          </button>

          <div className="flex items-end gap-1.5">
            <label className="flex flex-1 flex-col text-[9px] uppercase tracking-wider text-neutral-500">
              SB $
              <input type="number" min={1} defaultValue={curSb} onChange={(e) => setSb(Number(e.target.value) * 100)}
                className="mt-0.5 w-full rounded border border-white/10 bg-black/40 px-1 py-1 text-xs text-white" />
            </label>
            <label className="flex flex-1 flex-col text-[9px] uppercase tracking-wider text-neutral-500">
              BB $
              <input type="number" min={1} defaultValue={curBb} onChange={(e) => setBb(Number(e.target.value) * 100)}
                className="mt-0.5 w-full rounded border border-white/10 bg-black/40 px-1 py-1 text-xs text-white" />
            </label>
            <button
              type="button"
              onClick={() => void admin.setBlinds(sb || snapshot?.small_blind || 0, bb || snapshot?.big_blind || 0)}
              className="rounded-lg bg-brand px-2 py-1.5 text-xs font-semibold text-white hover:bg-[#ff2d3f]"
            >
              Set
            </button>
          </div>

          <button type="button" onClick={() => setModal("settings")} className="rounded-lg border border-white/10 px-2 py-1.5 text-left text-xs text-neutral-200 hover:border-white/25">
            ⚙ Comprehensive Table Settings
          </button>

          {admin.seated.length > 0 && (
            <div className="flex flex-col gap-1">
              <span className="text-[9px] uppercase tracking-wider text-neutral-500">Player Management</span>
              {admin.seated.map((p) => (
                <div key={p.seat} className="flex items-center justify-between gap-1 rounded-lg border border-white/10 px-2 py-1">
                  <span className="min-w-0 flex-1 truncate text-[11px] text-neutral-200">{p.name}</span>
                  <button
                    type="button"
                    disabled={!isActing(p.seat)}
                    title={isActing(p.seat) ? "Fold this player's hand (on the clock)" : "Only the acting player can be folded"}
                    onClick={() => void admin.forceFold(p.seat)}
                    className="rounded border border-amber-500/40 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-amber-200 hover:bg-amber-950/30 disabled:opacity-30"
                  >
                    Fold
                  </button>
                  <button
                    type="button"
                    disabled={!canDeal || nextOpenSeat() < 0}
                    title="Move to the next open seat (between hands)"
                    onClick={() => { const to = nextOpenSeat(); if (to >= 0) void admin.moveSeat(p.seat, to); }}
                    className="rounded border border-cyan-500/40 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-cyan-200 hover:bg-cyan-950/30 disabled:opacity-30"
                  >
                    Move
                  </button>
                  <button
                    type="button"
                    onClick={() => void admin.kick(p.seat)}
                    className="rounded border border-red-500/40 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-red-200 hover:bg-red-950/30"
                  >
                    Kick
                  </button>
                </div>
              ))}
            </div>
          )}

          {admin.waiting.length > 0 && (
            <div className="flex flex-col gap-1">
              <span className="text-[9px] uppercase tracking-wider text-neutral-500">Waiting List</span>
              {admin.waiting.map((w) => (
                <div key={w.invitationId} className="flex items-center justify-between gap-1 rounded-lg border border-gold/15 px-2 py-1">
                  <span className="min-w-0 flex-1 truncate text-[11px] text-neutral-200">{w.name}</span>
                  <span className="text-[9px] text-gold">{formatCents(w.buyInCents)}</span>
                  <button type="button" onClick={() => void admin.approve(w)} className="rounded border border-gold/40 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-gold hover:bg-gold/10">
                    Approve
                  </button>
                  <button type="button" onClick={() => void admin.decline(w)} className="rounded border border-white/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-neutral-400 hover:bg-white/5">
                    Decline
                  </button>
                </div>
              ))}
            </div>
          )}

          <button type="button" onClick={() => { setModal("summary"); void admin.loadSummary(); }} className="rounded-lg border border-white/10 px-2 py-1.5 text-left text-xs text-neutral-200 hover:border-white/25">
            📊 Financial Summary
          </button>
          <button type="button" onClick={() => setModal("news")} className="rounded-lg border border-white/10 px-2 py-1.5 text-left text-xs text-neutral-200 hover:border-white/25">
            📣 Broadcast News
          </button>

          {isHost && (
            <button
              type="button"
              onClick={() => void hostAction({ action: "close" })}
              className="mt-1 rounded-lg border border-red-500/40 bg-red-950/30 px-2 py-1.5 text-xs font-semibold text-red-200 hover:bg-red-900/40"
            >
              Close table (refund all)
            </button>
          )}
        </aside>
      )}

      {modal === "settings" && <TableSettingsSection onSave={admin.saveSettings} onClose={() => setModal(null)} />}
      {modal === "summary" && (
        <ModalShell title="Financial Summary" onClose={() => setModal(null)}>
          {!admin.summary ? (
            <p className="py-8 text-center text-sm text-neutral-500">Loading…</p>
          ) : (
            <div className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-neutral-400">Total Chips in Play</span>
                <span className="font-semibold text-white">{formatCents(admin.summary.totalChipsCents)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-neutral-400">Total Rake Collected</span>
                <span className="font-semibold text-green">{formatCents(admin.summary.totalRakeCents)}</span>
              </div>
              <div className="border-t border-white/10 pt-2">
                {admin.summary.players.map((p) => (
                  <div key={p.userId} className="flex justify-between py-1 text-[12px]">
                    <span className="truncate text-neutral-300">{p.name}</span>
                    <span className={cn("font-semibold", p.netCents === null ? "text-neutral-500" : p.netCents >= 0 ? "text-green" : "text-[#ff6b70]")}>
                      {p.netCents === null ? "—" : `${p.netCents >= 0 ? "+" : "-"}${formatCents(Math.abs(p.netCents))}`}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </ModalShell>
      )}
      {modal === "news" && <BreakingNewsComposeModal overlays={overlays} onClose={() => setModal(null)} />}
    </div>
  );
}
