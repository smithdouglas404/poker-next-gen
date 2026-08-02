"use client";
// ── Cash Game Table Finder ───────────────────────────────────────────────────
// Advanced table browser with filters: game type, stakes, seats, speed.
// Shows live occupancy, waiting list counts, and quick-seat CTA.
import { useState } from "react";
import { GLASS_PANEL, cn } from "@/features/ui/tokens";

type GameType = "NLH" | "PLO" | "PLO5" | "Short";
type Speed = "regular" | "fast" | "turbo";

type Table = {
  id: string;
  name: string;
  game: GameType;
  stakes: string;
  blinds: string;
  seated: number;
  capacity: number;
  waiting: number;
  avgPot: number;
  handsPerHour: number;
  speed: Speed;
  minBuyin: number;
  maxBuyin: number;
  featured?: boolean;
};

const DEMO_TABLES: Table[] = [
  { id: "t1", name: "Diamond Lounge 1", game: "NLH",   stakes: "NL500",  blinds: "$2/$5",   seated: 6, capacity: 6, waiting: 3, avgPot: 420,  handsPerHour: 68, speed: "regular", minBuyin: 100,  maxBuyin: 500,  featured: true },
  { id: "t2", name: "Diamond Lounge 2", game: "NLH",   stakes: "NL500",  blinds: "$2/$5",   seated: 4, capacity: 6, waiting: 0, avgPot: 380,  handsPerHour: 65, speed: "regular", minBuyin: 100,  maxBuyin: 500  },
  { id: "t3", name: "High Stakes 1",    game: "NLH",   stakes: "NL1000", blinds: "$5/$10",  seated: 5, capacity: 6, waiting: 2, avgPot: 1200, handsPerHour: 55, speed: "regular", minBuyin: 200,  maxBuyin: 1000 },
  { id: "t4", name: "Fast Fold 1",      game: "NLH",   stakes: "NL200",  blinds: "$1/$2",   seated: 9, capacity: 9, waiting: 8, avgPot: 180,  handsPerHour: 180, speed: "fast",   minBuyin: 40,   maxBuyin: 200  },
  { id: "t5", name: "PLO Action 1",     game: "PLO",   stakes: "PLO500", blinds: "$2/$5",   seated: 5, capacity: 6, waiting: 1, avgPot: 680,  handsPerHour: 52, speed: "regular", minBuyin: 100,  maxBuyin: 500  },
  { id: "t6", name: "PLO5 Madness",     game: "PLO5",  stakes: "PLO200", blinds: "$1/$2",   seated: 3, capacity: 6, waiting: 0, avgPot: 340,  handsPerHour: 48, speed: "regular", minBuyin: 40,   maxBuyin: 200  },
  { id: "t7", name: "Short Deck 1",     game: "Short", stakes: "SD500",  blinds: "$2/$5",   seated: 6, capacity: 6, waiting: 5, avgPot: 520,  handsPerHour: 72, speed: "regular", minBuyin: 100,  maxBuyin: 500  },
  { id: "t8", name: "Turbo NL100",      game: "NLH",   stakes: "NL100",  blinds: "$0.5/$1", seated: 8, capacity: 9, waiting: 0, avgPot: 88,   handsPerHour: 220, speed: "turbo",  minBuyin: 20,   maxBuyin: 100  },
  { id: "t9", name: "Whale Tank",       game: "NLH",   stakes: "NL5000", blinds: "$25/$50", seated: 3, capacity: 6, waiting: 0, avgPot: 8400, handsPerHour: 42, speed: "regular", minBuyin: 1000, maxBuyin: 5000, featured: true },
];

const GAME_LABELS: Record<GameType, string> = {
  NLH: "No Limit Hold'em", PLO: "Pot Limit Omaha", PLO5: "PLO5", Short: "Short Deck",
};

const SPEED_BADGE: Record<Speed, { label: string; color: string }> = {
  regular: { label: "Regular", color: "rgba(255,255,255,0.40)" },
  fast:    { label: "Fast",    color: "#f5c518" },
  turbo:   { label: "Turbo",   color: "#22c55e" },
};

function OccupancyBar({ seated, capacity }: { seated: number; capacity: number }) {
  const pct = capacity > 0 ? seated / capacity : 0;
  const color = pct >= 1 ? "#e01e2b" : pct >= 0.7 ? "#f5c518" : "#22c55e";
  return (
    <div className="h-1 w-full overflow-hidden rounded-full bg-white/[0.06]">
      <div
        className="h-full rounded-full transition-all duration-500"
        style={{ width: `${pct * 100}%`, background: color, boxShadow: `0 0 6px ${color}50` }}
      />
    </div>
  );
}

function TableRow({ table, onJoin, onWaitlist }: {
  table: Table;
  onJoin: (id: string) => void;
  onWaitlist: (id: string) => void;
}) {
  const full = table.seated >= table.capacity;
  const speed = SPEED_BADGE[table.speed];

  return (
    <tr className="border-b border-white/[0.04] transition hover:bg-white/[0.025]">
      <td className="px-4 py-3.5">
        <div className="flex items-center gap-2">
          {table.featured && (
            <span className="shrink-0 text-[#f5c518] text-xs">★</span>
          )}
          <div>
            <p className="text-sm font-semibold text-white">{table.name}</p>
            <p className="text-[11px] text-neutral-500">{GAME_LABELS[table.game]}</p>
          </div>
        </div>
      </td>
      <td className="px-4 py-3.5">
        <span className="font-display text-sm font-bold text-[#f5c518]">{table.stakes}</span>
        <p className="text-[11px] text-neutral-500">{table.blinds}</p>
      </td>
      <td className="px-4 py-3.5">
        <div className="space-y-1.5 w-24">
          <div className="flex justify-between text-[11px]">
            <span className="text-neutral-400">{table.seated}/{table.capacity}</span>
            {table.waiting > 0 && (
              <span className="text-[#f5c518]">+{table.waiting} wait</span>
            )}
          </div>
          <OccupancyBar seated={table.seated} capacity={table.capacity} />
        </div>
      </td>
      <td className="px-4 py-3.5 text-sm text-neutral-300">
        ${table.avgPot}
      </td>
      <td className="px-4 py-3.5">
        <span className="text-xs font-semibold" style={{ color: speed.color }}>
          {speed.label}
        </span>
        <p className="text-[11px] text-neutral-500">{table.handsPerHour}/hr</p>
      </td>
      <td className="px-4 py-3.5 text-right">
        {full ? (
          <button
            type="button"
            onClick={() => onWaitlist(table.id)}
            className="rounded-lg border border-[#f5c518]/30 bg-[#f5c518]/10 px-3 py-1.5 text-xs font-bold text-[#f5c518] hover:bg-[#f5c518]/20 transition"
          >
            Join Waitlist ({table.waiting})
          </button>
        ) : (
          <button
            type="button"
            onClick={() => onJoin(table.id)}
            className="rounded-lg bg-gradient-to-r from-[#b91c1c] to-[#e01e2b] px-4 py-1.5 text-xs font-bold text-white shadow-[0_2px_8px_rgba(224,30,43,0.30)] hover:brightness-110 transition"
          >
            Take a Seat →
          </button>
        )}
      </td>
    </tr>
  );
}

export function TableFinder() {
  const [gameFilter, setGameFilter] = useState<GameType | "all">("all");
  const [speedFilter, setSpeedFilter] = useState<Speed | "all">("all");
  const [stakesFilter, setStakesFilter] = useState<"all" | "micro" | "low" | "mid" | "high">("all");
  const [seatsFilter, setSeatsFilter] = useState<"all" | "open">("all");
  const [sortBy, setSortBy] = useState<"avgPot" | "seated" | "handsPerHour">("avgPot");

  const filtered = DEMO_TABLES
    .filter((t) => gameFilter === "all" || t.game === gameFilter)
    .filter((t) => speedFilter === "all" || t.speed === speedFilter)
    .filter((t) => seatsFilter === "all" || t.seated < t.capacity)
    .filter((t) => {
      if (stakesFilter === "micro") return t.maxBuyin <= 50;
      if (stakesFilter === "low")   return t.maxBuyin > 50 && t.maxBuyin <= 200;
      if (stakesFilter === "mid")   return t.maxBuyin > 200 && t.maxBuyin <= 1000;
      if (stakesFilter === "high")  return t.maxBuyin > 1000;
      return true;
    })
    .sort((a, b) => b[sortBy] - a[sortBy]);

  const totalPlayers = DEMO_TABLES.reduce((s, t) => s + t.seated, 0);
  const openTables = DEMO_TABLES.filter((t) => t.seated < t.capacity).length;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold uppercase tracking-wide text-white">Cash Game Finder</h1>
          <p className="mt-0.5 text-xs text-neutral-500">
            <span className="text-[#22c55e] font-semibold">{totalPlayers} players</span> across {DEMO_TABLES.length} tables · {openTables} with open seats
          </p>
        </div>
        <button type="button" className="rounded-xl border border-[#22c55e]/30 bg-[#22c55e]/10 px-4 py-2 text-xs font-bold uppercase tracking-wide text-[#22c55e] hover:bg-[#22c55e]/20 transition">
          ⚡ Quick Seat
        </button>
      </div>

      {/* Filters */}
      <div className={cn(GLASS_PANEL, "p-4 flex flex-wrap gap-3 items-center")}>
        {/* Game type */}
        <div className="flex gap-1 rounded-xl border border-white/[0.07] bg-[#0f1318] p-1">
          {(["all", "NLH", "PLO", "PLO5", "Short"] as const).map((g) => (
            <button
              key={g}
              type="button"
              onClick={() => setGameFilter(g)}
              className={cn(
                "rounded-lg px-3 py-1.5 text-xs font-bold uppercase tracking-wide transition",
                gameFilter === g ? "bg-[#f5c518]/10 text-[#f5c518] border border-[#f5c518]/25" : "text-neutral-500 hover:text-white",
              )}
            >
              {g === "all" ? "All Games" : g}
            </button>
          ))}
        </div>

        {/* Stakes */}
        <select
          value={stakesFilter}
          onChange={(e) => setStakesFilter(e.target.value as typeof stakesFilter)}
          className="rounded-xl border border-white/[0.10] bg-[#0f1318] px-3 py-2 text-xs text-white outline-none focus:border-[#f5c518]/50"
        >
          <option value="all">All Stakes</option>
          <option value="micro">Micro (&lt;$50)</option>
          <option value="low">Low ($50–$200)</option>
          <option value="mid">Mid ($200–$1k)</option>
          <option value="high">High ($1k+)</option>
        </select>

        {/* Speed */}
        <select
          value={speedFilter}
          onChange={(e) => setSpeedFilter(e.target.value as typeof speedFilter)}
          className="rounded-xl border border-white/[0.10] bg-[#0f1318] px-3 py-2 text-xs text-white outline-none focus:border-[#f5c518]/50"
        >
          <option value="all">All Speeds</option>
          <option value="regular">Regular</option>
          <option value="fast">Fast</option>
          <option value="turbo">Turbo</option>
        </select>

        {/* Open seats */}
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={seatsFilter === "open"}
            onChange={(e) => setSeatsFilter(e.target.checked ? "open" : "all")}
            className="h-4 w-4 rounded border border-white/20 bg-white/5 accent-[#f5c518]"
          />
          <span className="text-xs text-neutral-400">Open seats only</span>
        </label>

        {/* Sort */}
        <div className="ml-auto flex items-center gap-2">
          <span className="text-[11px] text-neutral-500">Sort:</span>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
            className="rounded-xl border border-white/[0.10] bg-[#0f1318] px-3 py-2 text-xs text-white outline-none focus:border-[#f5c518]/50"
          >
            <option value="avgPot">Avg Pot</option>
            <option value="seated">Players</option>
            <option value="handsPerHour">Hands/hr</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className={cn(GLASS_PANEL, "overflow-hidden")}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-white/[0.07]">
                {["Table", "Stakes", "Players", "Avg Pot", "Speed", ""].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-[0.20em] text-neutral-500">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((t) => (
                <TableRow
                  key={t.id}
                  table={t}
                  onJoin={(id) => console.log("Join", id)}
                  onWaitlist={(id) => console.log("Waitlist", id)}
                />
              ))}
            </tbody>
          </table>
        </div>
        {filtered.length === 0 && (
          <div className="py-12 text-center">
            <p className="text-sm text-neutral-500">No tables match your filters</p>
          </div>
        )}
      </div>
    </div>
  );
}
