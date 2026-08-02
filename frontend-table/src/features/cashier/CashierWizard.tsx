"use client";
// ── Cashier Wizard ───────────────────────────────────────────────────────────
// Multi-step cashier: Deposit (Crypto/Card), Withdraw, Transaction History.
// Premium step-by-step UI with method selection, amount input, and confirmation.
import { useState } from "react";
import { GLASS_PANEL, cn } from "@/features/ui/tokens";

type Mode = "deposit" | "withdraw" | "history";
type DepositMethod = "crypto" | "card" | "bank";
type Step = "method" | "amount" | "confirm" | "done";

const DEMO_TRANSACTIONS = [
  { id: "tx1", type: "deposit",  method: "Crypto (USDT)", amount: 500,   status: "confirmed", date: "Today 18:32",    hash: "0x3f4a…8b2c" },
  { id: "tx2", type: "withdraw", method: "Crypto (BTC)",  amount: 1200,  status: "pending",   date: "Today 14:15",    hash: "0x7e2d…4f1a" },
  { id: "tx3", type: "deposit",  method: "Card (Visa)",   amount: 200,   status: "confirmed", date: "Yesterday",      hash: "—" },
  { id: "tx4", type: "deposit",  method: "Crypto (ETH)",  amount: 800,   status: "confirmed", date: "2 days ago",     hash: "0x1b9c…3d7e" },
  { id: "tx5", type: "withdraw", method: "Bank Wire",     amount: 3000,  status: "confirmed", date: "3 days ago",     hash: "—" },
  { id: "tx6", type: "deposit",  method: "Card (MC)",     amount: 100,   status: "failed",    date: "4 days ago",     hash: "—" },
];

const CRYPTO_OPTIONS = [
  { id: "usdt", label: "USDT (TRC-20)", icon: "₮", fee: "0%",    min: 10 },
  { id: "btc",  label: "Bitcoin",       icon: "₿", fee: "0%",    min: 20 },
  { id: "eth",  label: "Ethereum",      icon: "Ξ", fee: "0%",    min: 20 },
  { id: "sol",  label: "Solana",        icon: "◎", fee: "0%",    min: 10 },
];

const QUICK_AMOUNTS = [50, 100, 200, 500, 1000, 2000];

function StepIndicator({ step, steps }: { step: number; steps: string[] }) {
  return (
    <div className="flex items-center gap-0">
      {steps.map((label, i) => (
        <div key={label} className="flex items-center">
          <div className="flex flex-col items-center gap-1">
            <div
              className={cn(
                "flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold transition-all",
                i < step  ? "bg-[#22c55e] text-white" :
                i === step ? "bg-[#f5c518] text-black" :
                "border border-white/20 text-neutral-500",
              )}
            >
              {i < step ? "✓" : i + 1}
            </div>
            <span className={cn("text-[10px] font-semibold uppercase tracking-wide", i === step ? "text-[#f5c518]" : "text-neutral-600")}>
              {label}
            </span>
          </div>
          {i < steps.length - 1 && (
            <div className={cn("mx-2 mb-4 h-px w-8 transition-all", i < step ? "bg-[#22c55e]" : "bg-white/10")} />
          )}
        </div>
      ))}
    </div>
  );
}

function DepositFlow() {
  const [step, setStep] = useState<Step>("method");
  const [method, setMethod] = useState<DepositMethod>("crypto");
  const [cryptoCoin, setCryptoCoin] = useState("usdt");
  const [amount, setAmount] = useState("");

  const stepIndex = ["method", "amount", "confirm", "done"].indexOf(step);
  const coin = CRYPTO_OPTIONS.find((c) => c.id === cryptoCoin);

  return (
    <div className="space-y-6">
      <StepIndicator step={stepIndex} steps={["Method", "Amount", "Confirm", "Done"]} />

      {step === "method" && (
        <div className="space-y-4">
          <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-neutral-500">Select Deposit Method</p>
          <div className="grid gap-3 sm:grid-cols-3">
            {(["crypto", "card", "bank"] as DepositMethod[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMethod(m)}
                className={cn(
                  "rounded-2xl border p-4 text-left transition-all",
                  method === m
                    ? "border-[#f5c518]/50 bg-[#f5c518]/[0.07] shadow-[0_2px_12px_rgba(245,197,24,0.12)]"
                    : "border-white/[0.07] bg-[#181e27] hover:border-white/[0.14]",
                )}
              >
                <div className="text-2xl mb-2">
                  {m === "crypto" ? "₿" : m === "card" ? "💳" : "🏦"}
                </div>
                <p className="font-semibold text-white capitalize">{m === "bank" ? "Bank Wire" : m === "card" ? "Credit/Debit Card" : "Cryptocurrency"}</p>
                <p className="mt-1 text-[11px] text-neutral-500">
                  {m === "crypto" ? "0% fee · Instant" : m === "card" ? "2.5% fee · Instant" : "0% fee · 1–3 days"}
                </p>
              </button>
            ))}
          </div>
          {method === "crypto" && (
            <div className="space-y-2">
              <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-neutral-500">Select Coin</p>
              <div className="grid gap-2 sm:grid-cols-4">
                {CRYPTO_OPTIONS.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setCryptoCoin(c.id)}
                    className={cn(
                      "rounded-xl border p-3 text-left transition-all",
                      cryptoCoin === c.id
                        ? "border-[#f5c518]/40 bg-[#f5c518]/[0.06]"
                        : "border-white/[0.07] bg-[#181e27] hover:border-white/[0.12]",
                    )}
                  >
                    <span className="text-lg">{c.icon}</span>
                    <p className="mt-1 text-xs font-semibold text-white">{c.label}</p>
                    <p className="text-[10px] text-neutral-500">Min ${c.min}</p>
                  </button>
                ))}
              </div>
            </div>
          )}
          <button
            type="button"
            onClick={() => setStep("amount")}
            className="w-full rounded-xl bg-gradient-to-r from-[#92700a] to-[#f5c518] py-3 text-sm font-bold uppercase tracking-wide text-black shadow-[0_2px_12px_rgba(245,197,24,0.30)] hover:brightness-110 transition"
          >
            Continue →
          </button>
        </div>
      )}

      {step === "amount" && (
        <div className="space-y-4">
          <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-neutral-500">Enter Amount (USD)</p>
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-lg font-bold text-[#f5c518]">$</span>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              className="w-full rounded-xl border border-white/[0.10] bg-[#0f1318]/80 py-4 pl-10 pr-4 text-xl font-bold text-white placeholder:text-neutral-700 outline-none focus:border-[#f5c518]/50 focus:ring-2 focus:ring-[#f5c518]/10"
            />
          </div>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
            {QUICK_AMOUNTS.map((a) => (
              <button
                key={a}
                type="button"
                onClick={() => setAmount(String(a))}
                className={cn(
                  "rounded-xl border py-2 text-sm font-bold transition",
                  amount === String(a)
                    ? "border-[#f5c518]/40 bg-[#f5c518]/10 text-[#f5c518]"
                    : "border-white/[0.07] text-neutral-400 hover:border-white/[0.14] hover:text-white",
                )}
              >
                ${a}
              </button>
            ))}
          </div>
          {method === "crypto" && coin && (
            <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3 text-xs text-neutral-400">
              You will receive approximately <span className="font-semibold text-white">${amount || "0"} USDT</span> equivalent in {coin.label}. Minimum: ${coin.min}.
            </div>
          )}
          <div className="flex gap-3">
            <button type="button" onClick={() => setStep("method")} className="flex-1 rounded-xl border border-white/10 py-3 text-sm font-bold text-neutral-400 hover:text-white transition">
              ← Back
            </button>
            <button
              type="button"
              onClick={() => setStep("confirm")}
              disabled={!amount || Number(amount) < 10}
              className="flex-[2] rounded-xl bg-gradient-to-r from-[#92700a] to-[#f5c518] py-3 text-sm font-bold uppercase tracking-wide text-black shadow-[0_2px_12px_rgba(245,197,24,0.30)] hover:brightness-110 transition disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Review Deposit →
            </button>
          </div>
        </div>
      )}

      {step === "confirm" && (
        <div className="space-y-4">
          <div className={cn(GLASS_PANEL, "p-5 space-y-4")}>
            <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-neutral-500">Confirm Deposit</p>
            {[
              { label: "Method", value: method === "crypto" ? `Crypto (${coin?.label})` : method === "card" ? "Credit/Debit Card" : "Bank Wire" },
              { label: "Amount", value: `$${amount}`, highlight: true },
              { label: "Fee", value: method === "card" ? `$${(Number(amount) * 0.025).toFixed(2)}` : "$0.00" },
              { label: "You receive", value: `$${method === "card" ? (Number(amount) * 0.975).toFixed(2) : amount}`, highlight: true },
            ].map((row) => (
              <div key={row.label} className="flex justify-between border-b border-white/[0.05] pb-3 last:border-0 last:pb-0">
                <span className="text-sm text-neutral-500">{row.label}</span>
                <span className={cn("text-sm font-semibold", row.highlight ? "text-[#f5c518]" : "text-white")}>
                  {row.value}
                </span>
              </div>
            ))}
          </div>
          <div className="flex gap-3">
            <button type="button" onClick={() => setStep("amount")} className="flex-1 rounded-xl border border-white/10 py-3 text-sm font-bold text-neutral-400 hover:text-white transition">
              ← Back
            </button>
            <button
              type="button"
              onClick={() => setStep("done")}
              className="flex-[2] rounded-xl bg-gradient-to-r from-[#92700a] to-[#f5c518] py-3 text-sm font-bold uppercase tracking-wide text-black shadow-[0_2px_12px_rgba(245,197,24,0.30)] hover:brightness-110 transition"
            >
              Confirm & Deposit
            </button>
          </div>
        </div>
      )}

      {step === "done" && (
        <div className="flex flex-col items-center gap-5 py-8 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full border border-[#22c55e]/40 bg-[#22c55e]/10 text-3xl text-[#22c55e]">
            ✓
          </div>
          <div>
            <h3 className="font-display text-xl font-bold text-white">Deposit Initiated</h3>
            <p className="mt-1 text-sm text-neutral-400">
              ${amount} via {method}. Funds will appear in your wallet shortly.
            </p>
          </div>
          <button
            type="button"
            onClick={() => { setStep("method"); setAmount(""); }}
            className="rounded-xl border border-[#f5c518]/30 bg-[#f5c518]/10 px-6 py-2.5 text-sm font-bold text-[#f5c518] hover:bg-[#f5c518]/20 transition"
          >
            Make Another Deposit
          </button>
        </div>
      )}
    </div>
  );
}

function TransactionHistory() {
  return (
    <div className="space-y-3">
      <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-neutral-500">Recent Transactions</p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[500px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-white/[0.07]">
              {["Date", "Type", "Method", "Amount", "Status"].map((h) => (
                <th key={h} className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-[0.20em] text-neutral-500">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {DEMO_TRANSACTIONS.map((tx) => {
              const statusColor = tx.status === "confirmed" ? "#22c55e" : tx.status === "pending" ? "#f5c518" : "#ff4455";
              const typeColor = tx.type === "deposit" ? "#22c55e" : "#f5c518";
              return (
                <tr key={tx.id} className="border-b border-white/[0.04] hover:bg-white/[0.025] transition">
                  <td className="px-4 py-3.5 text-neutral-400 text-xs">{tx.date}</td>
                  <td className="px-4 py-3.5">
                    <span className="text-xs font-bold capitalize" style={{ color: typeColor }}>{tx.type}</span>
                  </td>
                  <td className="px-4 py-3.5 text-neutral-300 text-xs">{tx.method}</td>
                  <td className="px-4 py-3.5 font-display font-bold text-white">${tx.amount.toLocaleString()}</td>
                  <td className="px-4 py-3.5">
                    <span
                      className="rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide capitalize"
                      style={{ color: statusColor, borderColor: `${statusColor}30`, background: `${statusColor}10` }}
                    >
                      {tx.status}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function CashierWizard() {
  const [mode, setMode] = useState<Mode>("deposit");

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h1 className="font-display text-2xl font-bold uppercase tracking-wide text-white">Cashier</h1>
        <p className="mt-0.5 text-xs text-neutral-500">Deposit, withdraw, and track your transactions</p>
      </div>

      {/* Mode tabs */}
      <div className="flex gap-1 rounded-xl border border-white/[0.07] bg-[#181e27] p-1">
        {(["deposit", "withdraw", "history"] as Mode[]).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={cn(
              "flex-1 rounded-lg py-2.5 text-xs font-bold uppercase tracking-wide transition",
              mode === m
                ? m === "deposit" ? "bg-[#22c55e]/10 text-[#22c55e] border border-[#22c55e]/25"
                  : m === "withdraw" ? "bg-[#f5c518]/10 text-[#f5c518] border border-[#f5c518]/25"
                  : "bg-white/[0.06] text-white border border-white/10"
                : "text-neutral-500 hover:text-white",
            )}
          >
            {m === "deposit" ? "↓ Deposit" : m === "withdraw" ? "↑ Withdraw" : "History"}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className={cn(GLASS_PANEL, "p-6")}>
        {mode === "deposit"  && <DepositFlow />}
        {mode === "withdraw" && (
          <div className="py-8 text-center">
            <p className="text-2xl mb-3">↑</p>
            <h3 className="font-display text-lg font-bold text-white">Withdrawal</h3>
            <p className="mt-2 text-sm text-neutral-400">Minimum KYC verification required. Complete your identity verification to enable withdrawals.</p>
            <button type="button" className="mt-4 rounded-xl border border-[#f5c518]/30 bg-[#f5c518]/10 px-6 py-2.5 text-sm font-bold text-[#f5c518] hover:bg-[#f5c518]/20 transition">
              Verify Identity →
            </button>
          </div>
        )}
        {mode === "history" && <TransactionHistory />}
      </div>
    </div>
  );
}
