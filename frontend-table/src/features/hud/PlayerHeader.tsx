"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";

import { formatCents, useGame } from "@/features/game/GameProvider";
import { MuteToggle } from "@/features/sound/MuteToggle";
import { GLASS_PANEL, cn } from "@/features/ui/tokens";
import { HostPanel } from "@/features/hud/HostPanel";
import { VideoControlBar } from "@/features/hrc/components/VideoOverlay";

// In-game player menu — deliberately narrow. Everything else a player might
// want (account/security, lobby, rewards, sign out) belongs on the main
// /profile hub or the felt's own controls (Exit Table already covers what
// Sign out would have done), not stacked into a menu opened mid-hand. The
// only thing worth surfacing here while seated is money: check the wallet
// and, if the stack is running low, rebuy without standing up.
export function PlayerHeader() {
  const { snapshot, profile, matchId, roomId, connected, addChips } = useGame();
  const demo = useSearchParams().get("demo") === "1";
  const [open, setOpen] = useState(false);
  const [rebuyOpen, setRebuyOpen] = useState(false);
  const [rebuyAmount, setRebuyAmount] = useState(0);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setRebuyOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  // Same table-stakes gate the server enforces on OpAddChips: only offered
  // while seated and NOT still live in a hand in progress.
  const heroSeat = demo
    ? { stack: 750_000, status: "seated" }
    : snapshot?.seats.find((s) => s.user_id === profile.userId && s.status !== "empty");
  const liveInHand =
    !demo && snapshot?.phase !== "waiting" && (heroSeat?.status === "seated" || heroSeat?.status === "all_in");
  const maxBuyIn = demo ? 5_000_000 : (snapshot?.max_buy_in ?? Number.MAX_SAFE_INTEGER);
  const rebuyRoom = heroSeat ? Math.max(0, Math.min(maxBuyIn - heroSeat.stack, profile.walletCents)) : 0;
  const canRebuy = !!heroSeat && !liveInHand && rebuyRoom > 0;

  // Only a CLUB table has a club balance. Same source BuyInDialog reads; null
  // (not 0) when there is no club wallet, so the header shows nothing rather
  // than an invented "$0.00" balance at a table that has no club behind it.
  const clubBalanceCents =
    typeof snapshot?.hero_club_balance === "number" ? snapshot.hero_club_balance : null;

  const isHost = !!snapshot?.host_user_id && snapshot.host_user_id === profile.userId;
  const playerIds = (snapshot?.seats ?? []).filter((s) => s.user_id && !s.is_bot).map((s) => s.user_id!);

  const openRebuy = () => {
    setRebuyAmount(Math.min(rebuyRoom, 50_000));
    setRebuyOpen(true);
  };
  const confirmRebuy = demo
    ? async () => {
        setRebuyOpen(false);
        setOpen(false);
      }
    : async () => {
        await addChips(rebuyAmount || Math.min(rebuyRoom, 50_000));
        setRebuyOpen(false);
        setOpen(false);
      };

  const menuLink =
    "block rounded-lg px-3 py-2 text-sm text-neutral-200 hover:bg-white/[0.06] hover:text-white";

  return (
    <header className="pointer-events-auto flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-white/[0.06] bg-surface px-5 py-2 shadow-[0_2px_12px_rgba(0,0,0,0.4)]">
      <div className="relative" ref={ref}>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-haspopup="menu"
          aria-expanded={open}
          className="flex items-center gap-3 rounded-xl px-1 py-1 transition hover:bg-white/[0.04]"
        >
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-[#ffd54a] to-[#d4a80f] text-lg font-bold text-[#231b00]">
            {profile.username.slice(0, 1).toUpperCase()}
          </div>
          <div className="text-left">
            <p className="text-sm font-semibold text-white">{profile.username}</p>
            <p className="text-xs text-neutral-400">Profile ▾</p>
          </div>
        </button>

        {open && (
          <div
            role="menu"
            className={cn(
              GLASS_PANEL,
              "absolute left-0 top-full z-50 mt-2 w-56 border-white/10 bg-surface-2 p-1.5 shadow-xl",
            )}
          >
            <div className="px-3 py-2">
              <p className="text-[10px] uppercase tracking-wider text-muted">Wallet</p>
              <p className="text-base font-semibold text-green">{formatCents(profile.walletCents)}</p>
            </div>
            <div className="my-1 h-px bg-white/10" />
            <Link href="/wallet" className={menuLink} onClick={() => setOpen(false)}>
              💳 Wallet & deposits
            </Link>
            {canRebuy && !rebuyOpen && (
              <button type="button" onClick={openRebuy} className={cn(menuLink, "w-full text-left text-green")}>
                🔄 Rebuy (add chips to stack)
              </button>
            )}
            {rebuyOpen && (
              <div className="mx-1 mt-1 rounded-lg border border-green/25 bg-black/30 p-2.5">
                <p className="text-[10px] uppercase tracking-wider text-muted">Rebuy</p>
                <p className="mt-0.5 text-sm font-semibold text-green">{formatCents(rebuyAmount)}</p>
                <input
                  type="range"
                  min={100}
                  max={rebuyRoom}
                  step={100}
                  value={Math.min(rebuyAmount, rebuyRoom)}
                  onChange={(e) => setRebuyAmount(Number(e.target.value))}
                  className="mt-2 w-full accent-[#22c55e]"
                />
                <div className="mt-2 flex gap-1.5">
                  <button
                    type="button"
                    onClick={() => void confirmRebuy()}
                    className="flex-1 rounded-lg bg-green px-2 py-1 text-[11px] font-bold uppercase text-black hover:bg-[#2ee670]"
                  >
                    Confirm
                  </button>
                  <button
                    type="button"
                    onClick={() => setRebuyOpen(false)}
                    className="flex-1 rounded-lg border border-white/15 px-2 py-1 text-[11px] font-semibold uppercase text-neutral-300 hover:bg-white/5"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-6">
        {/* A player has TWO balances and this header used to name neither: it
            read "Wallet" over profile.walletCents, which is the GLOBAL wallet.
            The club balance (snapshot.hero_club_balance) was visible only
            inside BuyInDialog, so at a club table a player could not see it at
            all — and an unlabelled figure gets read as whichever wallet the
            reader has in mind. Name the global one, and show the club one
            beside it whenever the table actually has one. BuyInDialog already
            uses exactly these two sources with the labels "Global wallet" /
            "Club wallet"; keep the wording aligned. */}
        <Link href="/wallet" className="text-right transition hover:opacity-80" title="Your global wallet balance">
          <p className="text-[10px] uppercase tracking-wider text-muted">Global</p>
          <p className="text-lg font-semibold text-green">{formatCents(profile.walletCents)}</p>
        </Link>
        {clubBalanceCents !== null && (
          <div className="text-right" title="Club chips allocated to you at this table">
            <p className="text-[10px] uppercase tracking-wider text-muted">Club</p>
            <p className="text-lg font-semibold text-gold">{formatCents(clubBalanceCents)}</p>
          </div>
        )}
        <div className="text-right">
          <p className="text-[10px] uppercase tracking-wider text-muted">Room</p>
          <p className="font-mono text-sm text-gold">{roomId ?? matchId?.slice(0, 8) ?? "—"}</p>
        </div>
        <HostPanel />
        <div className="flex items-center gap-2">
          <span className={`h-2 w-2 rounded-full ${connected ? "bg-green" : "bg-brand"}`} />
          <span className="text-xs uppercase tracking-wider text-neutral-400">
            {connected ? "Live" : "Offline"}
          </span>
        </div>
        {!demo && matchId && (
          <VideoControlBar heroId={profile.userId} tableId={matchId} playerIds={playerIds} isAdmin={isHost} />
        )}
        <MuteToggle />
      </div>
    </header>
  );
}
