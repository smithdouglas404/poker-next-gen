"use client";

import { useState } from "react";
import Link from "next/link";

import { Button, Select } from "@/features/ui";
import { GLASS_PANEL, cn } from "@/features/ui/tokens";

import { PermissionGrid } from "./PermissionGrid";
import { SectionTitle } from "./ui";
import type { ClubSettingsBlob, OwnerClubExt, RakeConfig } from "./types";

// IANA zone ids only. The old list opened with the string "UTC, GMT", which is
// not a zone and cannot be resolved — the server now validates against the IANA
// database and rejects anything it cannot load, because a club night firing an
// hour off is worse than a rejected save.
const TIMEZONES = [
  "UTC",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Sao_Paulo",
  "Europe/London",
  "Europe/Berlin",
  "Europe/Moscow",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Asia/Shanghai",
  "Asia/Tokyo",
  "Australia/Sydney",
];

// A single locale, not the old "English, Spanish" / "Multi-language" combos.
// This labels the club in the public browser; it does not translate anything.
const LANGUAGES: { code: string; label: string }[] = [
  { code: "en", label: "English" },
  { code: "es", label: "Spanish" },
  { code: "pt", label: "Portuguese" },
  { code: "zh", label: "Chinese" },
  { code: "ja", label: "Japanese" },
  { code: "ko", label: "Korean" },
  { code: "de", label: "German" },
  { code: "fr", label: "French" },
  { code: "ru", label: "Russian" },
];

const GEO_OPTIONS = ["None", "Block US", "Block EU", "Allowlist only"];

/** Comprehensive Global Club Settings (master: detailed_private_table_setup_9).
 * Rake percentage/caps persist through rake_config_set; every other panel
 * (preferences, security, branding, visibility, geo/KYC) persists through
 * club_update's settings_json + visibility flags. */
export function GlobalSettings({
  club,
  rake,
  demo,
  canManage,
  isOwner,
  notify,
  onSaveRake,
  onSaveSettings,
}: {
  club: OwnerClubExt | null;
  rake: RakeConfig | null;
  demo: boolean;
  canManage: boolean;
  /** Only a club OWNER may hand out authority (server-enforced too). */
  isOwner: boolean;
  notify: (msg: string, kind?: "ok" | "err") => void;
  onSaveRake: (cfg: RakeConfig) => Promise<void>;
  onSaveSettings: (
    patch: {
      is_public?: boolean;
      require_approval?: boolean;
      avatar_ref?: string;
      // Real columns — the server validates the zone and refuses to require 2FA
      // of a club whose owner does not have it.
      timezone?: string;
      primary_language?: string;
      twofa_required?: boolean;
    },
    settings: ClubSettingsBlob,
  ) => Promise<void>;
}) {
  const s0 = club?.settings_json ?? {};

  // Real columns on the club, not settings_json keys — the server interprets both.
  const [timezone, setTimezone] = useState(club?.timezone ?? "UTC");
  const [language, setLanguage] = useState(club?.primary_language ?? "en");

  const [rakePct, setRakePct] = useState(((rake?.percent_bps ?? 500) / 100).toString());
  const [maxBuyin, setMaxBuyin] = useState(
    s0.max_buyin_cents ? String(s0.max_buyin_cents / 100) : "",
  );
  // Reconciliation window: hours after a guest sits before their club-wallet grant
  // must be reconciled. "" / 0 => no deadline (reconcile at will).
  const [reconcileWindow, setReconcileWindow] = useState(
    s0.reconcile_window_hours ? String(s0.reconcile_window_hours) : "",
  );
  // Full rake config (CustomRakeConfiguration) — previously only percent was editable.
  const [rakeCap, setRakeCap] = useState(rake?.cap_minor ? String(rake.cap_minor / 100) : "");
  const [minPot, setMinPot] = useState(rake?.min_pot_minor ? String(rake.min_pot_minor / 100) : "");
  const [noFlopNoDrop, setNoFlopNoDrop] = useState(rake?.no_flop_no_drop ?? true);
  const [rakePublic, setRakePublic] = useState(rake?.public ?? false);

  const [twofa, setTwofa] = useState(club?.twofa_required ?? false);

  const [uiTheme, setUiTheme] = useState<"classic" | "cyber">(s0.ui_theme ?? "classic");
  const [logoDataUrl, setLogoDataUrl] = useState<string | null>(s0.logo_data_url ?? null);
  const [isPublic, setIsPublic] = useState(club?.is_public ?? false);
  const [requireApproval, setRequireApproval] = useState(club?.require_approval ?? true);
  const [kyc, setKyc] = useState(s0.kyc_required ?? false);
  const [geo, setGeo] = useState(s0.geo_block ?? "None");

  const [busy, setBusy] = useState<string | null>(null);

  const run = (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    void (async () => {
      try {
        await fn();
      } finally {
        setBusy(null);
      }
    })();
  };

  const mergedSettings = (): ClubSettingsBlob => ({
    ...s0,
    ui_theme: uiTheme,
    max_buyin_cents: maxBuyin ? Math.round(Number(maxBuyin) * 100) : undefined,
    reconcile_window_hours: reconcileWindow ? Math.max(0, Math.round(Number(reconcileWindow))) : undefined,
    kyc_required: kyc,
    geo_block: geo,
    logo_data_url: logoDataUrl ?? undefined,
  });

  // Read a picked image file into a data: URL for the club logo (≤2 MB, images).
  const onPickLogo = (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/") || file.size > 2 * 1024 * 1024) return;
    const reader = new FileReader();
    reader.onload = () => setLogoDataUrl(typeof reader.result === "string" ? reader.result : null);
    reader.readAsDataURL(file);
  };

  const savePreferences = () =>
    run("prefs", () =>
      onSaveSettings({ timezone, primary_language: language }, mergedSettings()),
    );

  const saveFinancials = () =>
    run("fin", async () => {
      await onSaveRake({
        club_id: club?.id ?? "",
        name: rake?.name ?? "Standard",
        percent_bps: Math.round(Math.max(0, Math.min(10, Number(rakePct) || 0)) * 100),
        cap_minor: Math.max(0, Math.round(Number(rakeCap) || 0) * 100),
        no_flop_no_drop: noFlopNoDrop,
        min_pot_minor: Math.max(0, Math.round(Number(minPot) || 0) * 100),
        public: rakePublic,
      });
      await onSaveSettings({}, mergedSettings());
    });

  const saveSecurity = () =>
    run("sec", () => onSaveSettings({ twofa_required: twofa }, mergedSettings()));

  const saveBranding = () =>
    run("brand", () => onSaveSettings({ avatar_ref: "custom" }, mergedSettings()));

  const disabled = !canManage;

  return (
    <div className="space-y-6">
      <SectionTitle eyebrow="Configuration" title="Comprehensive Global Club Settings" />

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Club Preferences */}
        <Card title="Club Preferences">
          <Labeled label="Timezone">
            <Select value={timezone} onChange={(e) => setTimezone(e.target.value)} disabled={disabled}>
              {TIMEZONES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </Select>
            <p className="mt-1 text-[10px] leading-snug text-white/35">
              Club-night schedules fire in this zone.
            </p>
          </Labeled>
          <Labeled label="Primary Language">
            <Select value={language} onChange={(e) => setLanguage(e.target.value)} disabled={disabled}>
              {LANGUAGES.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.label}
                </option>
              ))}
            </Select>
            <p className="mt-1 text-[10px] leading-snug text-white/35">
              Shown on your club&apos;s public listing so players know what to expect at the table.
              It does not translate the interface.
            </p>
          </Labeled>
          <GoldButton busy={busy === "prefs"} disabled={disabled} onClick={savePreferences}>
            Save Preferences
          </GoldButton>
        </Card>

        {/* Financial Defaults */}
        <Card title="Financial Defaults">
          <Labeled label="Rake Percentage">
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={0}
                max={10}
                step={0.1}
                value={rakePct}
                onChange={(e) => setRakePct(e.target.value)}
                disabled={disabled}
                className="flex-1 accent-[#f5c518]"
              />
              <div className="flex items-center gap-1 rounded-lg border border-white/12 bg-black/40 px-2 py-1.5">
                <input
                  type="number"
                  min={0}
                  max={10}
                  step={0.1}
                  value={rakePct}
                  onChange={(e) => setRakePct(e.target.value)}
                  disabled={disabled}
                  className="w-12 bg-transparent text-right text-sm text-white outline-none"
                />
                <span className="text-white/40">%</span>
              </div>
            </div>
            <p className="mt-1 text-[10px] text-white/35">Capped at 10% (rake_config_set enforces 0–1000 bps).</p>
          </Labeled>
          <Labeled label="Max Buy-in Cap">
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gold">$</span>
              <input
                type="number"
                min={0}
                value={maxBuyin}
                onChange={(e) => setMaxBuyin(e.target.value)}
                disabled={disabled}
                placeholder="No cap"
                className="w-full rounded-lg border border-white/12 bg-black/40 py-2 pl-7 pr-3 text-sm text-white outline-none focus:border-gold/40 disabled:opacity-50"
              />
            </div>
          </Labeled>
          <Labeled label="Reconciliation Window (hours)">
            <input
              type="number"
              min={0}
              value={reconcileWindow}
              onChange={(e) => setReconcileWindow(e.target.value)}
              disabled={disabled}
              placeholder="No deadline"
              className="w-full rounded-lg border border-white/12 bg-black/40 py-2 px-3 text-sm text-white outline-none focus:border-gold/40 disabled:opacity-50"
            />
            <p className="mt-1 text-[11px] text-white/45">
              How long after a guest sits before their club-wallet grant must be reconciled. Guest
              Reconciliation shows a due date and flags overdue sessions. 0 / blank = no deadline.
            </p>
          </Labeled>
          <Labeled label="Rake Cap (max per pot)">
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gold">$</span>
              <input
                type="number"
                min={0}
                step={0.01}
                value={rakeCap}
                onChange={(e) => setRakeCap(e.target.value)}
                disabled={disabled}
                placeholder="No cap"
                className="w-full rounded-lg border border-white/12 bg-black/40 py-2 pl-7 pr-3 text-sm text-white outline-none focus:border-gold/40 disabled:opacity-50"
              />
            </div>
          </Labeled>
          <Labeled label="Minimum Pot (no rake below)">
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gold">$</span>
              <input
                type="number"
                min={0}
                step={0.01}
                value={minPot}
                onChange={(e) => setMinPot(e.target.value)}
                disabled={disabled}
                placeholder="0.00"
                className="w-full rounded-lg border border-white/12 bg-black/40 py-2 pl-7 pr-3 text-sm text-white outline-none focus:border-gold/40 disabled:opacity-50"
              />
            </div>
          </Labeled>
          <ToggleRow
            label="No Flop, No Drop"
            hint="Skip the rake on hands that end before the flop."
            on={noFlopNoDrop}
            onToggle={() => setNoFlopNoDrop((v) => !v)}
            disabled={disabled}
          />
          <ToggleRow
            label="Publicly Visible"
            hint="Let anyone read this rake rule (transparency signal)."
            on={rakePublic}
            onToggle={() => setRakePublic((v) => !v)}
            disabled={disabled}
          />
          <GoldButton busy={busy === "fin"} disabled={disabled} onClick={saveFinancials}>
            Save Financials
          </GoldButton>
        </Card>

        {/* Security */}
        <Card title="Security">
          <div>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-white/45">
              Require 2FA for operators
            </p>
            <div className="flex items-center gap-3">
              <Toggle on={twofa} onToggle={() => setTwofa((v) => !v)} disabled={disabled} />
              <span className={cn("text-sm", twofa ? "text-green" : "text-white/50")}>
                {twofa ? "Required" : "Not required"}
              </span>
            </div>
            <p className="mt-2 text-[10px] leading-snug text-white/35">
              While on, anyone without two-factor authentication on their account is refused every
              operator action at this club — allocating chips, kicking, changing settings. Turn it
              on only once your own 2FA is set up; the server refuses otherwise so you cannot lock
              yourself out.
            </p>
          </div>
          <GoldButton busy={busy === "sec"} disabled={disabled} onClick={saveSecurity}>
            Save Security
          </GoldButton>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Club Branding + Visibility + Geo/KYC */}
        <Card title="Club Branding & Access">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
            <label
              className={cn(
                "flex h-24 w-40 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-xl border border-dashed border-white/20 bg-white/[0.02] text-center text-xs font-semibold uppercase tracking-wider text-white/50 transition hover:border-gold/40 hover:text-gold",
                disabled && "pointer-events-none opacity-50",
              )}
            >
              {logoDataUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logoDataUrl} alt="Club logo" className="h-full w-full object-contain" />
              ) : (
                "Upload Logo"
              )}
              <input
                type="file"
                accept="image/*"
                disabled={disabled}
                onChange={(e) => onPickLogo(e.target.files?.[0])}
                className="hidden"
              />
            </label>
            <div className="flex-1">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-white/45">
                Primary UI Theme
              </p>
              <div className="flex gap-4">
                {(["classic", "cyber"] as const).map((t) => (
                  <label key={t} className="flex cursor-pointer items-center gap-2 text-sm">
                    <span
                      className={cn(
                        "flex h-4 w-4 items-center justify-center rounded-full border",
                        uiTheme === t ? "border-gold" : "border-white/30",
                      )}
                    >
                      {uiTheme === t && <span className="h-2 w-2 rounded-full bg-gold" />}
                    </span>
                    <input
                      type="radio"
                      className="sr-only"
                      checked={uiTheme === t}
                      onChange={() => setUiTheme(t)}
                      disabled={disabled}
                    />
                    <span className={cn("capitalize", uiTheme === t ? "text-white" : "text-white/55")}>{t}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-2 border-t border-white/[0.06] pt-4">
            <ToggleRow
              label="Public club"
              hint="Discoverable in the club browser."
              on={isPublic}
              onToggle={() => setIsPublic((v) => !v)}
              disabled={disabled}
            />
            <ToggleRow
              label="Admin approval required"
              hint="New members wait for owner approval."
              on={requireApproval}
              onToggle={() => setRequireApproval((v) => !v)}
              disabled={disabled}
            />
            <ToggleRow
              label="KYC verification gate"
              hint="Members must complete identity verification to play."
              on={kyc}
              onToggle={() => setKyc((v) => !v)}
              disabled={disabled}
            />
            <Labeled label="Geo Restriction">
              <Select value={geo} onChange={(e) => setGeo(e.target.value)} disabled={disabled}>
                {GEO_OPTIONS.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </Select>
            </Labeled>
          </div>

          <GoldButton busy={busy === "brand"} disabled={disabled} onClick={saveBranding}>
            Save Branding &amp; Access
          </GoldButton>
        </Card>

        {/* Integration & API */}
        <Card title="Integration & API">
          {/* This card used to promise "Connect External Wallets & Data Services"
              behind a Connect button that only navigated to /wallet. There are no
              per-club API keys (poker_api_key is per-user and nothing
              authenticates with it) and no outbound webhooks, so the promise had
              nothing behind it. It now reports what is genuinely wired instead of
              offering a connection it cannot make. */}
          <p className="text-[11px] leading-snug text-white/45">
            Payments, identity and payouts are configured for the whole network, not per club. Your
            club inherits whatever is live.
          </p>
          <div className="rounded-xl border border-white/10 bg-black/20 p-4">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-white/40">
              Your payout wallets
            </p>
            <p className="text-[11px] leading-snug text-white/45">
              Crypto payout addresses are linked to your personal account with a signed message, so
              only you can add or remove them.
            </p>
            <div className="mt-3">
              <Link href="/wallet">
                <Button variant="outline" size="sm">
                  Manage linked wallets
                </Button>
              </Link>
            </div>
          </div>
          {demo && (
            <p className="text-[11px] text-white/40">Demo mode — settings changes are local only.</p>
          )}
          {!canManage && (
            <p className="text-[11px] text-amber-300/80">
              Only club owners/admins can change global settings.
            </p>
          )}
        </Card>
      </div>

      {/* Operator permissions — one row per real seat, one column per real
          capability. Replaces two dropdowns of role names that had no person
          attached and granted nothing. */}
      <Card title="Operator Permissions">
        <PermissionGrid
          clubId={club?.id ?? null}
          canManage={canManage}
          isOwner={isOwner}
          demo={demo}
          notify={notify}
        />
      </Card>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className={cn(GLASS_PANEL, "flex flex-col gap-4 p-5")}>
      <p className="font-display text-lg font-semibold text-white">{title}</p>
      {children}
    </div>
  );
}

function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-white/45">
        {label}
      </span>
      {children}
    </label>
  );
}

function GoldButton({
  children,
  busy,
  disabled,
  onClick,
}: {
  children: React.ReactNode;
  busy: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || busy}
      className={cn(
        "mt-auto rounded-lg py-2.5 font-display text-sm font-bold uppercase tracking-wider text-black transition",
        "bg-gradient-to-r from-[#9a7b2c] via-[#f5c518] to-[#f3e2ad] hover:shadow-[0_0_20px_rgba(245,197,24,0.3)]",
        (disabled || busy) && "opacity-40",
      )}
    >
      {busy ? "Saving…" : children}
    </button>
  );
}

function Toggle({ on, onToggle, disabled }: { on: boolean; onToggle: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={onToggle}
      disabled={disabled}
      className={cn(
        "relative h-7 w-12 shrink-0 rounded-full border transition disabled:opacity-50",
        on ? "border-transparent bg-gold shadow-[0_0_14px_rgba(245,197,24,0.4)]" : "border-white/15 bg-white/5",
      )}
    >
      <span
        className={cn(
          "absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all",
          on ? "left-[26px]" : "left-0.5",
        )}
      />
    </button>
  );
}

function ToggleRow({
  label,
  hint,
  on,
  onToggle,
  disabled,
}: {
  label: string;
  hint: string;
  on: boolean;
  onToggle: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="text-sm font-medium text-white/90">{label}</p>
        <p className="text-[11px] text-white/40">{hint}</p>
      </div>
      <Toggle on={on} onToggle={onToggle} disabled={disabled} />
    </div>
  );
}
