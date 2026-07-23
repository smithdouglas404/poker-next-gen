"use client";

import { avatarSrc } from "@/features/table/avatars";

const NAV = [
  { label: "Dashboard", icon: "◈" },
  { label: "Members", icon: "☰", active: true },
  { label: "Games & Tournaments", icon: "♠" },
  { label: "Settings", icon: "⚙" },
  { label: "League & Alliances", icon: "⚑" },
  { label: "Analytics", icon: "📊" },
];

const MEMBERS = [
  { role: "Owner", name: "TheonBess", avatar: "punk-duchess", status: "Online", stat: "482.k $", cta: "Set Role" },
  { role: "Manager", name: "CardQueen", avatar: "mech-pilot", status: "Online", stat: "292.4k $", cta: "Set Role" },
  { role: "Member", name: "Bank-StatesHarry", avatar: "iron-bull", status: "Away", stat: "33.0k $", cta: "Message" },
  { role: "Member", name: "NeonFox_Ace", avatar: "neon-fox", status: "Online", stat: "128.7k $", cta: "Message" },
];

export default function ClubDashboard() {
  return (
    <div
      className="relative flex h-screen w-screen items-center justify-center overflow-hidden"
      style={{
        background:
          "radial-gradient(900px 600px at 15% 10%, rgba(56,230,255,0.12), transparent 55%)," +
          "radial-gradient(900px 600px at 85% 90%, rgba(20,50,80,0.5), transparent 60%)," +
          "linear-gradient(120deg,#05080e,#0a1420 55%,#05080e)",
      }}
    >
      {/* faux server-room depth lines */}
      <div className="pointer-events-none absolute inset-0 opacity-40" style={{ background: "repeating-linear-gradient(90deg, transparent 0 78px, rgba(56,230,255,0.05) 78px 80px)" }} />

      <div
        className="relative flex w-[1180px] max-w-[94vw] overflow-hidden rounded-3xl"
        style={{
          border: "1px solid rgba(127,233,255,0.28)",
          background: "linear-gradient(160deg, rgba(14,22,34,0.72), rgba(8,14,22,0.66))",
          backdropFilter: "blur(24px)",
          boxShadow: "0 40px 120px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.06), 0 0 60px rgba(56,230,255,0.10)",
        }}
      >
        {/* sidebar */}
        <aside className="w-[248px] shrink-0 border-r border-white/10 p-6">
          <div className="mb-8 flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl text-2xl" style={{ background: "linear-gradient(180deg,#f3e2ad,#d4af37)", color: "#3a2c07" }}>♜</div>
            <div className="leading-tight">
              <div className="text-sm font-bold tracking-wide" style={{ color: "#f3e2ad" }}>HIGH ROLLERS</div>
              <div className="text-[11px] tracking-[0.35em] text-white/50">CLUB</div>
            </div>
          </div>
          <nav className="space-y-1">
            {NAV.map((n) => (
              <div
                key={n.label}
                className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm"
                style={
                  n.active
                    ? { background: "rgba(56,230,255,0.14)", border: "1px solid rgba(127,233,255,0.4)", color: "#bff0ff" }
                    : { color: "rgba(255,255,255,0.6)" }
                }
              >
                <span className="w-5 text-center opacity-80">{n.icon}</span>
                <span className="font-medium">{n.label}</span>
              </div>
            ))}
          </nav>
        </aside>

        {/* main */}
        <div className="flex-1 p-7">
          <div className="mb-5 flex items-end justify-between">
            <h1 className="text-3xl font-bold tracking-wide text-white">Members</h1>
            <div className="text-[11px] uppercase tracking-[0.25em] text-white/40">High Rollers Club · 128 members</div>
          </div>

          <div className="grid grid-cols-[1fr_320px] gap-6">
            {/* roster */}
            <div>
              <div className="mb-2 grid grid-cols-[1fr_90px_90px] px-3 text-[11px] uppercase tracking-[0.2em] text-white/40">
                <span>Name / Role</span><span>Status</span><span className="text-right">Balance</span>
              </div>
              <div className="space-y-2.5">
                {MEMBERS.map((m) => (
                  <div key={m.name} className="grid grid-cols-[1fr_90px_90px] items-center rounded-xl px-3 py-3" style={{ background: "rgba(255,255,255,0.035)", border: "1px solid rgba(255,255,255,0.07)" }}>
                    <div className="flex items-center gap-3">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={avatarSrc(m.avatar)} alt="" width={48} height={48} className="rounded-lg" style={{ border: "2px solid rgba(127,233,255,0.5)", objectFit: "cover" }} />
                      <div>
                        <div className="text-[11px] uppercase tracking-wide" style={{ color: m.role === "Owner" ? "#f3c14b" : m.role === "Manager" ? "#7fe9ff" : "rgba(255,255,255,0.5)" }}>{m.role}</div>
                        <div className="text-sm font-semibold text-white">{m.name}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 text-[12px]">
                      <span className="inline-block h-2 w-2 rounded-full" style={{ background: m.status === "Online" ? "#33d17a" : "#e0a83a", boxShadow: `0 0 8px ${m.status === "Online" ? "#33d17a" : "#e0a83a"}` }} />
                      <span className="text-white/70">{m.status}</span>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-bold" style={{ color: "#f3e2ad" }}>{m.stat}</div>
                      <button className="mt-0.5 rounded-md px-2 py-0.5 text-[10px] text-white/60" style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)" }}>{m.cta}</button>
                    </div>
                  </div>
                ))}
              </div>

              {/* daily missions */}
              <div className="mt-5 rounded-2xl p-4" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
                <div className="mb-3 text-[11px] uppercase tracking-[0.25em] text-white/50">Daily Missions</div>
                <div className="grid grid-cols-3 gap-3">
                  {[["Play 10 Hands", "♠", 0.6], ["Win a Sit & Go", "🏆", 0.3], ["Refer a Friend", "✦", 0.0]].map(([t, ic, pct]) => (
                    <div key={t as string} className="rounded-xl p-3 text-center" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
                      <div className="mb-1 text-xl">{ic as string}</div>
                      <div className="mb-2 text-[11px] text-white/70">{t}</div>
                      <div className="h-1.5 rounded-full" style={{ background: "rgba(255,255,255,0.08)" }}>
                        <div className="h-1.5 rounded-full" style={{ width: `${(pct as number) * 100}%`, background: "#7fe9ff", boxShadow: "0 0 8px #7fe9ff" }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* right column */}
            <div className="space-y-4">
              {/* news */}
              <div className="rounded-2xl p-4" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
                <div className="mb-2 flex items-center justify-between text-[11px] uppercase tracking-[0.2em] text-white/50">
                  <span>Club &amp; Alliance News</span>
                  <span className="rounded-full px-1.5 text-[10px]" style={{ background: "#c9302c", color: "white" }}>3</span>
                </div>
                <p className="text-[12px] leading-relaxed text-white/65">High Rollers Club has formed an alliance with Diamond Kings. Cross-club tournament seats now open — check the lobby before Sunday.</p>
              </div>

              {/* pending join */}
              <div className="rounded-2xl p-4" style={{ background: "rgba(56,230,255,0.06)", border: "1px solid rgba(127,233,255,0.3)" }}>
                <div className="mb-3 text-[11px] uppercase tracking-[0.2em]" style={{ color: "#9be9ff" }}>Pending Join Requests</div>
                <div className="flex items-center gap-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={avatarSrc("void-witch")} alt="" width={44} height={44} className="rounded-lg" style={{ border: "2px solid #b44dff", objectFit: "cover" }} />
                  <div className="flex-1">
                    <div className="text-sm font-semibold text-white">PlayerX_Toddler</div>
                    <div className="text-[11px] text-white/50">Requests to join</div>
                  </div>
                </div>
                <div className="mt-3 flex gap-2">
                  <button className="flex-1 rounded-lg py-2 text-[12px] font-bold text-white" style={{ background: "linear-gradient(180deg,#2fbf6b,#1c8a4b)" }}>APPROVE</button>
                  <button className="flex-1 rounded-lg py-2 text-[12px] font-bold text-white" style={{ background: "linear-gradient(180deg,#d9534f,#a12e2a)" }}>DECLINE</button>
                </div>
              </div>

              {/* upcoming private games */}
              <div className="rounded-2xl p-4" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
                <div className="mb-2 text-[11px] uppercase tracking-[0.2em] text-white/50">Upcoming Private Games</div>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-semibold text-white">Tonight · 9 PM EST</div>
                    <div className="text-[11px] text-white/50">$2 / $4 No-Limit · 6-max</div>
                  </div>
                  <button className="rounded-lg px-3 py-2 text-[11px] font-bold text-white" style={{ background: "linear-gradient(180deg,#2fbf6b,#1c8a4b)" }}>REMIND ME</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
