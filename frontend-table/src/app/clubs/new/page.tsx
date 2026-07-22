"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { Button, Field, Input, Select } from "@/features/ui";
import { GLASS_PANEL, GLASS_PANEL_HOVER, HEADING_SM, cn } from "@/features/ui/tokens";
import {
  BRAND_SWATCHES,
  CLUB_CREATE_FEE_CENTS,
  CLUB_TYPE_META,
  CURRENCIES,
  clubSetup,
  currencySymbol,
  feeLabel,
  type ClubType,
  type SetupForm,
} from "@/features/clubs/setup/setupRpc";

const GOLD_TEXT =
  "bg-gradient-to-r from-[#ffd54a] via-[#f5c518] to-[#d4a80f] bg-clip-text text-transparent";

interface Toast {
  msg: string;
  kind: "ok" | "err";
}

const CREDIT_PRESETS = [100000, 500000, 1000000, 2500000]; // $1k / $5k / $10k / $25k

export default function ClubSetupPage() {
  const router = useRouter();

  const [name, setName] = useState("");
  const [tag, setTag] = useState("");
  const [description, setDescription] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [clubType, setClubType] = useState<ClubType>("private");
  const [requireApproval, setRequireApproval] = useState(true);
  const [brandColor, setBrandColor] = useState(BRAND_SWATCHES[0].value);
  const [creditLimit, setCreditLimit] = useState(""); // dollars string
  const [logoDataUrl, setLogoDataUrl] = useState<string | null>(null);

  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);
  const toastTimer = useRef<number | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const notify = useCallback((msg: string, kind: "ok" | "err" = "ok") => {
    setToast({ msg, kind });
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 4500);
  }, []);

  const monogram = useMemo(() => {
    const words = name.trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) return "HRC";
    if (words.length === 1) return words[0].slice(0, 3).toUpperCase();
    return words.slice(0, 3).map((w) => w[0]).join("").toUpperCase();
  }, [name]);

  const creditLimitCents = useMemo(() => {
    const n = Number(creditLimit.replace(/[$,\s]/g, ""));
    return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : 0;
  }, [creditLimit]);

  const nameValid = name.trim().length >= 3;
  const tagValid = tag.trim() === "" || /^[A-Za-z0-9]{2,5}$/.test(tag.trim());
  const canSubmit = nameValid && tagValid && !busy;

  const onPickLogo = (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      notify("Logo must be an image file.", "err");
      return;
    }
    if (file.size > 2_000_000) {
      notify("Logo must be under 2 MB.", "err");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setLogoDataUrl(typeof reader.result === "string" ? reader.result : null);
    reader.readAsDataURL(file);
  };

  const submit = () =>
    void (async () => {
      if (!nameValid) {
        notify("Club name needs at least 3 characters.", "err");
        return;
      }
      if (!tagValid) {
        notify("Club tag must be 2–5 letters or numbers.", "err");
        return;
      }
      setBusy(true);
      const form: SetupForm = {
        name,
        tag,
        description,
        currency,
        clubType,
        requireApproval,
        brandColor,
        creditLimitCents,
        logoDataUrl,
      };
      try {
        const { club, demo } = await clubSetup.createClub(form);
        if (demo) {
          notify("Preview only — sign in with a verified account to create your club for real.", "err");
          setBusy(false);
          return;
        }
        notify(`"${club.name}" created. Ownership fee charged to your wallet.`);
        window.setTimeout(() => router.push(`/clubs?created=${encodeURIComponent(club.id)}`), 900);
      } catch (e) {
        notify(e instanceof Error ? e.message : "Could not create club.", "err");
        setBusy(false);
      }
    })();

  return (
    <div className="relative min-h-screen bg-background text-foreground">
      {toast && (
        <div
          className={cn(
            "fixed left-1/2 top-4 z-50 -translate-x-1/2 rounded-xl border px-4 py-2.5 text-sm",
            toast.kind === "ok"
              ? "border-[#22c55e]/30 bg-[#0a7d43]/25 text-[#bff5d3]"
              : "border-[#e01e2b]/35 bg-[#b3151f]/25 text-[#ffcdd1]",
          )}
        >
          {toast.msg}
        </div>
      )}

      <div className="relative mx-auto w-full max-w-5xl px-4 py-10 sm:px-6 lg:px-8">
        {/* Header + crest */}
        <header className="mb-8 flex flex-col items-center text-center">
          <p className={cn(HEADING_SM, "text-muted")}>Ownership Onboarding</p>
          <h1
            className={cn(
              "font-display mt-2 text-3xl font-bold uppercase tracking-[0.18em] sm:text-4xl",
              GOLD_TEXT,
            )}
          >
            Initial Club Setup
          </h1>
          <Crest className="mt-4" color={brandColor} monogram={monogram} logo={logoDataUrl} />
        </header>

        {/* Two-column form */}
        <div className="grid gap-6 lg:grid-cols-2">
          {/* LEFT column ------------------------------------------------ */}
          <div className="space-y-6">
            {/* 1. Club Identity */}
            <SetupSection index={1} title="Club Identity">
              <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
                <Field label="Club Name" hint="Shown on the lobby, table rail, and invites.">
                  <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="High Rollers Club"
                    maxLength={48}
                  />
                </Field>
                <Field label="Club Tag" hint="2–5 chars">
                  <Input
                    value={tag}
                    onChange={(e) => setTag(e.target.value.toUpperCase())}
                    placeholder="HRC"
                    maxLength={5}
                    className={cn("w-28 text-center tracking-[0.3em]", !tagValid && "border-red-500/50")}
                  />
                </Field>
              </div>
              <Field label="Description" hint="A short pitch new members see when they browse.">
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Nightly high-stakes hold'em, curated roster, weekly leaderboards…"
                  maxLength={280}
                  rows={3}
                  className={cn(
                    "w-full resize-none rounded-xl border border-white/10 bg-black/40 px-4 py-2.5 text-sm text-white",
                    "placeholder:text-neutral-600 outline-none transition focus:border-cyan/40 focus:ring-2 focus:ring-cyan/10",
                  )}
                />
              </Field>
            </SetupSection>

            {/* 2. Branding */}
            <SetupSection index={2} title="Branding">
              <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
                {/* logo uploader */}
                <div className="flex flex-col items-center gap-2">
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    className="group relative h-28 w-28 shrink-0 rounded-full outline-none"
                    aria-label="Upload club logo"
                  >
                    <Crest color={brandColor} monogram={monogram} logo={logoDataUrl} size={112} />
                    <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50 text-[10px] font-semibold uppercase tracking-wider text-white opacity-0 backdrop-blur-sm transition group-hover:opacity-100">
                      {logoDataUrl ? "Replace" : "Upload Logo"}
                    </span>
                  </button>
                  {logoDataUrl && (
                    <button
                      type="button"
                      onClick={() => setLogoDataUrl(null)}
                      className="text-[10px] uppercase tracking-wider text-neutral-500 transition hover:text-red-300"
                    >
                      Remove
                    </button>
                  )}
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => onPickLogo(e.target.files?.[0])}
                  />
                </div>

                {/* color picker */}
                <div className="flex-1">
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-neutral-400">
                    Accent Color
                  </p>
                  <div className="flex flex-wrap gap-2.5">
                    {BRAND_SWATCHES.map((sw) => {
                      const active = brandColor === sw.value;
                      return (
                        <button
                          key={sw.value}
                          type="button"
                          title={sw.name}
                          onClick={() => setBrandColor(sw.value)}
                          className={cn(
                            "h-9 w-9 rounded-lg border-2 transition",
                            active ? "border-white scale-110" : "border-white/10 hover:border-white/40",
                          )}
                          style={{
                            background: sw.value,
                            boxShadow: active ? `0 0 18px ${sw.value}66` : undefined,
                          }}
                        />
                      );
                    })}
                  </div>
                  <p className="mt-3 text-[11px] text-neutral-500">
                    Drives your crest ring, seat accents, and invite styling.
                  </p>
                </div>
              </div>
            </SetupSection>
          </div>

          {/* RIGHT column ----------------------------------------------- */}
          <div className="space-y-6">
            {/* 3. Membership Settings */}
            <SetupSection index={3} title="Membership Settings">
              <Field label="Club Type">
                <Select
                  value={clubType}
                  onChange={(e) => {
                    const v = e.target.value as ClubType;
                    setClubType(v);
                    // Public clubs default approval off; gated types default on.
                    setRequireApproval(v !== "public");
                  }}
                >
                  {(Object.keys(CLUB_TYPE_META) as ClubType[]).map((t) => (
                    <option key={t} value={t}>
                      {CLUB_TYPE_META[t].label}
                    </option>
                  ))}
                </Select>
              </Field>
              <p className="-mt-1 text-[11px] text-neutral-500">{CLUB_TYPE_META[clubType].blurb}</p>

              <div className="mt-4 flex items-center justify-between rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3">
                <div className="min-w-0 pr-3">
                  <p className="text-sm font-medium text-neutral-200">Admin approval for new members</p>
                  <p className="text-[11px] text-neutral-500">
                    Every join request waits for an owner to approve.
                  </p>
                </div>
                <Toggle
                  on={requireApproval}
                  color={brandColor}
                  onToggle={() => setRequireApproval((v) => !v)}
                />
              </div>
            </SetupSection>

            {/* 4. Initial Financials */}
            <SetupSection index={4} title="Initial Financials">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Table Currency" hint="Denomination for stacks, pots, and rake.">
                  <Select value={currency} onChange={(e) => setCurrency(e.target.value)}>
                    {CURRENCIES.map((c) => (
                      <option key={c.code} value={c.code}>
                        {c.symbol} {c.code} — {c.label}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field
                  label="Default Player Credit Limit"
                  hint="Starting credit each new member may run up."
                >
                  <div className="relative">
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-neutral-500">
                      {currencySymbol(currency)}
                    </span>
                    <Input
                      inputMode="decimal"
                      value={creditLimit}
                      onChange={(e) => setCreditLimit(e.target.value)}
                      placeholder="10,000"
                      className="pl-7"
                    />
                  </div>
                </Field>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {CREDIT_PRESETS.map((cents) => (
                  <button
                    key={cents}
                    type="button"
                    onClick={() => setCreditLimit(String(cents / 100))}
                    className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-neutral-300 transition hover:border-gold/50 hover:text-gold"
                  >
                    {currencySymbol(currency)}
                    {(cents / 100).toLocaleString()}
                  </button>
                ))}
              </div>
            </SetupSection>

            {/* Fee summary */}
            <div className={cn(GLASS_PANEL, "flex items-center justify-between gap-4 p-4")}>
              <div className="min-w-0">
                <p className={cn(HEADING_SM, "text-gold/80")}>One-Time Ownership Fee</p>
                <p className="mt-1 text-[11px] text-neutral-500">
                  Charged to your wallet on create · ledgered as revenue · non-refundable
                </p>
              </div>
              <p className="font-display shrink-0 text-2xl font-bold tabular-nums text-gold">
                {feeLabel(CLUB_CREATE_FEE_CENTS)}
              </p>
            </div>
          </div>
        </div>

        {/* CREATE CLUB */}
        <div className="mt-8">
          <Button
            onClick={submit}
            disabled={!canSubmit}
            size="lg"
            className="h-14 w-full text-base tracking-[0.2em]"
          >
            {busy ? "Creating Club…" : `Create Club · ${feeLabel(CLUB_CREATE_FEE_CENTS)}`}
          </Button>
          <p className="mt-3 text-center text-[11px] text-neutral-600">
            You become the founding owner (100% equity). Fee, tier limits, and
            registration are enforced server-side by <span className="text-neutral-400">club_create</span>.
          </p>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function SetupSection({
  index,
  title,
  children,
}: {
  index: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className={cn(GLASS_PANEL, GLASS_PANEL_HOVER, "p-5 sm:p-6")}>
      <div className="mb-4 flex items-center gap-3">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg border border-gold/30 bg-gold/10 font-display text-sm font-bold text-gold">
          {index}
        </span>
        <h2 className={cn("font-display text-base font-bold uppercase tracking-wider text-foreground")}>
          {title}
        </h2>
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

function Crest({
  color,
  monogram,
  logo,
  size = 96,
  className,
}: {
  color: string;
  monogram: string;
  logo: string | null;
  size?: number;
  className?: string;
}) {
  return (
    <div
      className={cn("relative rounded-full", className)}
      style={{ width: size, height: size }}
    >
      <div
        className="absolute inset-0 rounded-full"
        style={{
          padding: 3,
          background: `linear-gradient(140deg, ${color}, ${color}44)`,
          boxShadow: `0 0 26px ${color}55`,
        }}
      >
        <div className="flex h-full w-full items-center justify-center overflow-hidden rounded-full bg-[#0d1016]">
          {logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logo} alt="Club logo" className="h-full w-full object-cover" />
          ) : (
            <span
              className="font-display font-bold tracking-tight"
              style={{ color, fontSize: size * 0.32 }}
            >
              {monogram}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function Toggle({
  on,
  color,
  onToggle,
}: {
  on: boolean;
  color: string;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={onToggle}
      className={cn(
        "relative h-7 w-12 shrink-0 rounded-full border transition",
        on ? "border-transparent" : "border-white/15 bg-white/5",
      )}
      style={on ? { background: color, boxShadow: `0 0 16px ${color}66` } : undefined}
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
