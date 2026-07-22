"use client";

import { useEffect, useState } from "react";

import { callSessionRpc } from "@/lib/nakama/sessionRpc";
import { formatBps, formatMoney } from "@/features/commands/schemaForm/format";

// Rake transparency for players (UI review P2-2): pair the provable shuffle with
// a provable rake. Every club that opts its rake config public shows its exact
// rule here — "5% · capped at $5.00 · no flop no drop" — so a player can verify
// the shuffle AND the rake, the trust pitch no competitor offers.

interface ClubRef {
  id: string;
  name: string;
}

interface RakeConfig {
  club_id?: string;
  name?: string;
  percent_bps?: number;
  cap_minor?: number;
  min_pot_minor?: number;
  no_flop_no_drop?: boolean;
  public?: boolean;
}

export function RakeTransparency() {
  const [clubs, setClubs] = useState<ClubRef[]>([]);
  const [clubId, setClubId] = useState<string>("");
  const [rake, setRake] = useState<RakeConfig | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "private" | "shown" | "none">("idle");

  useEffect(() => {
    void (async () => {
      try {
        const data = (await callSessionRpc("club_list", {})) as { clubs?: ClubRef[] } | null;
        const list = Array.isArray(data?.clubs) ? data!.clubs! : [];
        setClubs(list);
        if (list[0]) setClubId(list[0].id);
      } catch {
        setClubs([]);
      }
    })();
  }, []);

  useEffect(() => {
    if (!clubId) return;
    setState("loading");
    setRake(null);
    void (async () => {
      try {
        const data = (await callSessionRpc("rake_config_get", { club_id: clubId })) as RakeConfig | null;
        if (!data || (data.percent_bps == null && !data.club_id)) {
          setState("none");
          return;
        }
        setRake(data);
        setState("shown");
      } catch (e) {
        // Gated (not public) -> the RPC rejects with a "private" message.
        const msg = e instanceof Error ? e.message.toLowerCase() : "";
        setState(msg.includes("private") ? "private" : "none");
      }
    })();
  }, [clubId]);

  const parts: string[] = [];
  if (rake) {
    parts.push(`${formatBps(rake.percent_bps ?? 0)} rake`);
    if (rake.cap_minor) parts.push(`capped at ${formatMoney(rake.cap_minor)}`);
    if (rake.no_flop_no_drop) parts.push("no flop, no drop");
    if (rake.min_pot_minor && rake.min_pot_minor > 0) parts.push(`min pot ${formatMoney(rake.min_pot_minor)}`);
  }

  return (
    <div className="mx-auto max-w-2xl">
      <h2 className="text-2xl font-semibold text-white">Rake transparency</h2>
      <p className="mt-2 text-sm text-neutral-400">
        Verify the shuffle <span className="text-gold">and</span> the rake. Clubs that publish their
        rake show the exact rule here — no hidden house edge.
      </p>

      <label className="mt-6 block text-[11px] font-semibold uppercase tracking-wider text-muted">Club</label>
      {clubs.length === 0 ? (
        <p className="mt-1 text-sm text-neutral-500">No clubs to show yet.</p>
      ) : (
        <select
          value={clubId}
          onChange={(e) => setClubId(e.target.value)}
          className="mt-1 w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2.5 text-sm text-white outline-none focus:border-gold/50"
        >
          {clubs.map((c) => (
            <option key={c.id} value={c.id} className="bg-surface-2">{c.name}</option>
          ))}
        </select>
      )}

      <div className="mt-5">
        {state === "loading" && <p className="text-sm text-muted">Loading rake rule…</p>}
        {state === "shown" && rake && (
          <div className="rounded-2xl border border-gold/25 bg-gold/[0.06] p-5">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-gold/80">
              {rake.name || "Rake rule"} · published
            </p>
            <p className="mt-2 text-2xl font-bold text-white">{parts.join(" · ")}</p>
            <p className="mt-3 text-xs text-green">✓ This club publishes its rake — verifiable, not just trusted.</p>
          </div>
        )}
        {state === "private" && (
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
            <p className="text-sm font-semibold text-neutral-200">This club keeps its rake rules private.</p>
            <p className="mt-1 text-xs text-muted">
              Only members can see it. Clubs that publish their rake earn a transparency badge.
            </p>
          </div>
        )}
        {state === "none" && (
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
            <p className="text-sm text-neutral-300">No rake rule configured for this club.</p>
          </div>
        )}
      </div>
    </div>
  );
}
