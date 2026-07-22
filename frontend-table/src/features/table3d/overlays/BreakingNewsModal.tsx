"use client";

// Breaking-News broadcast: seated players get a dismissable modal (announcement_list),
// admins compose + broadcast one (announcement_create). Matches the HRC
// "Breaking News Modal" master.

import { useState } from "react";

import { BTN_GOLD, GLASS_PANEL, HEADING_LG, cn } from "@/features/ui/tokens";
import { OverlayModal } from "./primitives";
import type { NewsItem, TableOverlays } from "./overlaySession";

/** The received broadcast shown to every seated player. */
export function BreakingNewsModal({ news, onDismiss }: { news: NewsItem; onDismiss: () => void }) {
  const lines = news.body.split("\n").filter(Boolean);
  return (
    <div className="pointer-events-auto fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/75 backdrop-blur-md" onClick={onDismiss} />
      <div
        className={cn(
          GLASS_PANEL,
          "relative w-full max-w-lg overflow-hidden border-gold/40 shadow-[0_0_70px_rgba(0,0,0,0.8)]",
        )}
        style={{ background: "#16191d" }}
      >
        <div className="border-b border-gold/30 bg-gradient-to-b from-[#ffd54a] via-[#f5c518] to-[#d4a80f] px-6 py-3 text-center">
          <h2 className={cn(HEADING_LG, "text-[#231b00]")}>{news.title}</h2>
        </div>
        <div className="space-y-3 px-6 py-8 text-center">
          {lines.map((line, i) => (
            <p
              key={i}
              className={cn(
                "font-display font-bold uppercase tracking-wide",
                i === 0 ? "text-lg text-white" : "text-base text-gold",
              )}
            >
              {line}
            </p>
          ))}
        </div>
        <div className="flex justify-end border-t border-white/10 px-6 py-4">
          <button
            type="button"
            onClick={onDismiss}
            className={cn(GLASS_PANEL, "rounded-xl border-white/15 px-8 py-2 text-sm font-semibold uppercase tracking-wider text-neutral-200 hover:border-white/30 hover:text-white")}
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}

/** Admin composer — writes a broadcast via announcement_create. */
export function BreakingNewsComposeModal({
  overlays,
  onClose,
}: {
  overlays: TableOverlays;
  onClose: () => void;
}) {
  const [title, setTitle] = useState("Breaking News");
  const [body, setBody] = useState("");
  const [hours, setHours] = useState(1);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const send = async () => {
    setBusy(true);
    setErr(null);
    try {
      await overlays.broadcastNews(title.trim(), body.trim(), hours);
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Broadcast failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <OverlayModal
      title="Broadcast Breaking News"
      onClose={onClose}
      footer={
        <div className="flex items-center justify-center gap-3">
          <button
            type="button"
            disabled={busy || !body.trim()}
            onClick={() => void send()}
            className={cn(BTN_GOLD, "rounded-xl px-8 py-2.5 text-sm uppercase tracking-wider disabled:opacity-50")}
          >
            {busy ? "Broadcasting…" : "Broadcast to Table"}
          </button>
          <button
            type="button"
            onClick={onClose}
            className={cn(GLASS_PANEL, "rounded-xl border-white/15 px-8 py-2.5 text-sm font-semibold uppercase tracking-wider text-neutral-200 hover:border-white/30")}
          >
            Cancel
          </button>
        </div>
      }
    >
      <div className="space-y-4 px-6 py-5">
        <div>
          <label className="mb-1.5 block text-[11px] uppercase tracking-wider text-neutral-500">Headline</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full rounded-lg border border-white/10 bg-black/50 px-3 py-2.5 text-sm font-semibold text-white focus:border-gold/50 focus:outline-none"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-[11px] uppercase tracking-wider text-neutral-500">Message</label>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={4}
            placeholder="ATTENTION ALL PLAYERS: SPECIAL TOURNAMENT STARTS IN 1 HOUR!"
            className="w-full resize-none rounded-lg border border-white/10 bg-black/50 px-3 py-2.5 text-sm text-white placeholder:text-neutral-600 focus:border-gold/50 focus:outline-none"
          />
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-sm text-neutral-300">Display for (hours)</span>
          <input
            type="number"
            min={1}
            value={hours}
            onChange={(e) => setHours(Math.max(1, Number(e.target.value) || 1))}
            className="w-24 rounded-lg border border-white/10 bg-black/50 px-3 py-1.5 text-center text-sm font-semibold text-white focus:border-gold/50 focus:outline-none"
          />
        </div>
        {err && <p className="text-center text-[12px] font-semibold text-[#ff6b70]">{err}</p>}
        <p className="text-[11px] text-neutral-500">Broadcasts to every seated player as a breaking-news modal.</p>
      </div>
    </OverlayModal>
  );
}
