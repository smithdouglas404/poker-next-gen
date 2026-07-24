"use client";

import { useState } from "react";

import { Button, Select } from "@/features/ui";
import { GLASS_PANEL, cn } from "@/features/ui/tokens";

import { SectionTitle } from "./ui";
import type { ClubSettingsBlob, OwnerClubExt, RakeConfig } from "./types";

const TIMEZONES = ["UTC, GMT", "America/New_York", "America/Los_Angeles", "Europe/London", "Europe/Berlin", "Asia/Tokyo", "Australia/Sydney"];
const LANGUAGES = ["English", "English, Spanish", "English, Chinese", "English, Portuguese", "Multi-language"];
const ADMIN_ROLES = ["Super Admin", "Admin", "Owner"];
const MOD_ROLES = ["Moderator", "Senior Moderator", "Support"];
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
  onSaveRake,
  onSaveSettings,
}: {
  club: OwnerClubExt | null;
  rake: RakeConfig | null;
  demo: boolean;
  canManage: boolean;
  onSaveRake: (cfg: RakeConfig) => Promise<void>;
  onSaveSettings: (
    patch: { is_public?: boolean; require_approval?: boolean; avatar_ref?: string },
    settings: ClubSettingsBlob,
  ) => Promise<void>;
}) {
  const s0 = club?.settings_json ?? {};

  const [timezone, setTimezone] = useState(s0.timezone ?? "UTC, GMT");
  const [languages, setLanguages] = useState(s0.languages ?? "English");

  const [rakePct, setRakePct] = useState(((rake?.percent_bps ?? 500) / 100).toString());
  const [maxBuyin, setMaxBuyin] = useState(
    s0.max_buyin_cents ? String(s0.max_buyin_cents / 100) : "",
  );
  // Full rake config (CustomRakeConfiguration) — previously only percent was editable.
  const [rakeCap, setRakeCap] = useState(rake?.cap_minor ? String(rake.cap_minor / 100) : "");
  const [minPot, setMinPot] = useState(rake?.min_pot_minor ? String(rake.min_pot_minor / 100) : "");
  const [noFlopNoDrop, setNoFlopNoDrop] = useState(rake?.no_flop_no_drop ?? true);
  const [rakePublic, setRakePublic] = useState(rake?.public ?? false);

  const [twofa, setTwofa] = useState(s0.twofa_required ?? true);
  const [adminRole, setAdminRole] = useState(s0.admin_role ?? "Super Admin");
  const [modRole, setModRole] = useState(s0.moderator_role ?? "Moderator");

  const [uiTheme, setUiTheme] = useState<"classic" | "cyber">(s0.ui_theme ?? "classic");
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
    timezone,
    languages,
    ui_theme: uiTheme,
    max_buyin_cents: maxBuyin ? Math.round(Number(maxBuyin) * 100) : undefined,
    twofa_required: twofa,
    admin_role: adminRole,
    moderator_role: modRole,
    kyc_required: kyc,
    geo_block: geo,
  });

  const savePreferences = () =>
    run("prefs", () => onSaveSettings({}, mergedSettings()));

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
    run("sec", () =>
      onSaveSettings({ is_public: isPublic, require_approval: requireApproval }, mergedSettings()),
    );

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
          </Labeled>
          <Labeled label="Language">
            <Select value={languages} onChange={(e) => setLanguages(e.target.value)} disabled={disabled}>
              {LANGUAGES.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </Select>
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
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-white/45">2FA</p>
            <div className="flex items-center gap-3">
              <Toggle on={twofa} onToggle={() => setTwofa((v) => !v)} disabled={disabled} />
              <span className={cn("text-sm", twofa ? "text-green" : "text-white/50")}>
                {twofa ? "Enabled" : "Disabled"}
              </span>
            </div>
          </div>
          <Labeled label="Admin Roles">
            <Select value={adminRole} onChange={(e) => setAdminRole(e.target.value)} disabled={disabled}>
              {ADMIN_ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </Select>
          </Labeled>
          <Labeled label="Moderator">
            <Select value={modRole} onChange={(e) => setModRole(e.target.value)} disabled={disabled}>
              {MOD_ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </Select>
          </Labeled>
          <GoldButton busy={busy === "sec"} disabled={disabled} onClick={saveSecurity}>
            Save Roles &amp; Visibility
          </GoldButton>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Club Branding + Visibility + Geo/KYC */}
        <Card title="Club Branding & Access">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
            <button
              type="button"
              disabled={disabled}
              className="flex h-24 w-40 shrink-0 items-center justify-center rounded-xl border border-dashed border-white/20 bg-white/[0.02] text-xs font-semibold uppercase tracking-wider text-white/50 transition hover:border-gold/40 hover:text-gold disabled:opacity-50"
            >
              Upload Logo
            </button>
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
          <div className="rounded-xl border border-gold/25 bg-gold/[0.04] px-4 py-6 text-center">
            <p className="text-sm text-white/80">Connect External Wallets &amp; Data Services</p>
            <p className="mt-1 text-[11px] text-white/45">
              Link payout wallets and analytics feeds to your club.
            </p>
            <div className="mt-4">
              <Button variant="gold" size="sm" disabled={disabled}>
                Connect
              </Button>
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
