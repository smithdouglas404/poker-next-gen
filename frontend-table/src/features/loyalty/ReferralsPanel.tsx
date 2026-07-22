"use client";

import { useState } from "react";

import { Button, Field, Input } from "@/features/ui";

import type { ReferralStatus } from "./loyaltyRpc";
import { money, relTime } from "./loyaltyRpc";
import { EmptyState, Eyebrow, GlassCard, Pill, StatTile } from "./ui";

export function ReferralsPanel({
  status,
  claiming,
  applying,
  onClaim,
  onApply,
}: {
  status: ReferralStatus | null;
  claiming: boolean;
  applying: boolean;
  onClaim: () => void;
  onApply: (code: string) => void;
}) {
  const [applyCode, setApplyCode] = useState("");
  const [copied, setCopied] = useState(false);

  const code = status?.code ?? "";
  const referrals = status?.referrals ?? [];
  // Attribution rows only (the anchor row carries no referred_user_id).
  const invited = referrals.filter((r) => r.referred_user_id);

  const copyCode = () => {
    if (!code) return;
    void navigator.clipboard?.writeText(code).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    });
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
      {/* Your invite code + earnings */}
      <GlassCard className="p-5">
        <Eyebrow>Your Invite Code</Eyebrow>
        <div className="mt-2 flex items-center gap-2">
          <div className="flex-1 rounded-xl border border-gold/25 bg-black/40 px-4 py-3 text-center font-display text-xl font-bold uppercase tracking-[0.2em] text-gold">
            {code || "……"}
          </div>
          <Button onClick={copyCode} disabled={!code} variant="outline" className="h-full">
            {copied ? "Copied" : "Copy"}
          </Button>
        </div>
        <p className="mt-2 text-[11px] text-neutral-500">
          Share your code. When friends apply it they get a welcome bonus, and you earn a reward for
          each qualified referral.
        </p>

        <div className="mt-4 grid grid-cols-3 gap-2.5">
          <StatTile label="Referrals" value={status?.total_referrals ?? 0} accent="green" />
          <StatTile label="Pending" value={money(status?.pending_cents)} accent="gold" />
          <StatTile label="Earned" value={money(status?.earned_cents)} />
        </div>

        <Button
          onClick={onClaim}
          disabled={claiming || (status?.pending_count ?? 0) <= 0}
          className="mt-4 w-full"
          variant={(status?.pending_count ?? 0) > 0 ? "gold" : "outline"}
        >
          {claiming
            ? "Claiming…"
            : (status?.pending_count ?? 0) > 0
              ? `Claim ${money(status?.pending_cents)} (${status?.pending_count})`
              : "No Pending Rewards"}
        </Button>
      </GlassCard>

      {/* Redeem a code + referral list */}
      <GlassCard className="flex flex-col p-5">
        {!status?.was_referred ? (
          <>
            <Eyebrow tone="green">Redeem a Code</Eyebrow>
            <Field label="Referral code" className="mt-2">
              <Input
                value={applyCode}
                onChange={(e) => setApplyCode(e.target.value.toUpperCase())}
                placeholder="Enter a friend's code"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && applyCode.trim()) onApply(applyCode.trim());
                }}
              />
            </Field>
            <Button
              onClick={() => onApply(applyCode.trim())}
              disabled={applying || applyCode.trim() === ""}
              className="mt-3 w-full"
            >
              {applying ? "Applying…" : "Apply Code"}
            </Button>
            <p className="mt-2 text-[11px] text-neutral-500">
              You can redeem one referral code, once — it credits your welcome bonus.
            </p>
          </>
        ) : (
          <div className="flex items-center gap-2">
            <Eyebrow tone="green">Referred</Eyebrow>
            <Pill tone="emerald">Welcome bonus credited</Pill>
          </div>
        )}

        <div className="mt-4 flex-1">
          <Eyebrow tone="muted">Your Referrals</Eyebrow>
          {invited.length === 0 ? (
            <div className="mt-2">
              <EmptyState icon="🤝">No referrals yet — share your code to start earning.</EmptyState>
            </div>
          ) : (
            <ul className="mt-2 max-h-52 space-y-1.5 overflow-y-auto pr-1">
              {invited.map((r) => (
                <li
                  key={r.id}
                  className="flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm text-neutral-200">
                      {r.referred_user_id?.slice(0, 8) ?? "player"}…
                    </p>
                    <p className="text-[10px] text-neutral-600">{relTime(r.created_at)}</p>
                  </div>
                  <Pill
                    tone={r.status === "claimed" ? "emerald" : r.status === "applied" ? "gold" : "muted"}
                  >
                    {r.status}
                  </Pill>
                </li>
              ))}
            </ul>
          )}
        </div>
      </GlassCard>
    </div>
  );
}
