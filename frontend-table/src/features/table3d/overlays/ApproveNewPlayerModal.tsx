"use client";

// Approve-New-Player card (HRC full_body master 2). A centered modal the host
// opens on a pending seat request: portrait, Username / Bankroll / Rarity, and
// the two decisive controls — APPROVE & SEAT (gold) and DECLINE. Both bind to a
// real registered RPC via useTableAdmin (CLAUDE.md rule #4):
//   • Approve → club_request_review {action:"approve"} + balance_allocate (seed)
//   • Decline → club_request_review {action:"reject"}

import { useState } from "react";

import { formatCents } from "@/features/game/GameProvider";
import { BTN_GOLD, GLASS_PANEL, HEADING_LG, RARITY, cn } from "@/features/ui/tokens";
import type { WaitingEntry } from "../adminSession";

const RARITY_LABEL: Record<WaitingEntry["rarity"], string> = {
  common: "Common",
  rare: "Rare",
  epic: "Epic",
  legendary: "Legendary",
};

export function ApproveNewPlayerModal({
  entry,
  onApprove,
  onDecline,
  onClose,
}: {
  entry: WaitingEntry;
  onApprove: (entry: WaitingEntry) => Promise<void>;
  onDecline: (entry: WaitingEntry) => Promise<void>;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState<"approve" | "decline" | null>(null);
  const rarity = RARITY[entry.rarity];

  const run = async (kind: "approve" | "decline") => {
    setBusy(kind);
    try {
      await (kind === "approve" ? onApprove(entry) : onDecline(entry));
      onClose();
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="pointer-events-auto fixed inset-0 z-40 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={busy ? undefined : onClose} />
      <div
        className={cn(
          GLASS_PANEL,
          "relative flex w-full max-w-md flex-col items-center overflow-hidden border-gold/30 px-8 py-7 shadow-[0_0_60px_rgba(0,0,0,0.7)]",
        )}
        style={{ background: "#1c2128" }}
      >
        <h2 className={cn(HEADING_LG, "text-gold")}>Approve New Player</h2>

        <div className="mt-6 flex w-full items-center gap-6">
          <div
            className="h-32 w-32 flex-shrink-0 overflow-hidden rounded-full"
            style={{
              border: "3px solid #f5c518",
              boxShadow: "0 0 26px rgba(245,197,24,0.35), inset 0 0 12px rgba(0,0,0,0.6)",
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={entry.avatar} alt="" className="h-full w-full object-cover" />
          </div>

          <dl className="min-w-0 flex-1 space-y-2 text-[15px]">
            <div className="flex items-baseline gap-2">
              <dt className="text-neutral-400">Username:</dt>
              <dd className="truncate font-semibold text-white">{entry.name}</dd>
            </div>
            <div className="flex items-baseline gap-2">
              <dt className="text-neutral-400">Bankroll:</dt>
              <dd className="font-bold text-green">{formatCents(entry.buyInCents)}</dd>
            </div>
            <div className="flex items-baseline gap-2">
              <dt className="text-neutral-400">Rarity:</dt>
              <dd className={cn("font-bold", rarity.text)}>{RARITY_LABEL[entry.rarity]}</dd>
            </div>
          </dl>
        </div>

        {entry.walletCents > 0 && (
          <p className="mt-4 text-center text-[12px] text-neutral-500">
            Connected wallet balance{" "}
            <span className="font-semibold text-green">{formatCents(entry.walletCents)}</span>
          </p>
        )}

        <button
          type="button"
          disabled={busy !== null}
          onClick={() => void run("approve")}
          className={cn(BTN_GOLD, "mt-6 w-full rounded-xl py-3 text-base uppercase tracking-wider disabled:opacity-50")}
        >
          {busy === "approve" ? "Approving…" : "Approve & Seat"}
        </button>
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => void run("decline")}
          className={cn(
            GLASS_PANEL,
            "mt-3 w-full rounded-xl border-white/15 py-3 text-base font-semibold uppercase tracking-wider text-neutral-200 hover:border-white/30 disabled:opacity-50",
          )}
        >
          {busy === "decline" ? "Declining…" : "Decline"}
        </button>
      </div>
    </div>
  );
}
