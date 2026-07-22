"use client";

import { useEffect, useMemo, useState } from "react";

import { Button, Field, Input, Select } from "@/features/ui";
import { GLASS_PANEL, HEADING_SM, cn } from "@/features/ui/tokens";

import { centsToDollarInput, dollarInputToCents, kycApi, moneyLabel, untilLabel } from "./kycRpc";
import type { RgLimits } from "./types";

const COOL_OFF_OPTIONS = [
  { label: "24 hours", hours: 24 },
  { label: "48 hours", hours: 48 },
  { label: "7 days", hours: 24 * 7 },
  { label: "30 days", hours: 24 * 30 },
];

const EXCLUDE_OPTIONS = [
  { label: "6 months", days: 182 },
  { label: "1 year", days: 365 },
  { label: "5 years", days: 365 * 5 },
];

function LimitStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-black/30 px-4 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-neutral-500">{label}</p>
      <p className="mt-1 font-display text-lg font-bold text-foreground">{value}</p>
    </div>
  );
}

export function ResponsibleGamblingSection({
  limits,
  onChanged,
  notify,
}: {
  limits: RgLimits | null;
  onChanged: () => void;
  notify: (msg: string, kind?: "ok" | "err") => void;
}) {
  // Deposit / loss / session limit form (dollar strings; session in minutes).
  const [depDaily, setDepDaily] = useState("");
  const [depWeekly, setDepWeekly] = useState("");
  const [depMonthly, setDepMonthly] = useState("");
  const [lossDaily, setLossDaily] = useState("");
  const [sessionMin, setSessionMin] = useState("");
  const [savingLimits, setSavingLimits] = useState(false);

  const [coolHours, setCoolHours] = useState(COOL_OFF_OPTIONS[0].hours);
  const [coolBusy, setCoolBusy] = useState(false);

  const [excludeMode, setExcludeMode] = useState<"temporary" | "permanent">("temporary");
  const [excludeDays, setExcludeDays] = useState(EXCLUDE_OPTIONS[0].days);
  const [excludeBusy, setExcludeBusy] = useState(false);
  const [excludeConfirm, setExcludeConfirm] = useState(false);

  // Hydrate the form whenever server limits change.
  useEffect(() => {
    if (!limits) return;
    setDepDaily(centsToDollarInput(limits.deposit_daily_cents));
    setDepWeekly(centsToDollarInput(limits.deposit_weekly_cents));
    setDepMonthly(centsToDollarInput(limits.deposit_monthly_cents));
    setLossDaily(centsToDollarInput(limits.loss_daily_cents));
    setSessionMin(limits.session_minutes > 0 ? String(limits.session_minutes) : "");
  }, [limits]);

  const coolOffActive = useMemo(() => untilLabel(limits?.cool_off_until), [limits]);
  const selfExcludedActive = useMemo(() => untilLabel(limits?.self_excluded_until), [limits]);

  const saveLimits = () =>
    void (async () => {
      setSavingLimits(true);
      try {
        const parsedSession = Number.parseInt(sessionMin, 10);
        await kycApi.rgLimitsSet({
          deposit_daily_cents: dollarInputToCents(depDaily),
          deposit_weekly_cents: dollarInputToCents(depWeekly),
          deposit_monthly_cents: dollarInputToCents(depMonthly),
          loss_daily_cents: dollarInputToCents(lossDaily),
          session_minutes: Number.isFinite(parsedSession) && parsedSession > 0 ? parsedSession : 0,
        });
        notify("Limits saved. Set a field to 0 (empty) to remove a limit.");
        onChanged();
      } catch (e) {
        notify(e instanceof Error ? e.message : "Could not save limits", "err");
      } finally {
        setSavingLimits(false);
      }
    })();

  const armCoolOff = () =>
    void (async () => {
      setCoolBusy(true);
      try {
        const res = await kycApi.rgCoolOff(coolHours);
        const lbl = untilLabel(res.cool_off_until);
        notify(`Cool-off armed${lbl ? ` — resumes in ${lbl}` : ""}.`);
        onChanged();
      } catch (e) {
        notify(e instanceof Error ? e.message : "Could not start cool-off", "err");
      } finally {
        setCoolBusy(false);
      }
    })();

  const armSelfExclude = () =>
    void (async () => {
      if (!excludeConfirm) {
        setExcludeConfirm(true);
        return;
      }
      setExcludeBusy(true);
      try {
        await kycApi.rgSelfExclude(
          excludeMode === "permanent" ? { permanent: true } : { days: excludeDays },
        );
        notify(
          excludeMode === "permanent"
            ? "Permanent self-exclusion armed."
            : `Self-exclusion armed for ${excludeDays} days.`,
        );
        setExcludeConfirm(false);
        onChanged();
      } catch (e) {
        notify(e instanceof Error ? e.message : "Could not self-exclude", "err");
      } finally {
        setExcludeBusy(false);
      }
    })();

  return (
    <div className="space-y-5">
      {/* Active protections summary */}
      <div className="grid gap-3 sm:grid-cols-3">
        <LimitStat
          label="Daily deposit cap"
          value={limits?.deposit_daily_cents ? moneyLabel(limits.deposit_daily_cents) : "None"}
        />
        <LimitStat
          label="Daily loss cap"
          value={limits?.loss_daily_cents ? moneyLabel(limits.loss_daily_cents) : "None"}
        />
        <LimitStat
          label="Session length"
          value={limits?.session_minutes ? `${limits.session_minutes} min` : "Unlimited"}
        />
      </div>

      {(coolOffActive || selfExcludedActive) && (
        <div
          className={cn(
            GLASS_PANEL,
            "flex flex-wrap items-center gap-3 border-amber-500/30 p-4 text-sm",
          )}
        >
          <span className="h-2 w-2 rounded-full bg-amber-400 shadow-[0_0_10px_rgba(251,191,36,0.7)]" />
          {selfExcludedActive ? (
            <span className="text-amber-200">
              Self-exclusion active
              {selfExcludedActive === "permanent" ? " — permanent" : ` — lifts in ${selfExcludedActive}`}
              . This cannot be undone early.
            </span>
          ) : (
            <span className="text-amber-200">Cool-off active — play resumes in {coolOffActive}.</span>
          )}
        </div>
      )}

      {/* Deposit / loss / session limits */}
      <div className={cn(GLASS_PANEL, "p-5")}>
        <p className={cn(HEADING_SM, "text-cyan/80")}>Deposit, loss & session limits</p>
        <p className="mt-1 text-xs text-neutral-500">
          Dollar amounts. Leave a field blank (0) to remove that limit. Limits apply immediately and
          are enforced server-side at deposit and at the table.
        </p>
        <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Daily deposit ($)">
            <Input
              inputMode="decimal"
              value={depDaily}
              onChange={(e) => setDepDaily(e.target.value)}
              placeholder="Unlimited"
            />
          </Field>
          <Field label="Weekly deposit ($)">
            <Input
              inputMode="decimal"
              value={depWeekly}
              onChange={(e) => setDepWeekly(e.target.value)}
              placeholder="Unlimited"
            />
          </Field>
          <Field label="Monthly deposit ($)">
            <Input
              inputMode="decimal"
              value={depMonthly}
              onChange={(e) => setDepMonthly(e.target.value)}
              placeholder="Unlimited"
            />
          </Field>
          <Field label="Daily loss ($)">
            <Input
              inputMode="decimal"
              value={lossDaily}
              onChange={(e) => setLossDaily(e.target.value)}
              placeholder="Unlimited"
            />
          </Field>
          <Field label="Session length (minutes)">
            <Input
              inputMode="numeric"
              value={sessionMin}
              onChange={(e) => setSessionMin(e.target.value)}
              placeholder="Unlimited"
            />
          </Field>
        </div>
        <Button onClick={saveLimits} disabled={savingLimits} className="mt-5">
          {savingLimits ? "Saving…" : "Save limits"}
        </Button>
      </div>

      {/* Cool-off */}
      <div className={cn(GLASS_PANEL, "p-5")}>
        <p className={cn(HEADING_SM, "text-cyan/80")}>Take a break — cool-off</p>
        <p className="mt-1 text-xs text-neutral-500">
          A short, self-lifting break. You cannot join tables until it expires. Capped at 30 days —
          use self-exclusion for longer.
        </p>
        <div className="mt-4 flex flex-wrap items-end gap-4">
          <Field label="Duration" className="w-48">
            <Select
              value={String(coolHours)}
              onChange={(e) => setCoolHours(Number.parseInt(e.target.value, 10))}
            >
              {COOL_OFF_OPTIONS.map((o) => (
                <option key={o.hours} value={o.hours}>
                  {o.label}
                </option>
              ))}
            </Select>
          </Field>
          <Button variant="outline" onClick={armCoolOff} disabled={coolBusy}>
            {coolBusy ? "Arming…" : "Start cool-off"}
          </Button>
        </div>
      </div>

      {/* Self-exclusion */}
      <div className={cn(GLASS_PANEL, "border-red-500/20 p-5")}>
        <p className={cn(HEADING_SM, "text-red-300/80")}>Self-exclusion</p>
        <p className="mt-1 text-xs text-neutral-500">
          A longer, binding exclusion. Once armed it cannot be lifted early. Choose a fixed window or
          make it permanent.
        </p>
        <div className="mt-4 flex flex-wrap items-end gap-4">
          <Field label="Type" className="w-48">
            <Select
              value={excludeMode}
              onChange={(e) => {
                setExcludeMode(e.target.value as "temporary" | "permanent");
                setExcludeConfirm(false);
              }}
            >
              <option value="temporary">Fixed window</option>
              <option value="permanent">Permanent</option>
            </Select>
          </Field>
          {excludeMode === "temporary" && (
            <Field label="Duration" className="w-48">
              <Select
                value={String(excludeDays)}
                onChange={(e) => {
                  setExcludeDays(Number.parseInt(e.target.value, 10));
                  setExcludeConfirm(false);
                }}
              >
                {EXCLUDE_OPTIONS.map((o) => (
                  <option key={o.days} value={o.days}>
                    {o.label}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          <Button variant="danger" onClick={armSelfExclude} disabled={excludeBusy}>
            {excludeBusy
              ? "Arming…"
              : excludeConfirm
                ? "Tap again to confirm"
                : "Self-exclude"}
          </Button>
        </div>
        {excludeConfirm && (
          <p className="mt-3 text-xs text-red-300">
            This is binding and cannot be undone early. Confirm to proceed.
          </p>
        )}
      </div>
    </div>
  );
}
