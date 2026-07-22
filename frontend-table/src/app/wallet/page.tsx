"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Button, Field, Input, Select } from "@/features/ui";
import { GLASS_PANEL, GLASS_PANEL_HOVER, HEADING_SM, cn } from "@/features/ui/tokens";
import {
  bucketLabel,
  dollarsToCents,
  humanizeReason,
  relTime,
  usd,
  usdCompact,
  walletApi,
  type BucketBalance,
  type LedgerEntry,
  type RakebackStatus,
  type SubscriptionStatusResp,
  type VerificationResp,
  type Withdrawal,
} from "@/features/wallet/walletRpc";

const GOLD_TEXT =
  "bg-gradient-to-r from-[#f3e2ad] via-[#d4af37] to-[#9a7b2c] bg-clip-text text-transparent";

interface Toast {
  msg: string;
  kind: "ok" | "err";
}

interface BonusView {
  chips: number;
  can_claim: boolean;
  streak: number;
  next_claim_at?: string | null;
}

export default function WalletPage() {
  const [balance, setBalance] = useState<number | null>(null);
  const [buckets, setBuckets] = useState<BucketBalance[]>([]);
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
  const [bonus, setBonus] = useState<BonusView | null>(null);
  const [rakeback, setRakeback] = useState<RakebackStatus | null>(null);
  const [sub, setSub] = useState<SubscriptionStatusResp | null>(null);
  const [ver, setVer] = useState<VerificationResp | null>(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<Toast | null>(null);
  const toastTimer = useRef<number | null>(null);

  const notify = useCallback((msg: string, kind: "ok" | "err" = "ok") => {
    setToast({ msg, kind });
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 4000);
  }, []);

  const loadCore = useCallback(async () => {
    // Each source is independent — one empty/failing source never blanks the page.
    const results = await Promise.allSettled([
      walletApi.get(),
      walletApi.balances(),
      walletApi.ledger(60),
      walletApi.withdrawalList(),
      walletApi.bonusStatus(),
      walletApi.rakebackStatus(),
      walletApi.subscriptionStatus(),
      walletApi.verification(),
    ]);
    const [g, b, l, w, bo, rb, s, v] = results;
    if (g.status === "fulfilled") setBalance(g.value.balance_cents ?? 0);
    if (b.status === "fulfilled") setBuckets(b.value.buckets ?? []);
    if (l.status === "fulfilled") setLedger(l.value.ledger ?? []);
    if (w.status === "fulfilled") setWithdrawals(w.value.withdrawals ?? []);
    if (bo.status === "fulfilled") setBonus(bo.value);
    if (rb.status === "fulfilled") setRakeback(rb.value);
    if (s.status === "fulfilled") setSub(s.value);
    if (v.status === "fulfilled") setVer(v.value);
    if (g.status === "rejected") {
      notify(
        g.reason instanceof Error ? g.reason.message : "Failed to load wallet",
        "err",
      );
    }
  }, [notify]);

  useEffect(() => {
    void (async () => {
      await loadCore();
      setLoading(false);
    })();
  }, [loadCore]);

  // ---- claims ----
  const [claimingBonus, setClaimingBonus] = useState(false);
  const claimBonus = () =>
    void (async () => {
      setClaimingBonus(true);
      try {
        const res = await walletApi.bonusClaim();
        if (res.claimed) {
          notify(`Claimed ${res.chips?.toLocaleString()} chips.`);
        } else {
          notify(res.message ?? "Bonus not ready yet.", "err");
        }
        await loadCore();
      } catch (e) {
        notify(e instanceof Error ? e.message : "Claim failed", "err");
      } finally {
        setClaimingBonus(false);
      }
    })();

  const [claimingRake, setClaimingRake] = useState(false);
  const claimRakeback = () =>
    void (async () => {
      setClaimingRake(true);
      try {
        const res = await walletApi.rakebackClaim();
        notify(
          res.claimed_cents > 0
            ? `Moved ${usd(res.claimed_cents)} rakeback to your wallet.`
            : "No rakeback to claim yet.",
          res.claimed_cents > 0 ? "ok" : "err",
        );
        await loadCore();
      } catch (e) {
        notify(e instanceof Error ? e.message : "Claim failed", "err");
      } finally {
        setClaimingRake(false);
      }
    })();

  const limits = sub?.tier;
  const canWithdraw = ver ? ver.capabilities.withdraw : true;
  const canDepositFiat = ver ? ver.capabilities.deposit_fiat : true;

  return (
    <div className="min-h-screen bg-background text-foreground">
      {toast && (
        <div
          className={cn(
            "fixed left-1/2 top-4 z-50 -translate-x-1/2 rounded-xl border px-4 py-2.5 text-sm backdrop-blur-xl",
            toast.kind === "ok"
              ? "border-emerald-500/30 bg-emerald-950/50 text-emerald-200"
              : "border-red-500/30 bg-red-950/50 text-red-200",
          )}
        >
          {toast.msg}
        </div>
      )}

      <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Header + hero balance */}
        <header className="mb-8">
          <p className={cn(HEADING_SM, "text-gold/80")}>Cashier</p>
          <h1 className={cn("font-display mt-1 text-3xl font-bold uppercase tracking-wider sm:text-4xl", GOLD_TEXT)}>
            Wallet
          </h1>
        </header>

        <section
          className={cn(
            GLASS_PANEL,
            "relative mb-6 overflow-hidden p-6 sm:p-8",
          )}
        >
          <div
            className="pointer-events-none absolute inset-0 opacity-70"
            style={{
              background:
                "radial-gradient(120% 140% at 85% 0%, rgba(212,175,55,0.10), transparent 55%), radial-gradient(120% 140% at 0% 100%, rgba(129,236,255,0.08), transparent 55%)",
            }}
          />
          <div className="relative flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className={cn(HEADING_SM, "text-neutral-400")}>Total Balance</p>
              <p className="font-display mt-2 text-5xl font-bold tabular-nums tracking-tight text-foreground sm:text-6xl">
                {loading ? (
                  <span className="text-neutral-600">— — —</span>
                ) : (
                  usd(balance)
                )}
              </p>
              <p className="mt-2 text-xs text-neutral-500">
                {sub ? (
                  <>
                    <span className="text-gold">{sub.tier.name}</span> membership ·{" "}
                    {limits && limits.deposit_limit_daily_cents > 0
                      ? `${usdCompact(limits.deposit_limit_daily_cents)}/day deposit · ${usdCompact(
                          limits.withdraw_limit_weekly_cents,
                        )}/wk withdraw`
                      : "Real-money deposits require a paid membership"}
                  </>
                ) : (
                  "Loading membership limits…"
                )}
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void loadCore()}
              className="shrink-0"
            >
              Refresh
            </Button>
          </div>
        </section>

        {/* Claimable strip */}
        <section className="mb-6 grid gap-4 md:grid-cols-2">
          <ClaimCard
            eyebrow="Daily Bonus"
            title={bonus ? `${bonus.chips.toLocaleString()} chips` : "—"}
            subtitle={
              bonus
                ? bonus.can_claim
                  ? `Streak: ${bonus.streak} day${bonus.streak === 1 ? "" : "s"} · ready now`
                  : bonus.next_claim_at
                    ? `Next in ${relTime(bonus.next_claim_at).replace(" ago", "")} · streak ${bonus.streak}`
                    : `Streak ${bonus.streak}`
                : "Loading…"
            }
            actionLabel={claimingBonus ? "Claiming…" : "Claim Bonus"}
            disabled={!bonus?.can_claim || claimingBonus}
            onAction={claimBonus}
          />
          <ClaimCard
            eyebrow="Rakeback"
            title={rakeback ? usd(rakeback.balance_cents) : "—"}
            subtitle={
              rakeback
                ? `${rakeback.percent}% tier rate · ${usd(rakeback.lifetime_cents)} lifetime`
                : "Loading…"
            }
            actionLabel={claimingRake ? "Claiming…" : "Claim to Wallet"}
            disabled={!rakeback || rakeback.balance_cents <= 0 || claimingRake}
            onAction={claimRakeback}
          />
        </section>

        {/* Cashier: deposit + withdraw */}
        <section className="mb-6 grid gap-4 lg:grid-cols-2">
          <DepositPanel
            canFiat={canDepositFiat}
            dailyLimitCents={limits?.deposit_limit_daily_cents ?? 0}
            notify={notify}
          />
          <WithdrawPanel
            canWithdraw={canWithdraw}
            weeklyLimitCents={limits?.withdraw_limit_weekly_cents ?? 0}
            withdrawals={withdrawals}
            notify={notify}
            onDone={loadCore}
          />
        </section>

        {/* Buckets + transfer */}
        <section className="mb-6">
          <BucketsPanel buckets={buckets} notify={notify} onDone={loadCore} />
        </section>

        {/* Ledger */}
        <section>
          <LedgerPanel entries={ledger} loading={loading} />
        </section>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function ClaimCard({
  eyebrow,
  title,
  subtitle,
  actionLabel,
  disabled,
  onAction,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
  actionLabel: string;
  disabled: boolean;
  onAction: () => void;
}) {
  return (
    <div className={cn(GLASS_PANEL, GLASS_PANEL_HOVER, "flex items-center justify-between gap-4 p-5")}>
      <div className="min-w-0">
        <p className={cn(HEADING_SM, "text-cyan/70")}>{eyebrow}</p>
        <p className="font-display mt-1.5 truncate text-2xl font-bold tabular-nums text-foreground">
          {title}
        </p>
        <p className="mt-1 truncate text-xs text-neutral-500">{subtitle}</p>
      </div>
      <Button onClick={onAction} disabled={disabled} size="sm" className="shrink-0">
        {actionLabel}
      </Button>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function DepositPanel({
  canFiat,
  dailyLimitCents,
  notify,
}: {
  canFiat: boolean;
  dailyLimitCents: number;
  notify: (msg: string, kind?: "ok" | "err") => void;
}) {
  const [method, setMethod] = useState<"crypto" | "fiat">("crypto");
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = () =>
    void (async () => {
      const cents = dollarsToCents(amount);
      if (cents === null || cents < 500) {
        notify("Minimum deposit is $5.00", "err");
        return;
      }
      setBusy(true);
      try {
        const res =
          method === "crypto"
            ? await walletApi.depositCrypto(cents)
            : await walletApi.depositFiat(cents);
        if (!res.configured) {
          notify(res.message ?? "This deposit method isn't configured yet.", "err");
          return;
        }
        const url = res.invoice_url ?? res.checkout_url;
        if (url) {
          notify("Opening secure payment page…");
          window.open(url, "_blank", "noopener,noreferrer");
          setAmount("");
        } else {
          notify("Deposit created.");
        }
      } catch (e) {
        notify(e instanceof Error ? e.message : "Deposit failed", "err");
      } finally {
        setBusy(false);
      }
    })();

  const fiatBlocked = method === "fiat" && !canFiat;

  return (
    <div className={cn(GLASS_PANEL, "p-5")}>
      <div className="mb-4 flex items-center justify-between">
        <p className={cn(HEADING_SM, "text-gold/80")}>Add Funds</p>
        <div className="flex gap-1 rounded-xl border border-white/10 bg-black/30 p-1">
          {(["crypto", "fiat"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMethod(m)}
              className={cn(
                "rounded-lg px-3 py-1 text-xs font-semibold uppercase tracking-wide transition",
                method === m
                  ? "bg-cyan/15 text-cyan shadow-[0_0_16px_rgba(129,236,255,0.15)]"
                  : "text-neutral-400 hover:text-white",
              )}
            >
              {m === "crypto" ? "Crypto" : "Card"}
            </button>
          ))}
        </div>
      </div>

      <Field label="Amount (USD)" hint="Minimum $5.00 · credited when the payment confirms">
        <Input
          inputMode="decimal"
          placeholder="100.00"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !busy && !fiatBlocked) submit();
          }}
        />
      </Field>

      <div className="mt-3 flex flex-wrap gap-2">
        {[25, 50, 100, 250].map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => setAmount(String(v))}
            className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-neutral-300 transition hover:border-cyan/40 hover:text-cyan"
          >
            ${v}
          </button>
        ))}
      </div>

      {fiatBlocked && (
        <p className="mt-3 text-xs text-amber-300/80">
          Card deposits require identity verification. Crypto deposits are available now.
        </p>
      )}
      {dailyLimitCents <= 0 && (
        <p className="mt-3 text-xs text-amber-300/80">
          Real-money deposits require a paid membership tier.
        </p>
      )}

      <Button
        onClick={submit}
        disabled={busy || fiatBlocked}
        className="mt-4 w-full"
      >
        {busy ? "Starting…" : method === "crypto" ? "Deposit with Crypto" : "Deposit with Card"}
      </Button>
    </div>
  );
}

/* ------------------------------------------------------------------ */

const WITHDRAW_STATUS_TONE: Record<string, string> = {
  pending: "text-amber-300 border-amber-500/30 bg-amber-500/5",
  paid: "text-emerald-300 border-emerald-500/30 bg-emerald-500/5",
  approved: "text-emerald-300 border-emerald-500/30 bg-emerald-500/5",
  rejected: "text-red-300 border-red-500/30 bg-red-500/5",
};

function WithdrawPanel({
  canWithdraw,
  weeklyLimitCents,
  withdrawals,
  notify,
  onDone,
}: {
  canWithdraw: boolean;
  weeklyLimitCents: number;
  withdrawals: Withdrawal[];
  notify: (msg: string, kind?: "ok" | "err") => void;
  onDone: () => Promise<void>;
}) {
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("usd");
  const [destination, setDestination] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = () =>
    void (async () => {
      const cents = dollarsToCents(amount);
      if (cents === null || cents < 500) {
        notify("Minimum withdrawal is $5.00", "err");
        return;
      }
      if (destination.trim() === "") {
        notify("A payout destination is required.", "err");
        return;
      }
      setBusy(true);
      try {
        const res = await walletApi.withdraw(cents, destination.trim(), currency);
        notify(`Withdrawal ${res.status} — ${usd(cents)} held for payout.`);
        setAmount("");
        setDestination("");
        await onDone();
      } catch (e) {
        notify(e instanceof Error ? e.message : "Withdrawal failed", "err");
      } finally {
        setBusy(false);
      }
    })();

  return (
    <div className={cn(GLASS_PANEL, "p-5")}>
      <p className={cn(HEADING_SM, "mb-4 text-gold/80")}>Withdraw</p>

      {!canWithdraw ? (
        <p className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 text-xs text-amber-200/90">
          Withdrawals require KYC/AML identity verification. Complete verification to
          request a payout.
        </p>
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Amount (USD)">
              <Input
                inputMode="decimal"
                placeholder="50.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </Field>
            <Field label="Payout Rail">
              <Select value={currency} onChange={(e) => setCurrency(e.target.value)}>
                <option value="usd">Manual / Bank (USD)</option>
                <option value="btc">Bitcoin (BTC)</option>
                <option value="eth">Ethereum (ETH)</option>
                <option value="usdttrc20">USDT (TRC-20)</option>
                <option value="ltc">Litecoin (LTC)</option>
              </Select>
            </Field>
          </div>
          <Field
            label="Destination"
            hint={
              currency === "usd"
                ? "Bank / payout reference the operator will use"
                : "Wallet address for the selected coin"
            }
          >
            <Input
              placeholder={currency === "usd" ? "Bank reference…" : "Wallet address…"}
              value={destination}
              onChange={(e) => setDestination(e.target.value)}
            />
          </Field>
          {weeklyLimitCents > 0 && (
            <p className="text-[11px] text-neutral-500">
              Weekly limit: {usdCompact(weeklyLimitCents)}
            </p>
          )}
          <Button onClick={submit} disabled={busy} variant="outline" className="w-full">
            {busy ? "Requesting…" : "Request Withdrawal"}
          </Button>
        </div>
      )}

      {withdrawals.length > 0 && (
        <div className="mt-5 space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500">
            Recent Requests
          </p>
          {withdrawals.slice(0, 5).map((w) => (
            <div
              key={w.id}
              className="flex items-center justify-between rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2 text-xs"
            >
              <div className="min-w-0">
                <span className="font-semibold tabular-nums text-foreground">
                  {usd(w.amount_cents)}
                </span>
                <span className="ml-2 truncate text-neutral-500">
                  {w.currency.toUpperCase()} · {w.destination}
                </span>
              </div>
              <span
                className={cn(
                  "shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                  WITHDRAW_STATUS_TONE[w.status] ??
                    "border-white/15 bg-white/5 text-neutral-300",
                )}
              >
                {w.status}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */

function BucketsPanel({
  buckets,
  notify,
  onDone,
}: {
  buckets: BucketBalance[];
  notify: (msg: string, kind?: "ok" | "err") => void;
  onDone: () => Promise<void>;
}) {
  const [from, setFrom] = useState("main");
  const [to, setTo] = useState("cash_game");
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);

  const options = useMemo(
    () =>
      buckets.length > 0
        ? buckets.map((b) => b.bucket)
        : ["main", "cash_game", "sng", "tournament", "bonus"],
    [buckets],
  );

  const transfer = () =>
    void (async () => {
      const cents = dollarsToCents(amount);
      if (cents === null || cents <= 0) {
        notify("Enter a positive amount.", "err");
        return;
      }
      if (from === to) {
        notify("Choose two different buckets.", "err");
        return;
      }
      setBusy(true);
      try {
        await walletApi.transfer(from, to, cents);
        notify(`Moved ${usd(cents)} from ${bucketLabel(from)} to ${bucketLabel(to)}.`);
        setAmount("");
        await onDone();
      } catch (e) {
        notify(e instanceof Error ? e.message : "Transfer failed", "err");
      } finally {
        setBusy(false);
      }
    })();

  return (
    <div className={cn(GLASS_PANEL, "p-5")}>
      <div className="mb-4 flex items-center justify-between">
        <p className={cn(HEADING_SM, "text-gold/80")}>Balance Buckets</p>
        <span className="text-[11px] text-neutral-500">Move funds between play pools</span>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {options.map((name) => {
          const b = buckets.find((x) => x.bucket === name);
          return (
            <div
              key={name}
              className={cn(
                "rounded-xl border border-white/[0.06] bg-white/[0.02] p-3",
                GLASS_PANEL_HOVER,
              )}
            >
              <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500">
                {bucketLabel(name)}
              </p>
              <p className="font-display mt-1 text-lg font-bold tabular-nums text-foreground">
                {usd(b?.balance ?? 0)}
              </p>
            </div>
          );
        })}
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end">
        <Field label="From">
          <Select value={from} onChange={(e) => setFrom(e.target.value)}>
            {options.map((o) => (
              <option key={o} value={o}>
                {bucketLabel(o)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="To">
          <Select value={to} onChange={(e) => setTo(e.target.value)}>
            {options.map((o) => (
              <option key={o} value={o}>
                {bucketLabel(o)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Amount (USD)">
          <Input
            inputMode="decimal"
            placeholder="0.00"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !busy) transfer();
            }}
          />
        </Field>
        <Button onClick={transfer} disabled={busy} className="h-[42px]">
          {busy ? "Moving…" : "Transfer"}
        </Button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function LedgerPanel({ entries, loading }: { entries: LedgerEntry[]; loading: boolean }) {
  return (
    <div className={cn(GLASS_PANEL, "p-5")}>
      <p className={cn(HEADING_SM, "mb-4 text-gold/80")}>Transaction Ledger</p>

      {loading ? (
        <p className="py-10 text-center text-sm text-neutral-600">Loading ledger…</p>
      ) : entries.length === 0 ? (
        <p className="py-10 text-center text-sm text-neutral-600">
          No wallet movements yet. Deposits, winnings, and claims will appear here.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-white/10 text-left text-[11px] uppercase tracking-wider text-neutral-500">
                <th className="pb-2 font-semibold">Activity</th>
                <th className="pb-2 text-right font-semibold">Amount</th>
                <th className="pb-2 text-right font-semibold">Balance</th>
                <th className="pb-2 text-right font-semibold">When</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => {
                const credit = e.delta >= 0;
                return (
                  <tr
                    key={e.id}
                    className="border-b border-white/[0.04] last:border-0 hover:bg-white/[0.02]"
                  >
                    <td className="py-2.5 pr-3 text-neutral-200">
                      {humanizeReason(e.reason)}
                    </td>
                    <td
                      className={cn(
                        "py-2.5 text-right font-semibold tabular-nums",
                        credit ? "text-emerald-300" : "text-red-300",
                      )}
                    >
                      {credit ? "+" : "-"}
                      {usd(Math.abs(e.delta))}
                    </td>
                    <td className="py-2.5 text-right tabular-nums text-neutral-400">
                      {usd(e.balance_after)}
                    </td>
                    <td className="py-2.5 text-right text-xs text-neutral-500">
                      {relTime(e.created_at)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
