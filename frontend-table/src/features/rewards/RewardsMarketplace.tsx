"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { BTN_GOLD, GLASS_PANEL, cn } from "@/features/ui/tokens";

import {
  CATEGORY_META,
  compactPoints,
  rewardsApi,
  type PointsBalance,
  type RewardItem,
  type RewardRedemption,
  type RewardsCatalog,
} from "./rewardsRpc";

type Toast = { msg: string; kind: "ok" | "err" };

function usd(cents: number): string {
  return `$${(cents / 100).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

export function RewardsMarketplace() {
  const [balance, setBalance] = useState<PointsBalance | null>(null);
  const [catalog, setCatalog] = useState<RewardsCatalog | null>(null);
  const [redemptions, setRedemptions] = useState<RewardRedemption[]>([]);
  const [category, setCategory] = useState<string>("");
  const [busy, setBusy] = useState<string | null>(null);
  const [buyOpen, setBuyOpen] = useState(false);
  const [buyAmount, setBuyAmount] = useState(1000);
  const [toast, setToast] = useState<Toast | null>(null);

  const notify = useCallback((msg: string, kind: "ok" | "err" = "ok") => {
    setToast({ msg, kind });
    window.setTimeout(() => setToast(null), 3200);
  }, []);

  const reload = useCallback(async () => {
    const [b, c, r] = await Promise.allSettled([
      rewardsApi.balance(),
      rewardsApi.catalog(category),
      rewardsApi.redemptions(),
    ]);
    if (b.status === "fulfilled") setBalance(b.value);
    if (c.status === "fulfilled") setCatalog(c.value);
    if (r.status === "fulfilled") setRedemptions(r.value.redemptions ?? []);
  }, [category]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const onRedeem = useCallback(
    async (item: RewardItem) => {
      if ((balance?.spendable ?? 0) < item.points_cost) {
        notify("Not enough points — earn more or buy points.", "err");
        return;
      }
      setBusy(item.id);
      try {
        const res = await rewardsApi.redeem(item.id);
        notify(`Redeemed "${item.title}" — voucher ${res.redemption.voucher_code}.`);
        await reload();
      } catch (e) {
        notify(e instanceof Error ? e.message : "Redemption failed", "err");
      } finally {
        setBusy(null);
      }
    },
    [balance, notify, reload],
  );

  const onBuy = useCallback(async () => {
    if (buyAmount <= 0) return;
    setBusy("buy");
    try {
      const res = await rewardsApi.buyPoints(buyAmount);
      notify(`Bought ${compactPoints(res.points)} points for ${usd(res.cost_cents)}.`);
      setBuyOpen(false);
      await reload();
    } catch (e) {
      notify(e instanceof Error ? e.message : "Purchase failed (check your chip balance)", "err");
    } finally {
      setBusy(null);
    }
  }, [buyAmount, notify, reload]);

  const cats = catalog?.categories ?? ["travel", "food", "recreation", "experiences", "merch"];
  const items = catalog?.items ?? [];

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
      {toast && (
        <div
          className={cn(
            "fixed left-1/2 top-20 z-50 -translate-x-1/2 rounded-xl border px-4 py-2.5 text-sm",
            toast.kind === "ok"
              ? "border-[#22c55e]/30 bg-[#0a7d43]/25 text-[#bff5d3]"
              : "border-[#e01e2b]/35 bg-[#b3151f]/25 text-[#ffcdd1]",
          )}
        >
          {toast.msg}
        </div>
      )}

      {/* Header + balance */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-gold/70">Rewards</p>
          <h1 className="font-display text-3xl font-bold uppercase tracking-wide text-white">
            Sponsor Marketplace
          </h1>
          <p className="mt-1 text-sm text-white/50">
            Spend the points you earn at the tables on real rewards — travel, dining, recreation & more.
          </p>
        </div>
        <div className={cn(GLASS_PANEL, "flex items-center gap-5 p-4")}>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-white/45">Spendable Points</p>
            <p className="font-display text-2xl font-bold text-gold">{compactPoints(balance?.spendable)}</p>
          </div>
          <div className="h-9 w-px bg-white/10" />
          <div>
            <p className="text-[10px] uppercase tracking-wider text-white/45">Lifetime (rank)</p>
            <p className="font-display text-2xl font-bold text-white/80">{compactPoints(balance?.lifetime)}</p>
          </div>
          <button
            type="button"
            onClick={() => setBuyOpen((v) => !v)}
            className={cn(BTN_GOLD, "rounded-lg px-3 py-2 text-xs font-bold uppercase tracking-wide")}
          >
            Buy Points
          </button>
        </div>
      </div>

      {/* Buy-points inline panel */}
      {buyOpen && (
        <div className={cn(GLASS_PANEL, "mt-4 flex flex-wrap items-center gap-3 p-4")}>
          <p className="text-sm text-white/70">Buy points with your chip balance (1 point = 1¢):</p>
          {[1000, 5000, 25000].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setBuyAmount(n)}
              className={cn(
                "rounded-lg border px-3 py-1.5 text-sm transition",
                buyAmount === n ? "border-gold bg-gold/10 text-gold" : "border-white/15 text-white/60 hover:text-white",
              )}
            >
              {compactPoints(n)} · {usd(n)}
            </button>
          ))}
          <input
            type="number"
            min={100}
            value={buyAmount}
            onChange={(e) => setBuyAmount(Math.max(0, Number(e.target.value)))}
            className="w-28 rounded-lg border border-white/15 bg-black/40 px-3 py-1.5 text-sm text-white outline-none focus:border-gold/50"
          />
          <button
            type="button"
            onClick={onBuy}
            disabled={busy === "buy" || buyAmount <= 0}
            className={cn(BTN_GOLD, "rounded-lg px-4 py-1.5 text-sm font-bold disabled:opacity-40")}
          >
            {busy === "buy" ? "Buying…" : `Buy for ${usd(buyAmount)}`}
          </button>
        </div>
      )}

      {/* Category tabs */}
      <div className="mt-6 flex flex-wrap gap-2">
        <CatTab active={category === ""} onClick={() => setCategory("")} label="All" icon="⭐" />
        {cats.map((c) => (
          <CatTab
            key={c}
            active={category === c}
            onClick={() => setCategory(c)}
            label={CATEGORY_META[c]?.label ?? c}
            icon={CATEGORY_META[c]?.icon ?? "🎁"}
          />
        ))}
      </div>

      {/* Item grid */}
      <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.length === 0 ? (
          <div className={cn(GLASS_PANEL, "col-span-full p-8 text-center text-sm text-white/45")}>
            No rewards in this category yet — check back soon.
          </div>
        ) : (
          items.map((item) => {
            const affordable = (balance?.spendable ?? 0) >= item.points_cost;
            return (
              <div key={item.id} className={cn(GLASS_PANEL, "flex flex-col overflow-hidden")}>
                <div className="flex h-28 items-center justify-center bg-gradient-to-br from-[#1c1f27] to-[#0c0e13] text-4xl">
                  {CATEGORY_META[item.category]?.icon ?? "🎁"}
                </div>
                <div className="flex flex-1 flex-col p-4">
                  <p className="text-[10px] uppercase tracking-wider text-gold/70">{item.sponsor_name}</p>
                  <p className="font-display text-lg font-semibold leading-tight text-white">{item.title}</p>
                  <p className="mt-1 line-clamp-2 flex-1 text-xs text-white/50">{item.description}</p>
                  <div className="mt-3 flex items-center justify-between">
                    <div>
                      <p className="font-display text-xl font-bold text-gold">{compactPoints(item.points_cost)} pts</p>
                      {item.cash_value_cents > 0 && (
                        <p className="text-[10px] text-white/40">worth {usd(item.cash_value_cents)}</p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => onRedeem(item)}
                      disabled={busy === item.id || !affordable}
                      className={cn(
                        "rounded-lg px-3 py-2 text-xs font-bold uppercase tracking-wide transition",
                        affordable
                          ? "bg-gradient-to-r from-[#9a7b2c] via-[#d4af37] to-[#f3e2ad] text-black hover:brightness-110"
                          : "border border-white/12 text-white/40",
                        busy === item.id && "opacity-50",
                      )}
                    >
                      {busy === item.id ? "…" : affordable ? "Redeem" : "Need points"}
                    </button>
                  </div>
                  {item.stock > 0 && <p className="mt-1.5 text-[10px] text-white/35">{item.stock} left</p>}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* My redemptions */}
      <div className="mt-8">
        <h2 className="font-display text-lg font-bold uppercase tracking-wide text-white">My Redemptions</h2>
        <div className={cn(GLASS_PANEL, "mt-3 overflow-hidden")}>
          {redemptions.length === 0 ? (
            <p className="px-5 py-6 text-sm text-white/40">
              No redemptions yet. Earn points at the tables, then treat yourself.{" "}
              <Link href="/lobby" className="text-gold hover:underline">
                Find a game →
              </Link>
            </p>
          ) : (
            redemptions.map((r) => (
              <div
                key={r.id}
                className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.06] px-5 py-3 last:border-0"
              >
                <div className="min-w-0">
                  <p className="truncate font-semibold text-white">{r.title}</p>
                  <p className="text-[11px] text-white/45">
                    Voucher <span className="font-mono text-gold/80">{r.voucher_code}</span> ·{" "}
                    {compactPoints(r.points_spent)} pts
                  </p>
                </div>
                <span
                  className={cn(
                    "shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide",
                    r.status === "fulfilled"
                      ? "border-[#22c55e]/40 bg-[#22c55e]/10 text-[#22c55e]"
                      : r.status === "cancelled"
                        ? "border-white/15 bg-white/[0.04] text-white/45"
                        : "border-gold/40 bg-gold/10 text-gold",
                  )}
                >
                  {r.status}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function CatTab({
  active,
  onClick,
  label,
  icon,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  icon: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm font-medium transition",
        active ? "border-gold bg-gold/10 text-gold" : "border-white/12 text-white/55 hover:text-white",
      )}
    >
      <span>{icon}</span>
      {label}
    </button>
  );
}
