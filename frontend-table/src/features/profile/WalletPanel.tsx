"use client";

// The wallet, in the profile.
//
// WHY: the cashier lived only at /wallet, so topping up meant leaving whatever
// you were doing, finding a nav link, and landing on a different screen. Money
// belongs next to the identity that owns it. This is the same balance, the same
// ledger, and the same deposit RPCs — placed where players look for them.

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";

import { DepositPanel } from "@/features/wallet/DepositPanel";
import {
  humanizeReason,
  relTime,
  usd,
  walletApi,
  type LedgerEntry,
} from "@/features/wallet/walletRpc";
import { GLASS_PANEL, HEADING_SM, cn } from "@/features/ui/tokens";
import { RISE, STAGGER, STAGGER_ITEM } from "@/features/ui/motion";

interface Props {
  notify: (msg: string, kind?: "ok" | "err") => void;
}

export function WalletPanel({ notify }: Props) {
  const [balance, setBalance] = useState<number | null>(null);
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [dailyLimit, setDailyLimit] = useState(0);
  const [canFiat, setCanFiat] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [w, l, sub, ver] = await Promise.all([
        walletApi.get(),
        walletApi.ledger(12),
        walletApi.subscriptionStatus().catch(() => null),
        walletApi.verification().catch(() => null),
      ]);
      setBalance(w?.balance_cents ?? 0);
      setLedger(l?.ledger ?? []);
      setDailyLimit(sub?.tier?.deposit_limit_daily_cents ?? 0);
      // Card deposits require identity; crypto does not. Mirrors the gating the
      // backend already applies, so the panel never offers a path that 403s.
      setCanFiat(!!ver?.capabilities?.deposit_fiat);
    } catch (e) {
      notify(e instanceof Error ? e.message : "Failed to load wallet", "err");
    } finally {
      setLoading(false);
    }
  }, [notify]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <motion.div variants={STAGGER} initial="hidden" animate="show" className="space-y-6">
      <motion.section variants={STAGGER_ITEM} className={cn(GLASS_PANEL, "p-6")}>
        <p className={cn(HEADING_SM, "text-muted")}>Total Balance</p>
        <p className="font-display mt-1 text-4xl font-bold text-gold">
          {loading ? "…" : usd(balance ?? 0)}
        </p>
        <p className="mt-1 text-[11px] text-neutral-500">
          Available across cash games and tournaments.{" "}
          <Link href="/wallet" className="text-neutral-300 underline-offset-2 hover:underline">
            Full cashier — withdrawals, buckets, limits →
          </Link>
        </p>
      </motion.section>

      <motion.div variants={STAGGER_ITEM}>
        <DepositPanel canFiat={canFiat} dailyLimitCents={dailyLimit} notify={notify} />
      </motion.div>

      <motion.section variants={RISE} className={cn(GLASS_PANEL, "p-5")}>
        <p className={cn(HEADING_SM, "mb-4 text-muted")}>Recent Activity</p>
        {loading ? (
          <p className="text-sm text-neutral-500">Loading…</p>
        ) : ledger.length === 0 ? (
          <p className="text-sm text-neutral-500">No transactions yet.</p>
        ) : (
          <ul className="divide-y divide-white/[0.05]">
            {ledger.map((e, i) => (
              <li key={`${e.id ?? i}`} className="flex items-center justify-between gap-3 py-2.5">
                <span className="min-w-0">
                  <span className="block truncate text-[13px] text-neutral-200">
                    {humanizeReason(e.reason)}
                  </span>
                  <span className="block text-[11px] text-neutral-600">{relTime(e.created_at)}</span>
                </span>
                <span
                  className={cn(
                    "shrink-0 text-[13px] font-semibold tabular-nums",
                    (e.delta ?? 0) < 0 ? "text-[#ff2d3f]" : "text-green",
                  )}
                >
                  {(e.delta ?? 0) < 0 ? "" : "+"}
                  {usd(e.delta)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </motion.section>
    </motion.div>
  );
}
