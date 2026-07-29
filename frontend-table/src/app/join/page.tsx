"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { motion } from "framer-motion";

import { TierCard } from "@/features/membership/TierCard";
import { PREVIEW_TIERS } from "@/features/membership/previewTiers";
import type { BillingInterval } from "@/features/membership/types";
import { STAGGER, STAGGER_ITEM } from "@/features/ui/motion";
import { GLASS_PANEL, HEADING_LG, HEADING_SM, cn } from "@/features/ui/tokens";

const FEATURED_TIER = "gold";

// Public, pre-auth plan picker. Visitors choose a tier here BEFORE creating an
// account — the chosen tier rides along as a query param through /sign-up so
// /membership can finish the checkout automatically once the account exists,
// instead of dropping a brand-new member into a bare tier grid a second time.
export default function JoinPage() {
  const router = useRouter();
  const [interval, setInterval] = useState<BillingInterval>("month");
  const [selecting, setSelecting] = useState<string | null>(null);

  const choose = (tierId: string) => {
    setSelecting(tierId);
    const qs = new URLSearchParams({ plan: tierId, interval });
    router.push(`/sign-up?${qs.toString()}`);
  };

  return (
    <div className="min-h-screen text-foreground">
      <header className="border-b border-white/[0.06] px-6 py-6">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <Link
            href="/"
            className="font-display text-sm font-bold uppercase tracking-wider text-neutral-300 transition hover:text-white"
          >
            ← Back
          </Link>
          <Link
            href="/sign-in"
            className="text-sm font-semibold text-neutral-300 transition hover:text-white"
          >
            Already a member? Sign in
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-12">
        <p className={cn(HEADING_SM, "text-center text-gold/70")}>Choose your table</p>
        <h1 className={cn(HEADING_LG, "mx-auto mt-2 max-w-2xl text-center text-3xl md:text-4xl")}>
          Pick a plan, then create your account
        </h1>
        <p className="mx-auto mt-3 max-w-2xl text-center text-sm text-neutral-400">
          Every tier plays on the same provably-fair engine with the same identity checks behind
          real money. Higher tiers unlock higher stakes, rakeback, and club ownership. Change plans
          anytime.
        </p>

        <div className="mt-8 flex items-center justify-center">
          <div className={cn(GLASS_PANEL, "inline-flex p-1 text-xs")}>
            {(["month", "year"] as const).map((opt) => (
              <button
                key={opt}
                type="button"
                onClick={() => setInterval(opt)}
                className={cn(
                  "rounded-lg px-4 py-1.5 font-semibold uppercase tracking-wider transition",
                  interval === opt
                    ? "bg-gradient-to-r from-[#ffd54a] via-[#f5c518] to-[#d4a80f] text-[#231b00]"
                    : "text-neutral-400 hover:text-white",
                )}
              >
                {opt === "month" ? "Monthly" : "Annual"}
                {opt === "year" && <span className="ml-1 opacity-70">· 2 mo free</span>}
              </button>
            ))}
          </div>
        </div>

        <motion.section
          variants={STAGGER}
          initial="hidden"
          animate="show"
          className="mt-8 grid gap-4 md:grid-cols-3 xl:grid-cols-5"
        >
          {PREVIEW_TIERS.map((tier) => (
            <motion.div key={tier.id} variants={STAGGER_ITEM} className="h-full">
              <TierCard
                tier={tier}
                interval={interval}
                isCurrent={false}
                isDowngrade={false}
                featured={tier.id === FEATURED_TIER}
                busy={selecting === tier.id}
                locked={false}
                onSelect={() => choose(tier.id)}
              />
            </motion.div>
          ))}
        </motion.section>

        <p className="mt-8 text-center text-sm text-neutral-400">
          Not ready to commit?{" "}
          <Link href="/sign-up" className="font-semibold text-gold underline underline-offset-2">
            Start free →
          </Link>
        </p>

        <p className="mt-3 text-center text-[11px] text-neutral-600">
          Identity verification (KYC/AML) is required before real-money deposits or withdrawals,
          regardless of tier.
        </p>
      </main>
    </div>
  );
}
