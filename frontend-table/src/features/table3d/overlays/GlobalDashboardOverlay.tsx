"use client";

// Global Dashboard / club-home overlay (HRC full_body master 11). The owner's
// bird's-eye view over the whole club, reachable from Admin Control: navigation
// rail, the three headline stat tiles (Total Members / Active Tables / Total Club
// Volume), the Ongoing Featured Games strip, and the live Club Activity feed.
// Every figure is a pure projection of authoritative backend state via
// useClubDashboard (club_quick_stats + club_browse) — CLAUDE.md rules #3/#4 —
// with a clearly-labelled DEMO fallback offline (rule #2).

import { GLASS_PANEL, HEADING_LG, cn } from "@/features/ui/tokens";
import { useClubDashboard, type ActivityItem, type FeaturedGame } from "../clubDashboard";

/* -------------------------------- stat tile ------------------------------- */

function StatTile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div
      className={cn(GLASS_PANEL, "flex flex-col items-center justify-center border-gold/25 px-6 py-8 text-center")}
      style={{ background: "linear-gradient(180deg,#1b1a12,#141310)" }}
    >
      <span className="text-sm uppercase tracking-[0.15em] text-neutral-300">{label}</span>
      <span className="mt-4 font-display text-5xl font-bold text-[#f3e2ad]">{value}</span>
      {sub && <span className="mt-2 text-[13px] text-neutral-400">{sub}</span>}
    </div>
  );
}

/* ------------------------------ featured game ----------------------------- */

function FeaturedCard({ game }: { game: FeaturedGame }) {
  return (
    <div className={cn(GLASS_PANEL, "border-gold/20 p-3")}>
      <div
        className="relative flex aspect-[4/3] items-center justify-center overflow-hidden rounded-xl"
        style={{ background: "radial-gradient(ellipse at center,#1c7d4e 0%,#0f5f39 55%,#053821 100%)" }}
      >
        <div className="absolute inset-3 rounded-[999px] border border-gold/40" />
        {/* Seated portraits arranged around the felt ring. */}
        {game.seatAvatars.slice(0, 6).map((src, i) => {
          const angle = (i / 6) * Math.PI * 2 - Math.PI / 2;
          const x = 50 + Math.cos(angle) * 40;
          const y = 50 + Math.sin(angle) * 40;
          return (
            <div
              key={i}
              className="absolute h-6 w-6 overflow-hidden rounded-full border border-gold/50"
              style={{ left: `${x}%`, top: `${y}%`, transform: "translate(-50%,-50%)" }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} alt="" className="h-full w-full object-cover" />
            </div>
          );
        })}
        <span className="relative rounded-full bg-black/40 px-2 py-0.5 text-[9px] font-bold text-gold">
          {game.seated}/{game.maxSeats}
        </span>
      </div>
      <p className="mt-3 text-center text-sm text-neutral-300">
        {game.label}: {game.seated}/{game.maxSeats}, {game.stakes}
      </p>
    </div>
  );
}

/* ------------------------------ activity row ------------------------------ */

const ACTIVITY_DOT: Record<ActivityItem["kind"], string> = {
  win: "#22c55e",
  member: "#81ecff",
  tournament: "#f5c518",
  info: "#9aa0a6",
};

function ActivityRow({ item }: { item: ActivityItem }) {
  return (
    <div className={cn(GLASS_PANEL, "flex items-start gap-2 border-white/10 px-3 py-2.5")}>
      <span
        className="mt-1.5 h-2 w-2 flex-shrink-0 rounded-full"
        style={{ background: ACTIVITY_DOT[item.kind], boxShadow: `0 0 8px ${ACTIVITY_DOT[item.kind]}` }}
      />
      <span className="text-[13px] leading-snug text-neutral-200">{item.text}</span>
    </div>
  );
}

/* ---------------------------------- root ---------------------------------- */

const NAV = [
  { icon: "⌂", label: "Home", active: true },
  { icon: "🏆", label: "Tournaments" },
  { icon: "👥", label: "Member Management" },
  { icon: "📊", label: "Financial Reports" },
];

export function GlobalDashboardOverlay({ demo, onClose }: { demo: boolean; onClose: () => void }) {
  const { data, loading } = useClubDashboard(demo);

  return (
    <div className="pointer-events-auto fixed inset-0 z-50 overflow-y-auto" style={{ background: "#0b0d0f" }}>
      {/* faint club backdrop wash */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(1200px 600px at 50% -10%, rgba(245,197,24,0.06), transparent 60%), radial-gradient(800px 400px at 100% 0%, rgba(129,236,255,0.05), transparent 60%)",
        }}
      />

      <button
        type="button"
        onClick={onClose}
        className={cn(
          GLASS_PANEL,
          "absolute right-5 top-5 z-10 flex items-center gap-2 rounded-xl border-gold/30 px-4 py-2 text-sm font-semibold text-gold hover:border-gold/60",
        )}
      >
        ← Back to Table
      </button>

      <div className="relative mx-auto flex min-h-screen w-full max-w-[1400px] gap-6 p-6">
        {/* nav rail */}
        <nav className="hidden w-56 flex-shrink-0 flex-col gap-1 pt-24 md:flex">
          {NAV.map((n) => (
            <div
              key={n.label}
              className={cn(
                "flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-semibold",
                n.active ? "bg-white/[0.06] text-white" : "text-neutral-400",
              )}
            >
              <span className="text-lg" aria-hidden>{n.icon}</span>
              {n.label}
            </div>
          ))}
        </nav>

        {/* main */}
        <main className="min-w-0 flex-1 pt-16">
          <h1 className="mb-6 font-display text-3xl font-bold text-[#f3e2ad]">Global Dashboard</h1>

          {loading && !data ? (
            <div className="py-24 text-center text-sm text-neutral-500">Loading club overview…</div>
          ) : data ? (
            <>
              <div className="grid gap-5 sm:grid-cols-3">
                <StatTile label="Total Members" value={data.stat.totalMembers.toLocaleString()} />
                <StatTile label="Active Tables" value={String(data.stat.activeTables)} />
                <StatTile
                  label="Total Club Volume"
                  value={data.stat.totalVolumeChips.toLocaleString()}
                  sub={`Chips${data.stat.volumeEth ? ` / ${data.stat.volumeEth} ETH` : ""}`}
                />
              </div>

              <section className={cn(GLASS_PANEL, "mt-6 border-gold/20 p-5")}>
                <h2 className={cn(HEADING_LG, "text-neutral-200")}>Ongoing Featured Games</h2>
                <div className="mt-4 grid gap-4 sm:grid-cols-3">
                  {data.featured.map((g) => (
                    <FeaturedCard key={g.id} game={g} />
                  ))}
                </div>
              </section>
            </>
          ) : (
            <div className="py-24 text-center text-sm text-neutral-500">No club data available.</div>
          )}
        </main>

        {/* activity rail */}
        <aside className="hidden w-72 flex-shrink-0 flex-col pt-24 lg:flex">
          <h2 className={cn(HEADING_LG, "mb-4 text-neutral-200")}>Club Activity</h2>
          <div className="flex flex-col gap-3">
            {(data?.activity ?? []).length === 0 ? (
              <p className="text-sm text-neutral-500">No recent activity.</p>
            ) : (
              data!.activity.map((a) => <ActivityRow key={a.id} item={a} />)
            )}
          </div>
          {data && !data.live && (
            <p className="mt-4 text-[11px] text-neutral-600">Demo overview — connect a club to see live figures.</p>
          )}
        </aside>
      </div>
    </div>
  );
}
