"use client";

// Hero self-controls — Extend Time / Sit Out / Exit Table — docked to the
// action-bar area (bottom-center, the same hero-exclusive screen space
// ActionBar/PreActionBar already own) instead of floating over the felt,
// where they kept re-colliding with seats as the table layout evolved. This
// row renders whenever the hero is seated, independent of whose turn it is
// (ActionBar itself only renders on the hero's own turn), so it sits as a
// sibling in the same bottom flex column in TableHud.tsx.

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

import { formatCents, useGame } from "@/features/game/GameProvider";
import { GLASS_PANEL, cn } from "@/features/ui/tokens";
import type { ActionRequiredMessage } from "@/features/game/protocol";

// ?demo=1 has no live socket, so the real per-seat/actionRequired state this
// dock reads (sitting_out, time_bank_secs) never arrives — this stub mirrors
// DEMO_SNAPSHOT (hero at seat 0) the same way ActionBar's own demo stub does.
const DEMO_ACTION_REQUIRED: ActionRequiredMessage = {
  seat: 0,
  valid_actions: ["fold", "check", "call", "raise"],
  to_call: 250_000,
  min_raise: 500_000,
  max_raise: 5_250_000,
  pot: 1_865_000,
  deadline_tick: 0,
  action_secs: 30,
  time_bank_secs: 45,
};

function SitOutToggle({ demo }: { demo: boolean }) {
  const { snapshot, profile, sitOut } = useGame();
  const heroSeat = demo
    ? { sitting_out: false }
    : snapshot?.seats.find((s) => s.user_id === profile.userId && s.status !== "empty");
  if (!heroSeat) return null;
  const away = heroSeat.sitting_out ?? false;
  const onClick = demo ? async () => {} : () => void sitOut(!away);

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        GLASS_PANEL,
        "pointer-events-auto flex items-center gap-2 px-3 py-1.5 text-xs transition-colors",
        away ? "border-gold/50 text-gold" : "border-white/12 text-neutral-300 hover:border-white/25",
      )}
      style={{ background: "#262d38" }}
      aria-pressed={away}
    >
      <span className="font-semibold uppercase tracking-wider">Sit Out</span>
      <span className={cn("relative h-4 w-7 flex-shrink-0 rounded-full transition-colors", away ? "bg-gold/70" : "bg-white/15")}>
        <span className={cn("absolute top-0.5 h-3 w-3 rounded-full bg-white transition-all", away ? "left-[14px]" : "left-0.5")} />
      </span>
    </button>
  );
}

function ExitTableButton({ demo }: { demo: boolean }) {
  const { snapshot, profile, standUp } = useGame();
  const heroSeat = demo
    ? { index: 0 }
    : snapshot?.seats.find((s) => s.user_id === profile.userId && s.status !== "empty");
  if (!heroSeat) return null;
  const onClick = demo ? async () => {} : () => void standUp();

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        GLASS_PANEL,
        "pointer-events-auto px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-[#ff9ba1] transition-colors border-brand/40 hover:bg-brand/10",
      )}
      style={{ background: "#262d38" }}
    >
      Exit Table
    </button>
  );
}

const EXTEND_URGENT_MS = 5_000;

function ExtendTimeButton({ demo }: { demo: boolean }) {
  // `useTimeBank` is a plain GameProvider action, not a React hook — alias it
  // so it is never mistaken for one (calling it in a handler is correct).
  const { actionRequired: liveActionRequired, profile, snapshot, useTimeBank: requestTimeBank } = useGame();
  const actionRequired = demo ? DEMO_ACTION_REQUIRED : liveActionRequired;
  const heroSeat = demo ? 0 : (snapshot?.seats.find((s) => s.user_id === profile.userId)?.index ?? -1);
  const isMyTurn = actionRequired?.seat === heroSeat;
  const bankSecs = actionRequired?.time_bank_secs ?? 0;

  const [urgent, setUrgent] = useState(false);
  useEffect(() => {
    if (!isMyTurn || !actionRequired) {
      setUrgent(false);
      return;
    }
    const baseMs = (actionRequired.action_secs ?? 30) * 1000;
    const start = Date.now();
    const id = window.setInterval(() => {
      setUrgent(Math.max(0, baseMs - (Date.now() - start)) <= EXTEND_URGENT_MS);
    }, 200);
    return () => window.clearInterval(id);
  }, [isMyTurn, actionRequired]);

  if (!isMyTurn || !actionRequired || bankSecs <= 0) return null;
  const onClick = demo ? async () => {} : () => void requestTimeBank();

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        GLASS_PANEL,
        "pointer-events-auto px-3 py-1.5 text-xs font-semibold uppercase tracking-wider transition-colors",
        urgent ? "border-red-400/70 text-red-300 animate-pulse" : "border-gold/40 text-gold",
      )}
      style={{ background: "#262d38" }}
    >
      Extend +{bankSecs}s
    </button>
  );
}

/** Add chips to the hero's live stack from their wallet — the only way to
 *  refill mid-session today is AutoBuyBack, which only fires automatically
 *  once a seat busts to exactly $0 between hands. Self-gates on the same
 *  table-stakes rule the server enforces (`OpAddChips` in handler.go): only
 *  offered between hands, never while the hero is still live in a hand in
 *  progress. */
function AddChipsButton({ demo }: { demo: boolean }) {
  const { snapshot, profile, addChips } = useGame();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(0);

  const heroSeat = demo
    ? { stack: 750_000, status: "seated" }
    : snapshot?.seats.find((s) => s.user_id === profile.userId && s.status !== "empty");
  const liveInHand =
    !demo && snapshot?.phase !== "waiting" && (heroSeat?.status === "seated" || heroSeat?.status === "all_in");

  const maxBuyIn = demo ? 5_000_000 : (snapshot?.max_buy_in ?? Number.MAX_SAFE_INTEGER);
  const room = heroSeat ? Math.max(0, Math.min(maxBuyIn - heroSeat.stack, profile.walletCents)) : 0;

  if (!heroSeat || liveInHand || room <= 0) return null;

  const defaultAmount = Math.min(room, 50_000);
  const onOpen = () => {
    setAmount(defaultAmount);
    setOpen(true);
  };
  const onConfirm = demo
    ? async () => setOpen(false)
    : async () => {
        await addChips(amount || defaultAmount);
        setOpen(false);
      };

  return (
    <div className="pointer-events-auto relative">
      <button
        type="button"
        onClick={onOpen}
        className={cn(
          GLASS_PANEL,
          "px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-green transition-colors border-green/40 hover:bg-green/10",
        )}
        style={{ background: "#262d38" }}
      >
        + Add Chips
      </button>
      {open && (
        <div
          className={cn(GLASS_PANEL, "absolute bottom-full left-1/2 mb-2 w-48 -translate-x-1/2 p-3")}
          style={{ background: "#262d38" }}
        >
          <p className="text-[10px] uppercase tracking-wider text-muted">Add to stack</p>
          <p className="mt-0.5 text-sm font-semibold text-green">{formatCents(amount)}</p>
          <input
            type="range"
            min={100}
            max={room}
            step={100}
            value={Math.min(amount, room)}
            onChange={(e) => setAmount(Number(e.target.value))}
            className="mt-2 w-full accent-[#22c55e]"
          />
          <div className="mt-2 flex gap-1.5">
            <button
              type="button"
              onClick={() => void onConfirm()}
              className="flex-1 rounded-lg bg-green px-2 py-1 text-[11px] font-bold uppercase text-black hover:bg-[#2ee670]"
            >
              Confirm
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="flex-1 rounded-lg border border-white/15 px-2 py-1 text-[11px] font-semibold uppercase text-neutral-300 hover:bg-white/5"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Slim row docked above the action bar: Extend Time (turn-gated), Sit Out
 *  (seated-gated), Exit Table (seated-gated), Add Chips (seated + between
 *  hands). */
export function HeroControlsDock() {
  const demo = useSearchParams().get("demo") === "1";
  return (
    <div className="pointer-events-none flex items-center justify-center gap-2">
      <ExtendTimeButton demo={demo} />
      <AddChipsButton demo={demo} />
      <SitOutToggle demo={demo} />
      <ExitTableButton demo={demo} />
    </div>
  );
}
