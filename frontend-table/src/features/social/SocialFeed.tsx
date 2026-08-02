"use client";
// ── Social Feed — Friends, Activity, Player Search ───────────────────────────
// New screen: real-time activity feed, friends list, online status, quick-add.
import { useState } from "react";
import { GLASS_PANEL, GLASS_PANEL_HOVER, cn } from "@/features/ui/tokens";

// ── Mock data ─────────────────────────────────────────────────────────────────
const DEMO_FRIENDS = [
  { id: "1", name: "AceHunter99",  status: "online",  activity: "Playing NL500 — Table #4412", avatar: "AH", win: "+$1,240", winTone: "green" },
  { id: "2", name: "RiverQueen",   status: "online",  activity: "Tournament — HRC Weekly Final", avatar: "RQ", win: "+$320",   winTone: "green" },
  { id: "3", name: "BluffMaster",  status: "away",    activity: "Last seen 12m ago", avatar: "BM", win: "-$80",    winTone: "red" },
  { id: "4", name: "ChipLeader",   status: "online",  activity: "Cash Game NL200", avatar: "CL", win: "+$560",   winTone: "green" },
  { id: "5", name: "FoldEquity",   status: "offline", activity: "Last seen 3h ago", avatar: "FE", win: "+$90",    winTone: "green" },
  { id: "6", name: "PocketRocket", status: "online",  activity: "Waiting List — NL1000", avatar: "PR", win: "+$2,100", winTone: "green" },
];

const DEMO_FEED = [
  { id: "f1", player: "AceHunter99",  action: "won a $4,200 pot",   detail: "Flopped a set of Kings vs top two pair",  time: "2m ago",  tone: "green",  icon: "♠" },
  { id: "f2", player: "RiverQueen",   action: "reached the Final Table", detail: "HRC Weekly Championship — 9 players remain", time: "8m ago",  tone: "gold",   icon: "★" },
  { id: "f3", player: "ChipLeader",   action: "joined NL200 Table #2201", detail: "Buy-in: $200",                          time: "14m ago", tone: "neutral", icon: "◈" },
  { id: "f4", player: "BluffMaster",  action: "lost a $1,800 pot",  detail: "Called river shove with second pair",       time: "22m ago", tone: "red",     icon: "♦" },
  { id: "f5", player: "PocketRocket", action: "registered for HRC Sunday Million", detail: "Buy-in: $1,050",              time: "35m ago", tone: "gold",    icon: "★" },
  { id: "f6", player: "AceHunter99",  action: "achieved Gold Status", detail: "Earned 10,000 loyalty points this month", time: "1h ago",  tone: "gold",    icon: "◆" },
  { id: "f7", player: "FoldEquity",   action: "completed a study session", detail: "Range Trainer — 45 min session",     time: "2h ago",  tone: "neutral", icon: "◉" },
  { id: "f8", player: "RiverQueen",   action: "won the HRC Nightly Turbo", detail: "Prize: $840 — 1st of 68 players",   time: "5h ago",  tone: "green",   icon: "♠" },
];

const STATUS_DOT: Record<string, string> = {
  online:  "#22c55e",
  away:    "#f5c518",
  offline: "#6b7280",
};

// ── Components ────────────────────────────────────────────────────────────────
function FriendRow({ f, onView }: { f: typeof DEMO_FRIENDS[0]; onView: (id: string) => void }) {
  const dotColor = STATUS_DOT[f.status];
  const winColor = f.winTone === "green" ? "#22c55e" : "#ff4455";
  return (
    <div
      className={cn(GLASS_PANEL, GLASS_PANEL_HOVER, "flex items-center gap-3 p-3 cursor-pointer")}
      onClick={() => onView(f.id)}
    >
      {/* Avatar */}
      <div className="relative shrink-0">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[#2a3344] to-[#1a2030] font-display text-sm font-bold text-[#f5c518]">
          {f.avatar}
        </div>
        <span
          className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-[#0f1318]"
          style={{ background: dotColor, boxShadow: `0 0 6px ${dotColor}` }}
        />
      </div>
      {/* Info */}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-white">{f.name}</p>
        <p className="truncate text-[11px] text-neutral-500">{f.activity}</p>
      </div>
      {/* Session win */}
      <span className="shrink-0 text-sm font-bold tabular-nums" style={{ color: winColor }}>
        {f.win}
      </span>
    </div>
  );
}

function FeedItem({ item }: { item: typeof DEMO_FEED[0] }) {
  const toneColor =
    item.tone === "green"   ? "#22c55e" :
    item.tone === "gold"    ? "#f5c518" :
    item.tone === "red"     ? "#ff4455" :
    "rgba(255,255,255,0.40)";
  return (
    <div className="flex gap-3 py-3 border-b border-white/[0.05] last:border-0">
      {/* Icon */}
      <div
        className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-sm"
        style={{ background: `${toneColor}15`, border: `1px solid ${toneColor}30`, color: toneColor }}
      >
        {item.icon}
      </div>
      {/* Content */}
      <div className="min-w-0 flex-1">
        <p className="text-sm text-white">
          <span className="font-semibold text-[#f5c518]">{item.player}</span>{" "}
          <span style={{ color: toneColor }}>{item.action}</span>
        </p>
        <p className="mt-0.5 text-[11px] text-neutral-500">{item.detail}</p>
      </div>
      {/* Time */}
      <span className="shrink-0 text-[11px] text-neutral-600">{item.time}</span>
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────
export function SocialFeed({ onViewPlayer }: { onViewPlayer?: (id: string) => void }) {
  const [tab, setTab] = useState<"feed" | "friends" | "requests">("feed");
  const [search, setSearch] = useState("");

  const filteredFriends = DEMO_FRIENDS.filter(
    (f) => !search || f.name.toLowerCase().includes(search.toLowerCase()),
  );

  const online = DEMO_FRIENDS.filter((f) => f.status === "online").length;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold uppercase tracking-wide text-white">
            Social Hub
          </h1>
          <p className="mt-0.5 text-xs text-neutral-500">
            <span className="text-[#22c55e] font-semibold">{online} friends online</span> · {DEMO_FRIENDS.length} total
          </p>
        </div>
        <button
          type="button"
          className="rounded-xl border border-[#f5c518]/30 bg-[#f5c518]/10 px-4 py-2 text-xs font-bold uppercase tracking-wide text-[#f5c518] transition hover:bg-[#f5c518]/20"
        >
          + Add Friend
        </button>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 rounded-xl border border-white/[0.07] bg-[#181e27] p-1">
        {(["feed", "friends", "requests"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={cn(
              "flex-1 rounded-lg py-2 text-xs font-bold uppercase tracking-wide transition",
              tab === t
                ? "bg-[#f5c518]/10 text-[#f5c518] border border-[#f5c518]/25"
                : "text-neutral-500 hover:text-white",
            )}
          >
            {t === "feed" ? "Activity Feed" : t === "friends" ? `Friends (${DEMO_FRIENDS.length})` : "Requests (2)"}
          </button>
        ))}
      </div>

      {/* Feed tab */}
      {tab === "feed" && (
        <div className={cn(GLASS_PANEL, "p-5")}>
          <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.25em] text-neutral-500">
            Recent Activity
          </p>
          {DEMO_FEED.map((item) => (
            <FeedItem key={item.id} item={item} />
          ))}
        </div>
      )}

      {/* Friends tab */}
      {tab === "friends" && (
        <div className="space-y-3">
          {/* Search */}
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search friends…"
            className="w-full rounded-xl border border-white/[0.10] bg-[#0f1318]/80 px-4 py-2.5 text-sm text-white placeholder:text-neutral-600 outline-none focus:border-[#f5c518]/50 focus:ring-2 focus:ring-[#f5c518]/10"
          />
          {/* Online first */}
          <div className="space-y-2">
            <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-neutral-600">Online</p>
            {filteredFriends.filter((f) => f.status === "online").map((f) => (
              <FriendRow key={f.id} f={f} onView={onViewPlayer ?? (() => {})} />
            ))}
          </div>
          <div className="space-y-2">
            <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-neutral-600">Away / Offline</p>
            {filteredFriends.filter((f) => f.status !== "online").map((f) => (
              <FriendRow key={f.id} f={f} onView={onViewPlayer ?? (() => {})} />
            ))}
          </div>
        </div>
      )}

      {/* Requests tab */}
      {tab === "requests" && (
        <div className={cn(GLASS_PANEL, "p-5 space-y-3")}>
          {["SharpeShooter", "PokerPro2024"].map((name) => (
            <div key={name} className="flex items-center justify-between gap-3 py-2 border-b border-white/[0.05] last:border-0">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#2a3344] font-display text-sm font-bold text-neutral-400">
                  {name.slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <p className="text-sm font-semibold text-white">{name}</p>
                  <p className="text-[11px] text-neutral-500">Wants to add you as a friend</p>
                </div>
              </div>
              <div className="flex gap-2">
                <button type="button" className="rounded-lg border border-[#22c55e]/30 bg-[#22c55e]/10 px-3 py-1.5 text-xs font-bold text-[#22c55e] hover:bg-[#22c55e]/20 transition">
                  Accept
                </button>
                <button type="button" className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-bold text-neutral-400 hover:text-white transition">
                  Decline
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
