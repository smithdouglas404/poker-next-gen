"use client";
// ── Tournament Detail Page ───────────────────────────────────────────────────
// Full tournament detail: hero banner, structure, payouts, registered players,
// blind schedule, and registration CTA.
import { useState } from "react";
import { GLASS_PANEL, cn } from "@/features/ui/tokens";

type DetailTab = "overview" | "structure" | "payouts" | "players";

const DEMO_BLIND_LEVELS = [
  { level: 1,  sb: 25,    bb: 50,    ante: 0,    duration: 15 },
  { level: 2,  sb: 50,    bb: 100,   ante: 100,  duration: 15 },
  { level: 3,  sb: 75,    bb: 150,   ante: 150,  duration: 15 },
  { level: 4,  sb: 100,   bb: 200,   ante: 200,  duration: 15 },
  { level: 5,  sb: 150,   bb: 300,   ante: 300,  duration: 15 },
  { level: 6,  sb: 200,   bb: 400,   ante: 400,  duration: 15 },
  { level: 7,  sb: 300,   bb: 600,   ante: 600,  duration: 15 },
  { level: 8,  sb: 400,   bb: 800,   ante: 800,  duration: 15 },
  { level: 9,  sb: 500,   bb: 1000,  ante: 1000, duration: 15 },
  { level: 10, sb: 750,   bb: 1500,  ante: 1500, duration: 15 },
  { level: 11, sb: 1000,  bb: 2000,  ante: 2000, duration: 15 },
  { level: 12, sb: 1500,  bb: 3000,  ante: 3000, duration: 15 },
];

const DEMO_PAYOUTS = [
  { place: 1,  prize: "$180,000", pct: "18.0%" },
  { place: 2,  prize: "$110,000", pct: "11.0%" },
  { place: 3,  prize: "$72,000",  pct: "7.2%"  },
  { place: 4,  prize: "$52,000",  pct: "5.2%"  },
  { place: 5,  prize: "$38,000",  pct: "3.8%"  },
  { place: 6,  prize: "$28,000",  pct: "2.8%"  },
  { place: 7,  prize: "$22,000",  pct: "2.2%"  },
  { place: 8,  prize: "$18,000",  pct: "1.8%"  },
  { place: 9,  prize: "$14,000",  pct: "1.4%"  },
  { place: "10–18",  prize: "$8,000 each",  pct: "0.8%" },
  { place: "19–27",  prize: "$5,000 each",  pct: "0.5%" },
  { place: "28–45",  prize: "$3,000 each",  pct: "0.3%" },
  { place: "46–90",  prize: "$1,500 each",  pct: "0.15%" },
  { place: "91–150", prize: "$1,050 each",  pct: "0.105%" },
];

const DEMO_PLAYERS = [
  { name: "AceHunter99",  country: "🇺🇸", chips: 284000, status: "playing" },
  { name: "RiverQueen",   country: "🇬🇧", chips: 198000, status: "playing" },
  { name: "ChipLeader",   country: "🇩🇪", chips: 176000, status: "playing" },
  { name: "BluffMaster",  country: "🇨🇦", chips: 142000, status: "playing" },
  { name: "PocketRocket", country: "🇦🇺", chips: 128000, status: "playing" },
  { name: "SharpeShooter",country: "🇫🇷", chips: 112000, status: "playing" },
  { name: "FoldEquity",   country: "🇧🇷", chips: 98000,  status: "playing" },
  { name: "PokerPro2024", country: "🇯🇵", chips: 84000,  status: "playing" },
  { name: "AllInAndy",    country: "🇲🇽", chips: 72000,  status: "playing" },
  { name: "ValueBet99",   country: "🇰🇷", chips: 58000,  status: "playing" },
];

export function TournamentDetail({
  id = "hrc-weekly-championship",
}: {
  id?: string;
}) {
  const [tab, setTab] = useState<DetailTab>("overview");
  const [registered, setRegistered] = useState(false);

  const tournament = {
    name: "HRC Weekly Championship",
    status: "registering",
    startTime: "Oct 26, 2024 · 18:00 UTC",
    guaranteedPrize: "$1,000,000",
    buyIn: "$10,000",
    fee: "$500",
    startingStack: 100000,
    blindLevels: 15,
    lateReg: "2 hours",
    registered: 284,
    maxPlayers: 1000,
    type: "No Limit Hold'em",
    structure: "Freezeout",
  };

  const regPct = Math.round((tournament.registered / tournament.maxPlayers) * 100);

  return (
    <div className="space-y-5">
      {/* Hero banner */}
      <div className="relative overflow-hidden rounded-2xl border border-[#f5c518]/20 bg-gradient-to-br from-[#1a1208] via-[#181e27] to-[#0f1318] p-6 shadow-[0_4px_32px_rgba(245,197,24,0.08)]">
        <div className="absolute inset-0 opacity-10" style={{
          backgroundImage: "radial-gradient(ellipse at 80% 20%, #f5c518 0%, transparent 60%)",
        }} />
        <div className="relative flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-3">
            {/* Status badge */}
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-[#22c55e]/30 bg-[#22c55e]/10 px-3 py-1 text-xs font-bold uppercase tracking-wide text-[#22c55e]">
                <span className="h-1.5 w-1.5 rounded-full bg-[#22c55e] animate-pulse" />
                Registration Open
              </span>
              <span className="text-xs text-neutral-500">{tournament.type} · {tournament.structure}</span>
            </div>
            <h1 className="font-display text-3xl font-bold uppercase tracking-wide text-white lg:text-4xl">
              {tournament.name}
            </h1>
            <p className="text-sm text-neutral-400">{tournament.startTime}</p>
            {/* Key stats */}
            <div className="flex flex-wrap gap-4">
              {[
                { label: "Guaranteed", value: tournament.guaranteedPrize, color: "#f5c518" },
                { label: "Buy-in", value: `${tournament.buyIn} + ${tournament.fee}`, color: "white" },
                { label: "Starting Stack", value: `${(tournament.startingStack / 1000).toFixed(0)}K chips`, color: "white" },
                { label: "Blind Levels", value: `${tournament.blindLevels} min`, color: "white" },
              ].map((s) => (
                <div key={s.label}>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.20em] text-neutral-600">{s.label}</p>
                  <p className="font-display text-lg font-bold" style={{ color: s.color }}>{s.value}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Registration CTA */}
          <div className={cn(GLASS_PANEL, "shrink-0 w-full p-5 space-y-4 lg:w-72")}>
            <div>
              <div className="flex justify-between text-xs mb-1.5">
                <span className="text-neutral-500">{tournament.registered} registered</span>
                <span className="text-neutral-500">{tournament.maxPlayers} max</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-white/[0.06]">
                <div
                  className="h-full rounded-full transition-all duration-700"
                  style={{ width: `${regPct}%`, background: "linear-gradient(90deg,#22c55e,#16a34a)", boxShadow: "0 0 8px rgba(34,197,94,0.30)" }}
                />
              </div>
              <p className="mt-1 text-right text-[11px] text-neutral-500">{regPct}% full</p>
            </div>
            <button
              type="button"
              onClick={() => setRegistered(!registered)}
              className={cn(
                "w-full rounded-xl py-3 text-sm font-bold uppercase tracking-wide transition",
                registered
                  ? "border border-[#ff4455]/30 bg-[#ff4455]/10 text-[#ff4455] hover:bg-[#ff4455]/20"
                  : "bg-gradient-to-r from-[#92700a] to-[#f5c518] text-black shadow-[0_2px_12px_rgba(245,197,24,0.30)] hover:brightness-110",
              )}
            >
              {registered ? "✓ Registered — Unregister" : `Register · ${tournament.buyIn}`}
            </button>
            <p className="text-center text-[11px] text-neutral-500">
              Late registration: {tournament.lateReg} after start
            </p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-xl border border-white/[0.07] bg-[#181e27] p-1">
        {(["overview", "structure", "payouts", "players"] as DetailTab[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={cn(
              "flex-1 rounded-lg py-2 text-xs font-bold uppercase tracking-wide transition",
              tab === t ? "bg-[#f5c518]/10 text-[#f5c518] border border-[#f5c518]/25" : "text-neutral-500 hover:text-white",
            )}
          >
            {t === "overview" ? "Overview" : t === "structure" ? "Blind Structure" : t === "payouts" ? "Payouts" : `Players (${tournament.registered})`}
          </button>
        ))}
      </div>

      {/* Overview */}
      {tab === "overview" && (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className={cn(GLASS_PANEL, "p-5 space-y-3")}>
            <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-neutral-500">Tournament Info</p>
            {[
              { label: "Game", value: tournament.type },
              { label: "Structure", value: tournament.structure },
              { label: "Buy-in", value: `${tournament.buyIn} + ${tournament.fee} fee` },
              { label: "Guaranteed Prize Pool", value: tournament.guaranteedPrize },
              { label: "Starting Stack", value: `${tournament.startingStack.toLocaleString()} chips` },
              { label: "Blind Level Duration", value: `${tournament.blindLevels} minutes` },
              { label: "Late Registration", value: tournament.lateReg },
              { label: "Max Players", value: tournament.maxPlayers.toLocaleString() },
            ].map((row) => (
              <div key={row.label} className="flex justify-between border-b border-white/[0.05] pb-2.5 last:border-0 last:pb-0">
                <span className="text-sm text-neutral-500">{row.label}</span>
                <span className="text-sm font-semibold text-white">{row.value}</span>
              </div>
            ))}
          </div>
          <div className={cn(GLASS_PANEL, "p-5 space-y-3")}>
            <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-neutral-500">Schedule</p>
            {[
              { time: "17:30 UTC", event: "Registration opens", status: "done" },
              { time: "18:00 UTC", event: "Cards in the air", status: "upcoming" },
              { time: "20:00 UTC", event: "Late registration closes", status: "upcoming" },
              { time: "~00:00 UTC", event: "Estimated final table", status: "upcoming" },
              { time: "~02:00 UTC", event: "Estimated winner", status: "upcoming" },
            ].map((s, i) => (
              <div key={i} className="flex items-start gap-3 border-b border-white/[0.05] pb-2.5 last:border-0 last:pb-0">
                <span className={cn("mt-0.5 h-2 w-2 shrink-0 rounded-full", s.status === "done" ? "bg-[#22c55e]" : "bg-white/20")} />
                <div>
                  <p className="text-xs font-bold text-[#f5c518]">{s.time}</p>
                  <p className="text-sm text-neutral-300">{s.event}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Blind Structure */}
      {tab === "structure" && (
        <div className={cn(GLASS_PANEL, "overflow-hidden")}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[500px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-white/[0.07]">
                  {["Level", "Small Blind", "Big Blind", "Ante", "Duration"].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-[0.20em] text-neutral-500">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {DEMO_BLIND_LEVELS.map((level) => (
                  <tr key={level.level} className="border-b border-white/[0.04] hover:bg-white/[0.025] transition">
                    <td className="px-4 py-3 font-bold text-[#f5c518]">Level {level.level}</td>
                    <td className="px-4 py-3 text-neutral-300">{level.sb.toLocaleString()}</td>
                    <td className="px-4 py-3 text-neutral-300">{level.bb.toLocaleString()}</td>
                    <td className="px-4 py-3 text-neutral-400">{level.ante > 0 ? level.ante.toLocaleString() : "—"}</td>
                    <td className="px-4 py-3 text-neutral-400">{level.duration} min</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Payouts */}
      {tab === "payouts" && (
        <div className={cn(GLASS_PANEL, "overflow-hidden")}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[400px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-white/[0.07]">
                  {["Place", "Prize", "% of Pool"].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-[0.20em] text-neutral-500">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {DEMO_PAYOUTS.map((p, i) => (
                  <tr key={i} className="border-b border-white/[0.04] hover:bg-white/[0.025] transition">
                    <td className="px-4 py-3">
                      <span className={cn(
                        "font-display font-bold",
                        i === 0 ? "text-[#f5c518] text-lg" : i === 1 ? "text-neutral-300" : i === 2 ? "text-amber-600" : "text-neutral-500",
                      )}>
                        {typeof p.place === "number" ? `${p.place}${p.place === 1 ? "st" : p.place === 2 ? "nd" : p.place === 3 ? "rd" : "th"}` : p.place}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-bold text-[#22c55e]">{p.prize}</td>
                    <td className="px-4 py-3 text-neutral-500">{p.pct}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Players */}
      {tab === "players" && (
        <div className={cn(GLASS_PANEL, "overflow-hidden")}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[400px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-white/[0.07]">
                  {["#", "Player", "Country", "Chips", "Status"].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-[0.20em] text-neutral-500">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {DEMO_PLAYERS.map((p, i) => (
                  <tr key={p.name} className="border-b border-white/[0.04] hover:bg-white/[0.025] transition">
                    <td className="px-4 py-3 font-bold text-neutral-500">{i + 1}</td>
                    <td className="px-4 py-3 font-semibold text-white">{p.name}</td>
                    <td className="px-4 py-3 text-lg">{p.country}</td>
                    <td className="px-4 py-3 font-display font-bold text-[#f5c518]">{p.chips.toLocaleString()}</td>
                    <td className="px-4 py-3">
                      <span className="rounded-full border border-[#22c55e]/30 bg-[#22c55e]/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#22c55e]">
                        {p.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
