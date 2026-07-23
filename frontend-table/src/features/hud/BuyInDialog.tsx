"use client";

import { useMemo, useState } from "react";

import { formatCents, useGame } from "@/features/game/GameProvider";
import { GLASS_PANEL, cn } from "@/features/ui/tokens";

// Buy-in dialog (two-wallet model). The player picks which wallet to bring chips
// from — funded Global wallet or the Club-issued balance — and how much, within
// the table's [min, max] band and capped at that wallet's balance. Defaults to
// the table minimum, never the wallet max.

type Wallet = "global" | "club";

export function BuyInDialog({
  seat,
  onClose,
}: {
  seat: number;
  onClose: () => void;
}) {
  const { snapshot, profile, sitDown } = useGame();
  const min = snapshot?.min_buy_in ?? 10000;
  const max = snapshot?.max_buy_in ?? Math.max(min, 30000);
  const isClubTable = Boolean(snapshot?.room_id) && (snapshot?.hero_club_balance ?? 0) >= 0 && snapshot?.accepts_global_wallet !== undefined;
  const clubBalance = snapshot?.hero_club_balance ?? 0;
  const globalBalance = profile.walletCents;
  const acceptsGlobal = snapshot?.accepts_global_wallet ?? true;
  const clubOffered = isClubTable && clubBalance > 0; // club wallet only if the player has a club balance

  const wallets = useMemo<Wallet[]>(() => {
    const list: Wallet[] = [];
    if (acceptsGlobal) list.push("global");
    if (clubOffered) list.push("club");
    return list.length ? list : ["global"];
  }, [acceptsGlobal, clubOffered]);

  const [wallet, setWallet] = useState<Wallet>(wallets[0]);
  const [amount, setAmount] = useState<number>(min); // default to the table minimum
  const [busy, setBusy] = useState(false);

  const walletBalance = wallet === "global" ? globalBalance : clubBalance;
  const overLimit = amount > walletBalance;

  async function confirm() {
    if (overLimit) return; // guarded by the disabled button; never sit over the wallet
    setBusy(true);
    try {
      await sitDown(seat, amount, wallet);
      onClose();
    } finally {
      setBusy(false);
    }
  }

  const walletLabel = (w: Wallet) => (w === "global" ? "Global wallet" : "Club wallet");
  const walletBal = (w: Wallet) => (w === "global" ? globalBalance : clubBalance);

  return (
    <div className="pointer-events-auto fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Buy in">
      <div className={cn(GLASS_PANEL, "w-full max-w-sm p-6")}>
        <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-gold/80">Take seat</p>
        <h2 className="mt-1 text-xl font-semibold text-white">Buy in</h2>
        <p className="mt-1 text-sm text-neutral-400">
          Table range {formatCents(min)}–{formatCents(max)}.
        </p>

        {/* Wallet picker */}
        {wallets.length > 1 && (
          <div className="mt-4 grid grid-cols-2 gap-2">
            {wallets.map((w) => (
              <button
                key={w}
                type="button"
                onClick={() => setWallet(w)}
                className={cn(
                  "rounded-xl border p-3 text-left transition",
                  wallet === w ? "border-gold/60 bg-gold/10" : "border-white/10 bg-white/[0.03] hover:border-white/20",
                )}
              >
                <p className="text-xs font-semibold text-white">{walletLabel(w)}</p>
                <p className="mt-0.5 text-sm font-bold text-green">{formatCents(walletBal(w))}</p>
              </button>
            ))}
          </div>
        )}
        {wallets.length === 1 && (
          <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.03] p-3">
            <p className="text-xs font-semibold text-white">{walletLabel(wallets[0])}</p>
            <p className="mt-0.5 text-sm font-bold text-green">{formatCents(walletBalance)}</p>
          </div>
        )}

        {/* Amount */}
        <label className="mt-4 block text-[11px] font-semibold uppercase tracking-wider text-muted">
          Buy-in amount
        </label>
        <div className="mt-1 flex items-center gap-2">
          <input
            type="range"
            min={min}
            max={max}
            step={Math.max(100, Math.round((max - min) / 100))}
            value={Math.min(max, Math.max(min, amount))}
            onChange={(e) => setAmount(Number(e.target.value))}
            className="flex-1 accent-gold"
          />
          <span className="w-24 text-right text-lg font-bold text-gold">{formatCents(amount)}</span>
        </div>
        <div className="mt-1 flex justify-between text-[10px] text-muted">
          <button type="button" onClick={() => setAmount(min)} className="hover:text-white">Min {formatCents(min)}</button>
          <button type="button" onClick={() => setAmount(Math.min(max, walletBalance))} className="hover:text-white">
            Max in wallet
          </button>
          <button type="button" onClick={() => setAmount(max)} className="hover:text-white">Max {formatCents(max)}</button>
        </div>

        {overLimit && (
          <p className="mt-3 rounded-lg border border-gold/30 bg-gold/[0.06] px-3 py-2 text-xs text-gold">
            That&apos;s {formatCents(amount - walletBalance)} over your {walletLabel(wallet).toLowerCase()} balance. Lower
            the amount to buy in now — buying in above your balance needs admin approval, which isn&apos;t available yet.
          </p>
        )}

        <div className="mt-5 flex gap-3">
          <button
            type="button"
            disabled={busy || amount < min || overLimit}
            onClick={confirm}
            className="flex-1 rounded-full bg-gradient-to-r from-[#9a7b2c] via-gold to-gold-lite px-6 py-2.5 text-sm font-bold uppercase tracking-wider text-black transition hover:shadow-[0_0_22px_rgba(212,175,55,0.35)] disabled:opacity-50"
          >
            {`Buy in ${formatCents(amount)}`}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-white/20 px-5 py-2.5 text-sm font-semibold uppercase tracking-wider text-neutral-300 hover:bg-white/5"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
