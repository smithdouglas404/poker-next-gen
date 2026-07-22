"use client";

import { useState } from "react";

import { Button, Field, Input, Select } from "@/features/ui";
import { GLASS_PANEL, GLASS_PANEL_HOVER, HEADING_SM, cn } from "@/features/ui/tokens";

import { kycApi } from "./kycRpc";
import type { KycRecord, MeVerification, VerificationKind, VerificationStatus } from "./types";

const TIERS: {
  kind: VerificationKind;
  eyebrow: string;
  title: string;
  checks: string;
  unlocks: string;
  accent: "cyan" | "gold";
}[] = [
  {
    kind: "email",
    eyebrow: "Tier 1 · Registration",
    title: "Email",
    checks: "Email ownership verification",
    unlocks: "Register · join & create clubs · full lobby",
    accent: "cyan",
  },
  {
    kind: "biometric",
    eyebrow: "Tier 2 · Paying & Marketplace",
    title: "Biometric",
    checks: "Liveness + biometric authentication",
    unlocks: "Buy membership · trade on the marketplace · generate characters",
    accent: "cyan",
  },
  {
    kind: "kyc_aml",
    eyebrow: "Tier 3 · Real Money",
    title: "KYC / AML",
    checks: "Full identity document + AML screening",
    unlocks: "Fiat deposits & withdrawals (crypto is exempt)",
    accent: "gold",
  },
];

const STATUS_STYLE: Record<VerificationStatus, { label: string; cls: string; dot: string }> = {
  verified: {
    label: "Verified",
    cls: "border-emerald-500/40 bg-emerald-950/40 text-emerald-200",
    dot: "bg-emerald-400",
  },
  pending: {
    label: "Pending",
    cls: "border-amber-500/40 bg-amber-950/30 text-amber-200",
    dot: "bg-amber-400 animate-pulse",
  },
  rejected: {
    label: "Rejected",
    cls: "border-red-500/40 bg-red-950/30 text-red-200",
    dot: "bg-red-400",
  },
  none: {
    label: "Not started",
    cls: "border-white/15 bg-white/[0.03] text-neutral-400",
    dot: "bg-neutral-500",
  },
};

function StatusPill({ status }: { status: VerificationStatus }) {
  const s = STATUS_STYLE[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.15em]",
        s.cls,
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", s.dot)} />
      {s.label}
    </span>
  );
}

export function VerificationSection({
  me,
  kyc,
  onChanged,
  notify,
}: {
  me: MeVerification | null;
  kyc: KycRecord | null;
  onChanged: () => void;
  notify: (msg: string, kind?: "ok" | "err") => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualLevel, setManualLevel] = useState("full");
  const [fullName, setFullName] = useState("");
  const [country, setCountry] = useState("");
  const [docId, setDocId] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const statusOf = (kind: VerificationKind): VerificationStatus =>
    me?.verifications?.[kind] ?? "none";

  const start = (kind: VerificationKind) =>
    void (async () => {
      setBusy(kind);
      try {
        const res = await kycApi.kycStart(kind);
        if (res.url) {
          window.location.href = res.url;
        } else {
          notify("Verification session created but no URL was returned.", "err");
        }
      } catch (e) {
        notify(e instanceof Error ? e.message : "Could not start verification", "err");
      } finally {
        setBusy(null);
      }
    })();

  const submitManual = () =>
    void (async () => {
      setSubmitting(true);
      try {
        await kycApi.kycSubmit(manualLevel, {
          full_name: fullName.trim(),
          country: country.trim(),
          document_id: docId.trim(),
        });
        notify("Identity details submitted for review.");
        setManualOpen(false);
        setFullName("");
        setCountry("");
        setDocId("");
        onChanged();
      } catch (e) {
        notify(e instanceof Error ? e.message : "Submission failed", "err");
      } finally {
        setSubmitting(false);
      }
    })();

  const enforced = me?.enforced ?? false;

  return (
    <div className="space-y-5">
      {/* Provider / enforcement banner */}
      <div className={cn(GLASS_PANEL, "flex flex-wrap items-center justify-between gap-3 p-4")}>
        <div className="flex items-center gap-3">
          <span
            className={cn(
              "h-2 w-2 rounded-full",
              enforced ? "bg-cyan shadow-[0_0_10px_rgba(129,236,255,0.7)]" : "bg-neutral-600",
            )}
          />
          <p className="text-sm text-neutral-300">
            {enforced
              ? "Live verification is enabled. Complete a tier to unlock its capabilities."
              : "Verification is dormant — the operator has not enabled the identity provider yet. All capabilities stay open."}
          </p>
        </div>
        <span className={cn(HEADING_SM, "text-neutral-500")}>Didit · KYC / AML</span>
      </div>

      {/* Tier cards */}
      <div className="space-y-3">
        {TIERS.map((t) => {
          const status = statusOf(t.kind);
          const isVerified = status === "verified";
          const isPending = status === "pending";
          return (
            <div
              key={t.kind}
              className={cn(
                GLASS_PANEL,
                GLASS_PANEL_HOVER,
                "flex flex-wrap items-center justify-between gap-4 p-5",
                t.accent === "gold" && "border-gold/20",
              )}
            >
              <div className="min-w-[240px] flex-1">
                <p
                  className={cn(
                    HEADING_SM,
                    t.accent === "gold" ? "text-gold/80" : "text-cyan/80",
                  )}
                >
                  {t.eyebrow}
                </p>
                <h3 className="font-display mt-1 text-xl font-bold uppercase tracking-wide text-foreground">
                  {t.title}
                </h3>
                <p className="mt-1 text-xs text-neutral-400">{t.checks}</p>
                <p className="mt-1.5 text-[11px] text-neutral-500">
                  Unlocks: <span className="text-neutral-300">{t.unlocks}</span>
                </p>
              </div>
              <div className="flex flex-col items-end gap-2">
                <StatusPill status={status} />
                <Button
                  variant={t.accent === "gold" ? "gold" : "outline"}
                  size="sm"
                  disabled={busy !== null || isVerified}
                  onClick={() => start(t.kind)}
                >
                  {isVerified
                    ? "Verified"
                    : busy === t.kind
                      ? "Starting…"
                      : isPending
                        ? "Resume"
                        : "Verify"}
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      {/* KYC record detail + manual fallback */}
      <div className={cn(GLASS_PANEL, "p-5")}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className={cn(HEADING_SM, "text-gold/80")}>KYC / AML record</p>
            <p className="mt-1 text-sm text-neutral-300">
              Level{" "}
              <span className="font-semibold text-foreground">{kyc?.level ?? "none"}</span> · Status{" "}
              <span className="font-semibold text-foreground">{kyc?.status ?? "none"}</span>
              {kyc?.provider ? (
                <span className="text-neutral-500"> · via {kyc.provider}</span>
              ) : null}
            </p>
            {kyc?.rejection_reason ? (
              <p className="mt-1 text-xs text-red-300">Reason: {kyc.rejection_reason}</p>
            ) : null}
          </div>
          <Button variant="ghost" size="sm" onClick={() => setManualOpen((v) => !v)}>
            {manualOpen ? "Cancel" : "Manual submission"}
          </Button>
        </div>

        {manualOpen && (
          <div className="mt-5 grid gap-4 border-t border-white/10 pt-5 sm:grid-cols-2">
            <Field label="Full legal name">
              <Input
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Jane Q. Public"
              />
            </Field>
            <Field label="Country of residence">
              <Input
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                placeholder="United States"
              />
            </Field>
            <Field label="Government document ID">
              <Input
                value={docId}
                onChange={(e) => setDocId(e.target.value)}
                placeholder="Passport / license number"
              />
            </Field>
            <Field label="Verification level">
              <Select value={manualLevel} onChange={(e) => setManualLevel(e.target.value)}>
                <option value="basic">Basic</option>
                <option value="full">Full (KYC / AML)</option>
              </Select>
            </Field>
            <div className="sm:col-span-2">
              <Button
                onClick={submitManual}
                disabled={submitting || fullName.trim() === ""}
                className="w-full"
              >
                {submitting ? "Submitting…" : "Submit for review"}
              </Button>
              <p className="mt-2 text-[11px] text-neutral-600">
                Manual review is the fallback path when a live provider is not configured. Documents
                and backing files are handled out of band.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
