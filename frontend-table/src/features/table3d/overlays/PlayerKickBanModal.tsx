"use client";

// Player Kick/Ban confirmation: host/admin picks a reason and either removes the
// player from the table (club_kick / OpHostAction kick) or bans them from the
// club (admin_ban). Matches the HRC "Player Kick/Ban Confirmation" master.

import { useState } from "react";

import { BTN_RED, GLASS_PANEL, cn } from "@/features/ui/tokens";
import { OverlayAvatar, OverlayModal } from "./primitives";
import type { KickTarget, TableOverlays } from "./overlaySession";

const REASONS = [
  "Inappropriate Conduct",
  "Collusion / Cheating",
  "Abusive Chat",
  "Chip Dumping",
  "Excessive Timeouts",
  "Other",
];

export function PlayerKickBanModal({
  overlays,
  target,
  onClose,
}: {
  overlays: TableOverlays;
  target: KickTarget;
  onClose: () => void;
}) {
  const [reason, setReason] = useState(REASONS[0]);
  const [busy, setBusy] = useState<"kick" | "ban" | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const run = async (kind: "kick" | "ban") => {
    setBusy(kind);
    setErr(null);
    try {
      if (kind === "kick") await overlays.kick(target);
      else await overlays.ban(target, reason);
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Action failed");
    } finally {
      setBusy(null);
    }
  };

  return (
    <OverlayModal title="Player Kick/Ban Confirmation" onClose={onClose}>
      <div className="space-y-5 px-6 py-5">
        <div className={cn(GLASS_PANEL, "flex items-center gap-3 border-white/10 p-4")}>
          <OverlayAvatar src={target.avatar} ring="#f5c518" size={48} />
          <div className="min-w-0">
            <div className="truncate text-base font-semibold text-white">{target.name}</div>
            <div className="truncate text-[12px] text-neutral-400">[{target.handle}]</div>
          </div>
        </div>

        <div>
          <label className="mb-1.5 block text-[11px] uppercase tracking-wider text-neutral-500">Reason for Action</label>
          <select
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="w-full rounded-lg border border-white/10 bg-black/50 px-3 py-2.5 text-sm text-white focus:border-gold/50 focus:outline-none"
          >
            {REASONS.map((r) => (
              <option key={r} value={r} className="bg-[#1c2128]">
                {r}
              </option>
            ))}
          </select>
        </div>

        {err && <p className="text-center text-[12px] font-semibold text-[#ff6b70]">{err}</p>}

        <div className="flex flex-col gap-3">
          <button
            type="button"
            disabled={!!busy}
            onClick={() => void run("kick")}
            className={cn(BTN_RED, "w-full rounded-xl px-6 py-3 text-sm uppercase tracking-wider disabled:opacity-50")}
          >
            {busy === "kick" ? "Removing…" : "Kick from Table"}
          </button>
          <button
            type="button"
            disabled={!!busy}
            onClick={() => void run("ban")}
            className={cn(BTN_RED, "w-full rounded-xl px-6 py-3 text-sm uppercase tracking-wider disabled:opacity-50")}
          >
            {busy === "ban" ? "Banning…" : "Ban from Club"}
          </button>
          <button
            type="button"
            onClick={onClose}
            className={cn(GLASS_PANEL, "w-full rounded-xl border-white/15 px-6 py-2.5 text-sm font-semibold uppercase tracking-wider text-neutral-200 hover:border-white/30")}
          >
            Cancel
          </button>
        </div>
      </div>
    </OverlayModal>
  );
}
