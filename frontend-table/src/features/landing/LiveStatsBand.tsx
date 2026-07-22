"use client";

import { useEffect, useRef, useState } from "react";

import { GLASS_PANEL, GLASS_PANEL_HOVER, HEADING_SM, cn } from "@/features/ui/tokens";
import { compact, landingApi, money, type GlobalStats, type PresenceStats } from "./landingRpc";

interface StatTile {
  key: string;
  label: string;
  value: string;
  numeric: number;
  accent: string;
  live?: boolean;
}

/** RAF count-up that respects prefers-reduced-motion. */
function useCountUp(target: number, run: boolean): number {
  const [val, setVal] = useState(0);
  const fromRef = useRef(0);
  useEffect(() => {
    if (!run) return;
    if (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setVal(target);
      return;
    }
    const from = fromRef.current;
    const start = performance.now();
    const dur = 900;
    let raf = 0;
    const step = (t: number) => {
      const p = Math.min(1, (t - start) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      setVal(from + (target - from) * eased);
      if (p < 1) raf = requestAnimationFrame(step);
      else fromRef.current = target;
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, run]);
  return val;
}

function Tile({ tile, run }: { tile: StatTile; run: boolean }) {
  const n = useCountUp(tile.numeric, run);
  // Re-derive the formatted label from the animated numeric where sensible.
  const display =
    tile.key === "pot"
      ? money(n)
      : tile.numeric >= 1000
        ? compact(Math.round(n))
        : String(Math.round(n));
  return (
    <div
      className={cn(
        GLASS_PANEL,
        GLASS_PANEL_HOVER,
        "relative overflow-hidden px-5 py-6 text-center",
      )}
    >
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-px"
        style={{ background: `linear-gradient(90deg,transparent,${tile.accent},transparent)` }}
      />
      <div className="flex items-center justify-center gap-2">
        {tile.live && (
          <span className="relative flex h-2 w-2">
            <span
              className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-70"
              style={{ backgroundColor: tile.accent }}
            />
            <span className="relative inline-flex h-2 w-2 rounded-full" style={{ backgroundColor: tile.accent }} />
          </span>
        )}
        <span
          className="font-display text-3xl font-bold tabular-nums sm:text-4xl"
          style={{ color: tile.accent }}
        >
          {tile.value === "—" ? "—" : display}
        </span>
      </div>
      <p className={cn(HEADING_SM, "mt-2 text-neutral-400")}>{tile.label}</p>
    </div>
  );
}

export function LiveStatsBand() {
  const [stats, setStats] = useState<GlobalStats | null>(null);
  const [presence, setPresence] = useState<PresenceStats | null>(null);
  const [err, setErr] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const [s, p] = await Promise.all([landingApi.stats(), landingApi.presence()]);
        if (!alive) return;
        setStats(s);
        setPresence(p);
        setErr(false);
      } catch {
        if (alive) setErr(true);
      } finally {
        if (alive) setReady(true);
      }
    };
    void load();
    // Presence is live — refresh on an interval so the "online" tile breathes.
    const id = window.setInterval(() => {
      void (async () => {
        try {
          const p = await landingApi.presence();
          if (alive) setPresence(p);
        } catch {
          /* keep last good value — never fabricate */
        }
      })();
    }, 15_000);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, []);

  const tiles: StatTile[] = [
    {
      key: "online",
      label: "Players online",
      value: presence ? String(presence.online) : "—",
      numeric: presence?.online ?? 0,
      accent: "#22c55e",
      live: true,
    },
    {
      key: "seated",
      label: "Seated now",
      value: presence ? String(presence.players_at_tables) : "—",
      numeric: presence?.players_at_tables ?? 0,
      accent: "#ff2d3f",
      live: true,
    },
    {
      key: "hands",
      label: "Hands dealt",
      value: stats ? compact(stats.hands) : "—",
      numeric: stats?.hands ?? 0,
      accent: "#f5c518",
    },
    {
      key: "players",
      label: "Members",
      value: stats ? compact(stats.players) : "—",
      numeric: stats?.players ?? 0,
      accent: "#f5f6f7",
    },
    {
      key: "clubs",
      label: "Clubs",
      value: stats ? compact(stats.clubs) : "—",
      numeric: stats?.clubs ?? 0,
      accent: "#ffd54a",
    },
    {
      key: "pot",
      label: "Chips in play",
      value: stats ? money(stats.pot_cents) : "—",
      numeric: stats?.pot_cents ?? 0,
      accent: "#22c55e",
    },
  ];

  return (
    <section className="mx-auto max-w-6xl px-6 py-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {tiles.map((t) => (
          <Tile key={t.key} tile={t} run={ready} />
        ))}
      </div>
      {err && (
        <p className="mt-3 text-center text-xs text-neutral-600">
          Live network stats are momentarily unavailable — showing placeholders.
        </p>
      )}
    </section>
  );
}
