"use client";

// In-table club-owner / host chrome for the cinematic full-table screen,
// reproducing the content + density of the HRC full_body_avatar master (Admin
// Control menu, Waiting List, Comprehensive Admin Table Settings, Player
// Management, and the Final Hand History Log / Financial Summary) in the Neon
// Vault theme. Every control binds to a real RPC via useTableAdmin (rule #4);
// offline/guest falls back to clearly-labelled demo data (rule #2).

import { useEffect, useState } from "react";

import { formatCents } from "@/features/game/GameProvider";
import { BTN_GOLD, GLASS_PANEL, HEADING_LG, cn } from "@/features/ui/tokens";
import {
  DEFAULT_TABLE_SETTINGS,
  useTableAdmin,
  type HandRow,
  type TableAdmin,
  type TableSettingsValues,
  type WaitingEntry,
} from "./adminSession";
import {
  GamePausedOverlay,
  ApproveNewPlayerModal,
  ReplayScrubber,
  GlobalDashboardOverlay,
  PlayerGameReportModal,
  PlayerKickBanModal,
  BreakingNewsModal,
  BreakingNewsComposeModal,
  OverlayDevControl,
  useTableOverlays,
  type OverlayDemoState,
  type KickTarget,
} from "./overlays";
import { DEMO_KICK_TARGET } from "./overlays/overlaySession";

/* ------------------------------ primitives ------------------------------ */

function Avatar({ src, ring = "#9aa0a6", size = 44 }: { src: string; ring?: string; size?: number }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        overflow: "hidden",
        flexShrink: 0,
        border: `2px solid ${ring}`,
        boxShadow: `0 0 12px ${ring}66, inset 0 0 8px rgba(0,0,0,0.6)`,
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="" width={size} height={size} style={{ objectFit: "cover", display: "block" }} />
    </div>
  );
}

/** YES / NO (or arbitrary two-way) segmented pill in theme. */
function Seg<T extends string | number | boolean>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: Array<{ v: T; label: string }>;
  onChange: (v: T) => void;
}) {
  return (
    <div className="inline-flex overflow-hidden rounded-lg border border-white/10 bg-black/40">
      {options.map((o) => {
        const on = o.v === value;
        return (
          <button
            key={String(o.v)}
            type="button"
            onClick={() => onChange(o.v)}
            className={cn(
              "px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider transition-colors",
              on ? "bg-gradient-to-r from-[#ffd54a] via-[#f5c518] to-[#d4a80f] text-[#231b00]" : "text-neutral-400 hover:text-white",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function NumField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
}) {
  return (
    <label className="flex flex-col gap-1 text-center">
      <span className="text-[10px] uppercase leading-tight tracking-wider text-neutral-500">{label}</span>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full rounded-lg border border-white/10 bg-black/50 px-2 py-1.5 text-center text-sm font-semibold text-white focus:border-cyan/50 focus:outline-none"
      />
    </label>
  );
}

/** Dollar-denominated input backed by a cents value (Blinds Configuration). */
function MoneyField({
  label,
  value,
  onChange,
  compact,
}: {
  label: string;
  value: number;
  onChange: (cents: number) => void;
  compact?: boolean;
}) {
  return (
    <label className="flex items-center gap-2">
      <span className={cn("text-sm text-neutral-300", compact && "text-[13px]")}>{label}</span>
      <span className="flex items-center rounded-lg border border-white/10 bg-black/50 px-2 focus-within:border-gold/50">
        <span className="text-xs text-neutral-500">$</span>
        <input
          type="text"
          inputMode="numeric"
          value={Math.round(value / 100).toLocaleString()}
          onChange={(e) => onChange(Math.max(0, Math.round(Number(e.target.value.replace(/[^0-9]/g, "")) || 0)) * 100)}
          className={cn("bg-transparent px-1 py-1.5 text-right text-sm font-semibold text-white outline-none", compact ? "w-24" : "w-28")}
        />
      </span>
    </label>
  );
}

/** Labelled range slider (Turn Time Limit). */
function SliderField({
  label,
  value,
  min,
  max,
  step,
  suffix,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  suffix: string;
  onChange: (n: number) => void;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="text-sm text-neutral-300">{label}</span>
        <span className="font-semibold text-gold">
          {value}
          {suffix}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-2 w-full accent-[#f5c518]"
      />
      <div className="flex justify-between text-[10px] text-neutral-500">
        <span>
          {min}
          {suffix}
        </span>
        <span>
          {max}
          {suffix}
        </span>
      </div>
    </div>
  );
}

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
    <div className="pointer-events-auto fixed inset-0 z-40 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div
        className={cn(
          GLASS_PANEL,
          "relative flex max-h-[90vh] w-full flex-col overflow-hidden border-gold/25 shadow-[0_0_60px_rgba(0,0,0,0.7)]",
          wide ? "max-w-5xl" : "max-w-lg",
        )}
        style={{ background: "#262d38" }}
      >
        <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
          <h2 className={cn(HEADING_LG, "text-gold")}>
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 text-neutral-400 hover:border-white/30 hover:text-white"
            aria-label="Close"
          >
            ✕
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">{children}</div>
        {footer && <div className="border-t border-white/10 px-6 py-4">{footer}</div>}
      </div>
    </div>
  );
}

/* --------------------------- Admin Control menu --------------------------- */

function AdminControl({
  admin,
  onSettings,
  onPlayers,
  onSummary,
  onReport,
  onNews,
  onApprove,
  onDashboard,
}: {
  admin: TableAdmin;
  onSettings: () => void;
  onPlayers: () => void;
  onSummary: () => void;
  onReport: () => void;
  onNews: () => void;
  onApprove: () => void;
  onDashboard: () => void;
}) {
  const [open, setOpen] = useState(true);
  const pending = admin.waiting.length;
  return (
    <div className="pointer-events-auto absolute right-4 top-4 z-30 flex w-60 flex-col items-end gap-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(BTN_GOLD, "flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm uppercase tracking-wider")}
      >
        Admin Control <span aria-hidden>⚙</span>
      </button>
      {open && (
        <div className={cn(GLASS_PANEL, "w-full overflow-hidden border-gold/20")}>
          <MenuRow label="Pause Game" glyph={admin.paused ? "▶" : "❚❚"} accent={admin.paused ? "#f5c518" : undefined} onClick={() => void admin.pauseResume()} sub={admin.paused ? "Paused" : undefined} />
          <MenuRow label="Table Settings" glyph="⚙" onClick={onSettings} />
          <MenuRow label="Player Management" glyph="👥" onClick={onPlayers} />
          <MenuRow label="Approve New Players" glyph="✔" onClick={onApprove} sub={pending ? String(pending) : undefined} />
          <MenuRow label="Global Dashboard" glyph="🏛" onClick={onDashboard} />
          <MenuRow label="Session Report" glyph="📊" onClick={onSummary} />
          <MenuRow label="Player Game Report" glyph="🧾" onClick={onReport} />
          <MenuRow label="Broadcast News" glyph="📣" onClick={onNews} />
        </div>
      )}
    </div>
  );
}

function MenuRow({
  label,
  glyph,
  sub,
  accent,
  onClick,
}: {
  label: string;
  glyph: string;
  sub?: string;
  accent?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center justify-between border-b border-white/[0.06] px-4 py-2.5 text-left text-sm text-neutral-200 transition-colors last:border-b-0 hover:bg-white/[0.05]"
    >
      <span className="flex items-center gap-2">
        <span style={{ color: accent ?? "#f5f6f7" }}>{label}</span>
        {sub && <span className="rounded-full bg-gold/15 px-2 py-0.5 text-[9px] font-bold uppercase text-gold">{sub}</span>}
      </span>
      <span aria-hidden style={{ color: accent ?? "#f5c518" }}>{glyph}</span>
    </button>
  );
}

/* ------------------------------ Waiting List ------------------------------ */

function WaitingList({ admin, onSelect }: { admin: TableAdmin; onSelect: (e: WaitingEntry) => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  if (!admin.waiting.length) return null;
  const approve = async (e: WaitingEntry) => {
    setBusy(e.invitationId);
    try {
      await admin.approve(e);
    } finally {
      setBusy(null);
    }
  };
  return (
    <div className="pointer-events-auto absolute right-4 top-28 z-20 flex max-h-[70vh] w-64 flex-col gap-3 overflow-y-auto">
      <div className={cn(HEADING_LG, "text-center text-gold")}>
        Waiting List
      </div>
      <div className="flex flex-col gap-3">
        {admin.waiting.map((e) => (
          <div key={e.invitationId} className={cn(GLASS_PANEL, "border-gold/15 p-3")}>
            {/* The card body opens the full Approve-New-Player card (master 2). */}
            <button type="button" onClick={() => onSelect(e)} className="flex w-full items-center gap-3 text-left">
              <Avatar src={e.avatar} ring="#f5c518" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold text-white">{e.name}</div>
                <div className="truncate text-[11px] text-neutral-400">[{e.handle}]</div>
                <div className="text-[13px] font-bold text-gold">{formatCents(e.buyInCents)}</div>
              </div>
            </button>
            <button
              type="button"
              disabled={busy === e.invitationId}
              onClick={() => void approve(e)}
              className={cn(BTN_GOLD, "mt-2 w-full rounded-lg py-1.5 text-xs uppercase tracking-wider disabled:opacity-50")}
            >
              {busy === e.invitationId ? "Approving…" : "Approve"}
            </button>
            {e.walletCents > 0 && (
              <div className="mt-2 text-center text-[11px] text-neutral-400">
                Wallet Balance: <span className="font-semibold text-green">{formatCents(e.walletCents)}</span>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/* --------------------- Comprehensive Table Settings ---------------------- */

function TableSettingsModal({ admin, onClose }: { admin: TableAdmin; onClose: () => void }) {
  const [s, setS] = useState<TableSettingsValues>(DEFAULT_TABLE_SETTINGS);
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof TableSettingsValues>(k: K, v: TableSettingsValues[K]) => setS((prev) => ({ ...prev, [k]: v }));
  const yn = [
    { v: true, label: "Yes" },
    { v: false, label: "No" },
  ];

  const save = async () => {
    setSaving(true);
    try {
      await admin.saveSettings(s);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalShell
      title="Table Settings"
      onClose={onClose}
      footer={
        <div className="flex items-center justify-center gap-3">
          <button type="button" onClick={() => void save()} disabled={saving} className={cn(BTN_GOLD, "rounded-xl px-8 py-2.5 text-sm uppercase tracking-wider disabled:opacity-50")}>
            {saving ? "Saving…" : "Save & Resume"}
          </button>
          <button type="button" onClick={onClose} className={cn(GLASS_PANEL, "rounded-xl border-white/15 px-8 py-2.5 text-sm font-semibold uppercase tracking-wider text-neutral-200 hover:border-white/30")}>
            Cancel
          </button>
        </div>
      }
    >
      <div className="space-y-6 px-6 py-5">
        {/* Blinds Configuration — the primary panel from the HRC master. */}
        <section className="space-y-4">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-foreground">Blinds Configuration</h3>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <MoneyField label="Small Blind" value={s.smallBlindCents} onChange={(v) => set("smallBlindCents", v)} />
            <MoneyField label="Big Blind" value={s.bigBlindCents} onChange={(v) => set("bigBlindCents", v)} />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <Row label="Ante">
              <Seg value={s.anteOn} onChange={(v) => set("anteOn", v)} options={[{ v: true, label: "On" }, { v: false, label: "Off" }]} />
            </Row>
            {s.anteOn && <MoneyField label="Amount" value={s.anteCents} onChange={(v) => set("anteCents", v)} compact />}
          </div>
          <SliderField
            label="Turn Time Limit"
            value={s.turnTimeSecs}
            min={15}
            max={60}
            step={5}
            suffix="s"
            onChange={(v) => set("turnTimeSecs", v)}
          />
          <div className="flex flex-wrap items-center justify-between gap-4">
            <span className="text-sm text-neutral-300">Buy-in Range</span>
            <div className="flex items-center gap-3">
              <MoneyField label="Min" value={s.buyInMinCents} onChange={(v) => set("buyInMinCents", v)} compact />
              <MoneyField label="Max" value={s.buyInMaxCents} onChange={(v) => set("buyInMaxCents", v)} compact />
            </div>
          </div>
          <Row label="Table Privacy">
            <Seg
              value={s.isPrivate}
              onChange={(v) => set("isPrivate", v)}
              options={[{ v: false, label: "Public" }, { v: true, label: "Private" }]}
            />
          </Row>
        </section>

        <section className="space-y-3">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-foreground">Wallet &amp; Credit Limits</h3>
          <div className="flex items-center justify-between gap-4">
            <span className="text-sm text-neutral-300">Universal Player Wallet Limit</span>
            <input
              type="text"
              value={formatCents(s.walletLimitCents)}
              onChange={(e) => set("walletLimitCents", Math.round(Number(e.target.value.replace(/[^0-9.]/g, "")) * 100) || 0)}
              className="w-44 rounded-lg border border-white/10 bg-black/50 px-3 py-1.5 text-right text-sm font-semibold text-gold focus:border-gold/50 focus:outline-none"
            />
          </div>
          <div className="flex items-center justify-between gap-4">
            <span className="text-sm text-neutral-300">Auto Buy-Back</span>
            <Seg value={s.autoBuyBackPrivate} onChange={(v) => set("autoBuyBackPrivate", v)} options={[{ v: false, label: "Public" }, { v: true, label: "Private" }]} />
          </div>
          <p className="text-[11px] text-neutral-500">Players can top up from their connected wallets up to the Credit Limit.</p>
        </section>

        <section className="space-y-3">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-foreground">Game Rules &amp; Timing</h3>
          <Row label="Auto start the next hand?">
            <Seg value={s.autoStart} onChange={(v) => set("autoStart", v)} options={yn} />
          </Row>
          <Row label="Showdown Presentation Time">
            <Seg
              value={s.showdownSecs}
              onChange={(v) => set("showdownSecs", v)}
              options={[{ v: 3, label: "Fast (3s)" }, { v: 6, label: "Normal (6s)" }, { v: 9, label: "Slow (9s)" }]}
            />
          </Row>
          <Row label="Deal hands to away players?">
            <Seg value={s.dealToAway} onChange={(v) => set("dealToAway", v)} options={yn} />
          </Row>
          <div className="grid grid-cols-3 gap-3">
            <NumField label="Decision Time Limit (s)" value={s.decisionSecs} onChange={(v) => set("decisionSecs", v)} />
            <NumField label="Time Bank Length (s)" value={s.timeBankSecs} onChange={(v) => set("timeBankSecs", v)} />
            <NumField label="Hands to fill time bank" value={s.handsToFillTimeBank} onChange={(v) => set("handsToFillTimeBank", v)} />
          </div>
          <Row label="Reveal all hands when no more action is possible?">
            <Seg value={s.revealAllHands} onChange={(v) => set("revealAllHands", v)} options={yn} />
          </Row>
          <Row label="Spectator Mode">
            <Seg value={s.spectatorMode} onChange={(v) => set("spectatorMode", v)} options={yn} />
          </Row>
        </section>
      </div>
    </ModalShell>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-sm text-neutral-300">{label}</span>
      {children}
    </div>
  );
}

/* --------------------------- Player Management --------------------------- */

function PlayerManagementModal({
  admin,
  onClose,
  onKickBan,
}: {
  admin: TableAdmin;
  onClose: () => void;
  onKickBan: (target: KickTarget) => void;
}) {
  return (
    <ModalShell title="Player Management" onClose={onClose}>
      <div className="space-y-2 px-6 py-5">
        {admin.seated.length === 0 ? (
          <p className="py-6 text-center text-sm text-neutral-500">No other players seated.</p>
        ) : (
          admin.seated.map((p) => (
            <div key={p.seat} className={cn(GLASS_PANEL, "flex items-center gap-3 border-white/10 p-3")}>
              <Avatar src={p.avatar} size={40} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold text-white">{p.name}</div>
                <div className="text-[11px] text-neutral-400">
                  Seat {p.seat + 1} · <span className="text-gold">{formatCents(p.stackCents)}</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => void admin.kick(p.seat)}
                className="rounded-lg border border-red-500/40 bg-red-950/30 px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-red-200 hover:bg-red-900/40"
              >
                Remove
              </button>
              <button
                type="button"
                onClick={() =>
                  onKickBan({
                    userId: p.userId,
                    name: p.name,
                    handle: p.name.toLowerCase(),
                    avatar: p.avatar,
                    seat: p.seat,
                  })
                }
                className="rounded-lg border border-red-500/40 bg-red-950/30 px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-red-200 hover:bg-red-900/40"
              >
                Kick / Ban
              </button>
            </div>
          ))
        )}
        <p className="pt-2 text-[11px] text-neutral-500">Removing a player stands them up and refunds their remaining stack.</p>
      </div>
    </ModalShell>
  );
}

/* -------------------- Financial Summary / Hand History -------------------- */

function FinancialSummaryModal({
  admin,
  onClose,
  onScrub,
}: {
  admin: TableAdmin;
  onClose: () => void;
  onScrub: (hand: HandRow) => void;
}) {
  const [replaying, setReplaying] = useState<string | null>(null);
  useEffect(() => {
    void admin.loadSummary();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const sum = admin.summary;

  const replay = async (handId: string) => {
    setReplaying(handId);
    try {
      const row = await admin.replayHand(handId);
      if (row) {
        onScrub(row);
        onClose();
      }
    } finally {
      setReplaying(null);
    }
  };

  return (
    <ModalShell
      title="Final Hand History Log"
      onClose={onClose}
      wide
      footer={
        <div className="flex justify-center">
          <button
            type="button"
            disabled={!sum?.hands.length || !!replaying}
            onClick={() => sum?.hands[0] && void replay(sum.hands[0].handId)}
            className={cn(GLASS_PANEL, "rounded-xl border-gold/30 px-10 py-2.5 text-sm font-semibold uppercase tracking-wider text-gold hover:border-gold/60 disabled:opacity-40")}
          >
            Replay
          </button>
        </div>
      }
    >
      {!sum ? (
        <div className="px-6 py-16 text-center text-sm text-neutral-500">Loading session ledger…</div>
      ) : (
        <div className="grid gap-5 px-6 py-5 md:grid-cols-[300px_1fr]">
          {/* Financial Summary */}
          <div className={cn(GLASS_PANEL, "flex flex-col border-white/10 p-4")}>
            <h3 className="text-center text-sm font-semibold uppercase tracking-wider text-gold">Financial Summary</h3>
            <div className="mt-3 space-y-2 text-center">
              <div>
                <div className="text-[11px] uppercase tracking-wider text-neutral-500">Total Chips in Play</div>
                <div className="text-lg font-bold text-white">{formatCents(sum.totalChipsCents)}</div>
              </div>
              <div>
                <div className="text-[11px] uppercase tracking-wider text-neutral-500">Total Rake Collected</div>
                <div className="text-lg font-bold text-green">{formatCents(sum.totalRakeCents)}</div>
              </div>
            </div>
            <div className="mt-4 flex items-center justify-between border-b border-white/10 pb-1 text-[11px] uppercase tracking-wider text-neutral-500">
              <span>Player</span>
              <span>Net Gains/Losses</span>
            </div>
            <div className="mt-2 space-y-2">
              {sum.players.map((p) => (
                <div key={p.userId} className="flex items-center gap-2">
                  <Avatar src={p.avatar} size={32} ring="#3a4250" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[12px] font-semibold text-white">{p.name}</div>
                    <div className="truncate text-[10px] text-neutral-500">[{p.handle}]</div>
                  </div>
                  <div className={cn("text-sm font-bold", p.netCents === null ? "text-neutral-500" : p.netCents >= 0 ? "text-green" : "text-[#ff6b70]")}>
                    {p.netCents === null ? "—" : `${p.netCents >= 0 ? "+" : "-"}${formatCents(Math.abs(p.netCents))}`}
                  </div>
                </div>
              ))}
            </div>
            {sum.live && (
              <p className="mt-3 text-[10px] leading-tight text-neutral-600">Opponent net figures are not exposed to this client; only your own realised net is shown.</p>
            )}
          </div>

          {/* Per-hand log */}
          <div className="flex flex-col gap-3">
            {sum.hands.length === 0 ? (
              <p className="py-10 text-center text-sm text-neutral-500">No hands recorded this session yet.</p>
            ) : (
              sum.hands.map((h, i) => (
                <div key={h.handId || i} className={cn(GLASS_PANEL, i === 0 ? "border-gold/40" : "border-white/10", "p-3")}>
                  <div className="flex items-center justify-between border-b border-white/10 pb-2 text-[12px]">
                    <span className="text-neutral-400">Hand ID: <span className="font-mono text-neutral-300">{h.handId || h.handNo}</span></span>
                    <span className="text-neutral-400">Total Pot Size: <span className="font-bold text-gold">{formatCents(h.potCents)}</span></span>
                  </div>
                  <div className="mt-2 flex items-center gap-3">
                    <Avatar src={h.winnerAvatar} size={40} ring="#f5c518" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold text-white">{h.winnerName}</div>
                      <div className="truncate text-[11px] text-neutral-400">
                        Winning Hand{h.winningHand ? ` · ${h.winningHand}` : ""}
                      </div>
                    </div>
                    <button
                      type="button"
                      disabled={replaying === h.handId}
                      onClick={() => void replay(h.handId)}
                      className={cn(GLASS_PANEL, "rounded-lg border-gold/30 px-4 py-1.5 text-xs font-semibold uppercase tracking-wider text-gold hover:border-gold/60 disabled:opacity-50")}
                    >
                      {replaying === h.handId ? "…" : "Replay"}
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </ModalShell>
  );
}

/* -------------------------------- root ---------------------------------- */

type ModalKind =
  | "settings"
  | "players"
  | "summary"
  | "report"
  | "kickban"
  | "news"
  | "approve"
  | "dashboard"
  | null;

export function TableAdminOverlay({ demo }: { demo: boolean }) {
  const admin = useTableAdmin(demo);
  const overlays = useTableOverlays(demo, admin);
  const [modal, setModal] = useState<ModalKind>(null);
  const [kickTarget, setKickTarget] = useState<KickTarget | null>(null);
  const [approveEntry, setApproveEntry] = useState<WaitingEntry | null>(null);
  const [replayHand, setReplayHand] = useState<HandRow | null>(null);

  const openApprove = (entry: WaitingEntry) => {
    setApproveEntry(entry);
    setModal("approve");
  };

  useEffect(() => {
    if (admin.canAdmin) void admin.loadWaiting();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [admin.canAdmin, admin.clubId, admin.demo]);

  // Seated players receive breaking-news broadcasts even without admin rights.
  useEffect(() => {
    void overlays.loadNews();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openKickBan = (target: KickTarget) => {
    setKickTarget(target);
    setModal("kickban");
  };

  // Dev-control (demo) → open any of the overlay states.
  const openDemo = (state: OverlayDemoState) => {
    if (state === "paused") overlays.setDemoPaused(true);
    else if (state === "news") overlays.showDemoNews();
    else if (state === "kickban") openKickBan(DEMO_KICK_TARGET);
    else if (state === "approve") {
      if (admin.waiting[0]) openApprove(admin.waiting[0]);
    } else setModal(state); // "summary" | "settings" | "report" | "dashboard"
  };

  return (
    <>
      {/* Player-facing states — shown to every seated player, admin or not. */}
      {overlays.showPaused && (
        <GamePausedOverlay
          canResume={overlays.canResume}
          onResume={() => void overlays.resume()}
          onQuit={() => void overlays.quit()}
        />
      )}
      {overlays.activeNews && (
        <BreakingNewsModal news={overlays.activeNews} onDismiss={overlays.dismissNews} />
      )}
      {modal === "report" && (
        <PlayerGameReportModal overlays={overlays} onClose={() => setModal(null)} />
      )}
      {modal === "kickban" && kickTarget && (
        <PlayerKickBanModal overlays={overlays} target={kickTarget} onClose={() => setModal(null)} />
      )}

      {/* Admin chrome — host / platform / club admin only. */}
      {admin.canAdmin && (
        <>
          <AdminControl
            admin={admin}
            onSettings={() => setModal("settings")}
            onPlayers={() => setModal("players")}
            onSummary={() => setModal("summary")}
            onReport={() => setModal("report")}
            onNews={() => setModal("news")}
            onApprove={() => (admin.waiting[0] ? openApprove(admin.waiting[0]) : setModal("players"))}
            onDashboard={() => setModal("dashboard")}
          />
          <WaitingList admin={admin} onSelect={openApprove} />
          {demo && <OverlayDevControl onOpen={openDemo} />}
          {modal === "approve" && approveEntry && (
            <ApproveNewPlayerModal
              entry={approveEntry}
              onApprove={admin.approve}
              onDecline={admin.decline}
              onClose={() => {
                setModal(null);
                setApproveEntry(null);
              }}
            />
          )}
          {modal === "settings" && <TableSettingsModal admin={admin} onClose={() => setModal(null)} />}
          {modal === "players" && (
            <PlayerManagementModal admin={admin} onClose={() => setModal(null)} onKickBan={openKickBan} />
          )}
          {modal === "summary" && (
            <FinancialSummaryModal admin={admin} onClose={() => setModal(null)} onScrub={setReplayHand} />
          )}
          {modal === "dashboard" && (
            <GlobalDashboardOverlay demo={demo} onClose={() => setModal(null)} />
          )}
          {modal === "news" && (
            <BreakingNewsComposeModal overlays={overlays} onClose={() => setModal(null)} />
          )}
          {replayHand && (
            <ReplayScrubber
              hand={replayHand}
              onSkipEnd={async () => {
                await admin.replayHand(replayHand.handId);
              }}
              onClose={() => setReplayHand(null)}
            />
          )}
        </>
      )}
    </>
  );
}
