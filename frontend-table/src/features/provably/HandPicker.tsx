"use client";

import { useCallback, useEffect, useState } from "react";

import { Button, Field, Input } from "@/features/ui";
import { GLASS_PANEL, HEADING_SM, cn } from "@/features/ui/tokens";

import { handHistory } from "./provablyRpc";
import type { HandIndexRow, HandRef } from "./types";

function centsToUsd(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  return `${sign}$${(Math.abs(cents) / 100).toFixed(2)}`;
}

/** Left-rail hand chooser: loads the caller's searchable hand index
 *  (hand_history) and offers a manual match/hand entry for verifying any hand. */
export function HandPicker({
  active,
  onSelect,
}: {
  active: HandRef | null;
  onSelect: (ref: HandRef) => void;
}) {
  const [hands, setHands] = useState<HandIndexRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [onChainOnly, setOnChainOnly] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [manualMatch, setManualMatch] = useState("");
  const [manualHand, setManualHand] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await handHistory(40, onChainOnly);
      setHands(res.hands ?? []);
      setLoaded(true);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to load hands");
    } finally {
      setLoading(false);
    }
  }, [onChainOnly]);

  // Reload when the on-chain filter changes but only after a first manual load.
  useEffect(() => {
    if (loaded) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onChainOnly]);

  const verifyManual = () => {
    const n = Number.parseInt(manualHand, 10);
    if (manualMatch.trim() === "" || Number.isNaN(n) || n <= 0) {
      setErr("Enter a match id and a hand number");
      return;
    }
    setErr(null);
    onSelect({ matchId: manualMatch.trim(), handNo: n });
  };

  const isActive = (h: HandIndexRow) =>
    active?.matchId === h.match_id && active?.handNo === h.hand_no;

  return (
    <div className={cn(GLASS_PANEL, "flex flex-col overflow-hidden")}>
      <div className="border-b border-white/[0.06] bg-white/[0.02] px-5 py-4">
        <p className={cn(HEADING_SM, "text-cyan/80")}>Verify a Hand</p>
        <p className="mt-0.5 text-sm text-neutral-400">Load your hands, or paste any match & hand.</p>
      </div>

      <div className="space-y-4 p-5">
        {/* Manual entry — always works, even before the index is populated */}
        <div className="space-y-3 rounded-xl border border-white/[0.07] bg-black/30 p-3">
          <Field label="Match / room id">
            <Input
              value={manualMatch}
              onChange={(e) => setManualMatch(e.target.value)}
              placeholder="match or room id"
              spellCheck={false}
            />
          </Field>
          <Field label="Hand number">
            <Input
              value={manualHand}
              onChange={(e) => setManualHand(e.target.value)}
              placeholder="e.g. 12"
              inputMode="numeric"
              onKeyDown={(e) => {
                if (e.key === "Enter") verifyManual();
              }}
            />
          </Field>
          <Button onClick={verifyManual} className="w-full" size="sm">
            Verify hand
          </Button>
        </div>

        {/* Hand history from the index */}
        <div>
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase tracking-[0.25em] text-neutral-500">My hands</span>
            <label className="flex cursor-pointer items-center gap-1.5 text-[10px] text-neutral-400">
              <input
                type="checkbox"
                checked={onChainOnly}
                onChange={(e) => setOnChainOnly(e.target.checked)}
                className="accent-[#d4af37]"
              />
              On-chain only
            </label>
          </div>

          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading} className="mt-2 w-full">
            {loading ? "Loading…" : loaded ? "Reload my hands" : "Load my hands"}
          </Button>

          {err && <p className="mt-2 text-[11px] text-red-300">{err}</p>}

          {loaded && hands.length === 0 && !loading && (
            <p className="mt-3 text-[11px] text-neutral-600">
              No indexed hands yet. Play a hand, or verify one by id above.
            </p>
          )}

          {hands.length > 0 && (
            <ul className="mt-3 max-h-80 space-y-1.5 overflow-y-auto pr-1">
              {hands.map((h) => (
                <li key={h.id}>
                  <button
                    type="button"
                    onClick={() => onSelect({ matchId: h.match_id, handNo: h.hand_no })}
                    className={cn(
                      "w-full rounded-xl border px-3 py-2 text-left transition-colors",
                      isActive(h)
                        ? "border-cyan/40 bg-cyan/[0.06]"
                        : "border-white/[0.07] bg-black/20 hover:border-white/20",
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold text-white">
                        Hand #{h.hand_no}
                        <span className="ml-2 text-[11px] font-normal text-neutral-500">
                          {h.table_label || h.match_id.slice(0, 8)}
                        </span>
                      </span>
                      {h.anchored ? (
                        <span className="rounded-full border border-gold/40 bg-gold/10 px-2 py-0.5 text-[9px] font-bold uppercase text-gold">
                          On-chain
                        </span>
                      ) : (
                        <span className="rounded-full border border-white/10 px-2 py-0.5 text-[9px] font-bold uppercase text-neutral-500">
                          Off-chain
                        </span>
                      )}
                    </div>
                    <div className="mt-1 flex items-center justify-between text-[11px]">
                      <span className="text-neutral-500">pot {h.pot}</span>
                      <span className={h.net_cents >= 0 ? "text-emerald-300" : "text-red-300"}>
                        {h.net_cents >= 0 ? "+" : ""}
                        {centsToUsd(h.net_cents)}
                      </span>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
