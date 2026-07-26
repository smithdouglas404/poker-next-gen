"use client";

// The real "Add funds" panel, lifted out of app/wallet/page.tsx so it can be
// mounted wherever a player runs short of money — the wallet page, the profile's
// Wallet tab, and the table's buy-in dialog — instead of only existing at the
// end of a separate route. Same component, same RPCs, one implementation.

import { useState } from "react";

import { Button, Field, Input } from "@/features/ui";
import { GLASS_PANEL, HEADING_SM, cn } from "@/features/ui/tokens";
import { dollarsToCents, walletApi } from "./walletRpc";

export function DepositPanel({
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
        <p className={cn(HEADING_SM, "text-muted")}>Add Funds</p>
        <div className="flex gap-1 rounded-xl border border-white/10 bg-black/30 p-1">
          {(["crypto", "fiat"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMethod(m)}
              className={cn(
                "rounded-lg px-3 py-1 text-xs font-semibold uppercase tracking-wide transition",
                method === m
                  ? "bg-[#e01e2b]/15 text-[#ff2d3f]"
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
            className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-neutral-300 transition hover:border-[#e01e2b]/40 hover:text-white"
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
