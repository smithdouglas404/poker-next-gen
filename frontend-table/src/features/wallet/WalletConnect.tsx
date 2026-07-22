"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { Button, Field, Input, Select } from "@/features/ui";
import { BTN_GOLD, GLASS_PANEL, GLASS_PANEL_HOVER, HEADING_SM, STATUS_CHIP, cn } from "@/features/ui/tokens";
import { dollarsToCents, usd, walletApi, type BucketBalance } from "@/features/wallet/walletRpc";
import {
  WALLET_PROVIDERS,
  connectWallet,
  loadConnections,
  providerDef,
  removeConnection,
  saveConnection,
  shortAddress,
  type ConnectionMap,
  type WalletProviderId,
} from "@/features/wallet/walletConnect";

/* ------------------------------------------------------------------ */
/* Brand logo marks — inline SVG, exempt from the palette (they are     */
/* third-party brand identities, not themed UI surfaces).               */
/* ------------------------------------------------------------------ */

function WalletLogo({ id, className }: { id: WalletProviderId; className?: string }) {
  const common = { className: cn("h-9 w-9 shrink-0", className), viewBox: "0 0 40 40" } as const;
  switch (id) {
    case "metamask":
      return (
        <svg {...common} aria-hidden fill="none">
          <rect width="40" height="40" rx="10" fill="#1c1712" />
          <path d="M30.5 9.5 21.7 16l1.7-4 7.1-2.5Z" fill="#e2761b" />
          <path d="M9.5 9.5 18.2 16l-1.6-4-7.1-2.5Z" fill="#e4761b" />
          <path d="m27.4 24.7-2.3 3.6 5 1.4 1.4-4.9-4.1-.1Z" fill="#e4761b" />
          <path d="m8.5 24.8 1.4 4.9 5-1.4-2.3-3.6-4.1.1Z" fill="#e4761b" />
          <path d="m14.6 18.6-1.4 2.1 4.9.2-.2-5.3-3.3 3Z" fill="#f6851b" />
          <path d="m25.4 18.6-3.4-3.1-.1 5.4 4.9-.2-1.4-2.1Z" fill="#f6851b" />
          <path d="m14.9 28.3 3-1.4-2.6-2-.4 3.4Z" fill="#c0ad9e" />
          <path d="m22.1 26.9 3 1.4-.4-3.4-2.6 2Z" fill="#c0ad9e" />
        </svg>
      );
    case "coinbase":
      return (
        <svg {...common} aria-hidden fill="none">
          <rect width="40" height="40" rx="20" fill="#0052ff" />
          <path
            d="M20 11a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm-2.6 6.9c0-.5.4-.9.9-.9h3.4c.5 0 .9.4.9.9v4.2c0 .5-.4.9-.9.9h-3.4a.9.9 0 0 1-.9-.9v-4.2Z"
            fill="#fff"
          />
        </svg>
      );
    case "walletconnect":
      return (
        <svg {...common} aria-hidden fill="none">
          <rect width="40" height="40" rx="10" fill="#0b141f" />
          <path
            d="M13 17.2c3.9-3.8 10.1-3.8 14 0l.5.5c.2.2.2.5 0 .7l-1.6 1.6a.25.25 0 0 1-.35 0l-.65-.65c-2.7-2.65-7.1-2.65-9.8 0l-.7.7a.25.25 0 0 1-.35 0l-1.6-1.6a.5.5 0 0 1 0-.7l.5-.55Zm17.3 3.2 1.45 1.4c.2.2.2.5 0 .7l-6.55 6.4a.5.5 0 0 1-.7 0l-4.65-4.55a.13.13 0 0 0-.18 0l-4.65 4.55a.5.5 0 0 1-.7 0l-6.55-6.4a.5.5 0 0 1 0-.7l1.45-1.4a.5.5 0 0 1 .7 0l4.65 4.55c.05.05.13.05.18 0l4.65-4.55a.5.5 0 0 1 .7 0l4.65 4.55c.05.05.13.05.18 0l4.65-4.55a.5.5 0 0 1 .7 0Z"
            fill="#3b99fc"
          />
        </svg>
      );
    case "phantom":
      return (
        <svg {...common} aria-hidden fill="none">
          <rect width="40" height="40" rx="10" fill="#4b3ba8" />
          <path
            d="M29.5 20c0 4.7-4.3 8.5-9.6 8.5-4.6 0-8.4-2.9-9.3-6.8-.2-.7.4-1.2 1-1.2h2.8c.5 0 .9.3 1.1.7.6 1.2 1.9 2.1 3.4 2.1 2.1 0 3.8-1.6 3.8-3.6 0-.3.3-.6.6-.6h1.9c.3 0 .6.3.6.6 0 .5-.1 1-.2 1.4h1.9c.4 0 .7-.3.7-.7v-.7c0-3.7-3.4-6.6-7.4-6.5-3.9.1-7 3.2-7 6.9 0 .4-.3.7-.7.7h-2c-.4 0-.7-.3-.7-.7 0-5.5 4.7-9.9 10.5-9.8 5.6.1 10 4.3 10 9.4v.2c-.1.1-.1.2-.1.4Z"
            fill="#fff"
          />
          <circle cx="17.5" cy="19.5" r="1.2" fill="#4b3ba8" />
          <circle cx="21.5" cy="19.5" r="1.2" fill="#4b3ba8" />
        </svg>
      );
  }
}

/* ------------------------------------------------------------------ */

interface Props {
  /** Total wallet balance in cents, from wallet_get (shown as linked balance). */
  balanceCents: number | null;
  /** Bucket balances from wallet_balances. */
  buckets: BucketBalance[];
  notify: (msg: string, kind?: "ok" | "err") => void;
  /** Refresh the parent page's wallet data after a deposit/withdraw. */
  onDone: () => Promise<void>;
}

export function WalletConnect({ balanceCents, buckets, notify, onDone }: Props) {
  const [conns, setConns] = useState<ConnectionMap>({});
  const [connecting, setConnecting] = useState<WalletProviderId | null>(null);
  const [active, setActive] = useState<WalletProviderId | null>(null);

  useEffect(() => {
    const loaded = loadConnections();
    setConns(loaded);
    const first = WALLET_PROVIDERS.find((p) => loaded[p.id])?.id ?? null;
    setActive(first);
  }, []);

  const connectedIds = useMemo(
    () => WALLET_PROVIDERS.filter((p) => conns[p.id]).map((p) => p.id),
    [conns],
  );

  const connect = useCallback(
    (id: WalletProviderId) =>
      void (async () => {
        setConnecting(id);
        try {
          const { address, demo } = await connectWallet(id);
          const map = saveConnection(id, { address, demo, connectedAt: Date.now() });
          setConns(map);
          setActive(id);
          notify(
            demo
              ? `${providerDef(id).name} linked (demo address — install the extension to link on-chain).`
              : `${providerDef(id).name} connected · ${shortAddress(address)}`,
            "ok",
          );
        } catch (e) {
          notify(e instanceof Error ? e.message : "Wallet connection failed", "err");
        } finally {
          setConnecting(null);
        }
      })(),
    [notify],
  );

  const disconnect = useCallback(
    (id: WalletProviderId) => {
      const map = removeConnection(id);
      setConns(map);
      setActive((cur) => (cur === id ? WALLET_PROVIDERS.find((p) => map[p.id])?.id ?? null : cur));
      notify(`${providerDef(id).name} disconnected.`);
    },
    [notify],
  );

  const copy = useCallback(
    (addr: string) => {
      void navigator.clipboard?.writeText(addr).then(
        () => notify("Address copied."),
        () => notify("Copy failed.", "err"),
      );
    },
    [notify],
  );

  const activeConn = active ? conns[active] : undefined;
  const activeDef = active ? providerDef(active) : null;

  return (
    <div className={cn(GLASS_PANEL, "p-5 sm:p-6")}>
      {/* Header */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className={cn(HEADING_SM, "text-muted")}>Wallet Connection</p>
          <p className="mt-1 text-sm text-neutral-400">
            Link an external crypto wallet to deposit and withdraw on-chain.
          </p>
        </div>
        {connectedIds.length > 0 && (
          <span className={cn(STATUS_CHIP, "border border-[#22c55e]/30 bg-[#22c55e]/10 text-[#22c55e]")}>
            <span className="h-1.5 w-1.5 rounded-full bg-[#22c55e]" />
            {connectedIds.length} linked
          </span>
        )}
      </div>

      {/* Provider grid — matches master's 2×2 connect layout */}
      <div className="grid gap-4 sm:grid-cols-2">
        {WALLET_PROVIDERS.map((p) => {
          const conn = conns[p.id];
          const isConnecting = connecting === p.id;
          return (
            <div
              key={p.id}
              className={cn(
                "rounded-xl border p-4",
                conn
                  ? "border-[#22c55e]/25 bg-[#22c55e]/[0.04]"
                  : cn("border-white/[0.07] bg-white/[0.02]", GLASS_PANEL_HOVER),
              )}
            >
              <div className="flex items-center gap-3">
                <WalletLogo id={p.id} />
                <div className="min-w-0">
                  <p className="truncate font-display text-base font-bold text-foreground">{p.name}</p>
                  <p className="truncate text-[11px] text-neutral-500">{p.tagline}</p>
                </div>
                {conn && (
                  <span
                    className={cn(
                      STATUS_CHIP,
                      "ml-auto border border-[#22c55e]/30 bg-[#22c55e]/10 text-[#22c55e]",
                    )}
                  >
                    Connected
                  </span>
                )}
              </div>

              {conn ? (
                <div className="mt-4 space-y-3">
                  <button
                    type="button"
                    onClick={() => copy(conn.address)}
                    title="Copy address"
                    className="flex w-full items-center justify-between gap-2 rounded-lg border border-white/10 bg-black/40 px-3 py-2 font-mono text-xs text-neutral-300 transition hover:border-white/20"
                  >
                    <span className="truncate">{shortAddress(conn.address)}</span>
                    <span className="shrink-0 text-neutral-500">Copy</span>
                  </button>
                  <div className="flex items-center justify-between">
                    {conn.demo ? (
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-[#f5c518]">
                        Demo link
                      </span>
                    ) : (
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-[#22c55e]">
                        On-chain
                      </span>
                    )}
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => setActive(p.id)}
                        className={cn(
                          "text-[11px] font-bold uppercase tracking-wider transition",
                          active === p.id
                            ? "text-[#e01e2b]"
                            : "text-neutral-400 hover:text-white",
                        )}
                      >
                        {active === p.id ? "Active" : "Use"}
                      </button>
                      <button
                        type="button"
                        onClick={() => disconnect(p.id)}
                        className="text-[11px] font-bold uppercase tracking-wider text-neutral-500 transition hover:text-[#ff2d3f]"
                      >
                        Disconnect
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => connect(p.id)}
                  disabled={isConnecting}
                  className={cn(
                    BTN_GOLD,
                    "mt-4 w-full rounded-lg px-4 py-2.5 text-sm uppercase tracking-wider disabled:opacity-60",
                  )}
                >
                  {isConnecting ? "Connecting…" : "Connect"}
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Connected: linked balance + deposit / withdraw entry (wired to RPCs) */}
      {activeConn && activeDef && (
        <ConnectedActions
          providerId={activeDef.id}
          address={activeConn.address}
          payoutCurrency={activeDef.payoutCurrency}
          balanceCents={balanceCents}
          buckets={buckets}
          notify={notify}
          onDone={onDone}
        />
      )}

      {/* Security note — matches master's gold-accented footer */}
      <div className="mt-5 rounded-xl border border-[#f5c518]/20 bg-[#f5c518]/[0.04] p-4">
        <p className="text-sm leading-relaxed text-neutral-300">
          <span className="font-semibold text-[#f5c518]">Security Note:</span> High Rollers Club only
          requests signature permissions. We never access your private keys or seed phrases.{" "}
          <span className="font-semibold text-[#f5c518]">Connect securely.</span>
        </p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function ConnectedActions({
  providerId,
  address,
  payoutCurrency,
  balanceCents,
  buckets,
  notify,
  onDone,
}: {
  providerId: WalletProviderId;
  address: string;
  payoutCurrency: string;
  balanceCents: number | null;
  buckets: BucketBalance[];
  notify: (msg: string, kind?: "ok" | "err") => void;
  onDone: () => Promise<void>;
}) {
  const [mode, setMode] = useState<"deposit" | "withdraw">("deposit");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState(payoutCurrency);
  const [busy, setBusy] = useState(false);

  // Reset the payout coin default when switching to a different linked wallet.
  useEffect(() => {
    setCurrency(payoutCurrency);
  }, [payoutCurrency, providerId]);

  const mainBucket = buckets.find((b) => b.bucket === "main");

  const submit = () =>
    void (async () => {
      const cents = dollarsToCents(amount);
      if (cents === null || cents < 500) {
        notify(`Minimum ${mode} is $5.00`, "err");
        return;
      }
      setBusy(true);
      try {
        if (mode === "deposit") {
          const res = await walletApi.depositCrypto(cents);
          if (!res.configured) {
            notify(res.message ?? "Crypto deposits aren't configured yet.", "err");
            return;
          }
          const url = res.invoice_url ?? res.checkout_url;
          if (url) {
            notify("Opening secure crypto payment page…");
            window.open(url, "_blank", "noopener,noreferrer");
          } else {
            notify("Deposit created.");
          }
          setAmount("");
        } else {
          const res = await walletApi.withdraw(cents, address, currency);
          notify(`Withdrawal ${res.status} — ${usd(cents)} to ${shortAddress(address)}.`);
          setAmount("");
          await onDone();
        }
      } catch (e) {
        notify(e instanceof Error ? e.message : `${mode} failed`, "err");
      } finally {
        setBusy(false);
      }
    })();

  return (
    <div className="mt-5 rounded-xl border border-white/[0.07] bg-black/20 p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-neutral-500">
            Linked Wallet Balance
          </p>
          <p className="font-display mt-1 text-2xl font-bold tabular-nums text-foreground">
            {balanceCents === null ? "—" : usd(balanceCents)}
          </p>
          {mainBucket && (
            <p className="mt-0.5 text-[11px] text-neutral-500">
              {usd(mainBucket.balance)} in Main · {providerDef(providerId).name}
            </p>
          )}
        </div>
        <div className="flex gap-1 rounded-xl border border-white/10 bg-black/40 p-1">
          {(["deposit", "withdraw"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={cn(
                "rounded-lg px-3 py-1.5 text-xs font-semibold uppercase tracking-wide transition",
                mode === m
                  ? m === "deposit"
                    ? "bg-[#22c55e]/15 text-[#22c55e]"
                    : "bg-[#e01e2b]/15 text-[#ff2d3f]"
                  : "text-neutral-400 hover:text-white",
              )}
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Amount (USD)" hint="Minimum $5.00">
            <Input
              inputMode="decimal"
              placeholder={mode === "deposit" ? "100.00" : "50.00"}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !busy) submit();
              }}
            />
          </Field>
          {mode === "withdraw" ? (
            <Field label="Payout Coin">
              <Select value={currency} onChange={(e) => setCurrency(e.target.value)}>
                <option value="eth">Ethereum (ETH)</option>
                <option value="btc">Bitcoin (BTC)</option>
                <option value="usdttrc20">USDT (TRC-20)</option>
                <option value="ltc">Litecoin (LTC)</option>
              </Select>
            </Field>
          ) : (
            <Field label="Destination">
              <Input value={shortAddress(address)} readOnly className="font-mono text-neutral-400" />
            </Field>
          )}
        </div>
        <Button
          onClick={submit}
          disabled={busy}
          variant={mode === "deposit" ? "green" : "primary"}
          className="h-[42px] whitespace-nowrap"
        >
          {busy
            ? mode === "deposit"
              ? "Starting…"
              : "Requesting…"
            : mode === "deposit"
              ? "Deposit Crypto"
              : "Withdraw to Wallet"}
        </Button>
      </div>
      {mode === "withdraw" && (
        <p className="mt-2 text-[11px] text-neutral-500">
          Payout sent to your connected {providerDef(providerId).name} address.
        </p>
      )}
    </div>
  );
}
