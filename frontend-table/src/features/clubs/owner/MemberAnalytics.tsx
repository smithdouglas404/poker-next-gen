"use client";

import { GLASS_PANEL, cn } from "@/features/ui/tokens";

import { ColumnChart, Donut, LineChart } from "../charts";
import { compact, relTime, usd } from "./ownerRpc";
import { MemberAvatar, SectionTitle } from "./ui";
import type { RosterRow } from "./types";

/** Club Member Analytics Dashboard (master: detailed_private_table_setup_24) —
 * Active Members line, Total Table Volume columns, New-vs-Returning donut, and a
 * Member Activity table. Roster rows come from club_member_stats; the trend
 * series come from club_quick_stats history (demo-filled when unavailable). */
export function MemberAnalytics({
  roster,
  analytics,
  demo,
}: {
  roster: RosterRow[];
  analytics: {
    months: string[];
    activeMembers: number[];
    tableVolumeCents: number[];
    newPlayers: number;
    returningPlayers: number;
  };
  demo: boolean;
}) {
  const totalSplit = analytics.newPlayers + analytics.returningPlayers || 1;
  const newPct = Math.round((analytics.newPlayers / totalSplit) * 100);
  const retPct = 100 - newPct;

  const fmtK = (n: number) => (n >= 1000 ? `${Math.round(n / 1000)}k` : `${n}`);
  const fmtVolK = (cents: number) => {
    const d = cents / 100;
    return d >= 1000 ? `${Math.round(d / 1000)}k` : `${Math.round(d)}`;
  };

  const activity = [...roster]
    .sort((a, b) => b.activity_count - a.activity_count)
    .slice(0, 12);

  return (
    <div className="space-y-6">
      <div>
        <SectionTitle eyebrow="Owner Tools" title="Club Member Analytics Dashboard" />
        <p className="-mt-2 text-sm text-white/50">
          Engagement, volume, and retention across your membership.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Active Members — line */}
        <div className={cn(GLASS_PANEL, "p-5")}>
          <p className="font-display text-lg font-semibold text-white">Active Members</p>
          <div className="mt-3">
            <LineChart
              values={analytics.activeMembers}
              labels={analytics.months}
              color="#22c55e"
              fmtY={fmtK}
            />
          </div>
        </div>

        {/* Total Table Volume — columns */}
        <div className={cn(GLASS_PANEL, "p-5")}>
          <p className="font-display text-lg font-semibold text-white">Total Table Volume</p>
          <div className="mt-3">
            <ColumnChart
              values={analytics.tableVolumeCents}
              labels={analytics.months}
              color="#22c55e"
              fmtY={fmtVolK}
            />
          </div>
        </div>

        {/* New vs Returning — donut */}
        <div className={cn(GLASS_PANEL, "flex flex-col p-5")}>
          <p className="font-display text-lg font-semibold text-white">New vs Returning Players</p>
          <div className="mt-3 flex flex-1 items-center justify-center gap-6">
            <Donut
              size={124}
              thickness={16}
              segments={[
                { value: analytics.returningPlayers, color: "#22c55e", label: "Returning" },
                { value: analytics.newPlayers, color: "#3ad07a", label: "New" },
              ]}
              center={
                <div>
                  <p className="font-display text-lg font-bold text-green">{retPct}%</p>
                  <p className="text-[10px] text-white/40">returning</p>
                </div>
              }
            />
            <div className="space-y-3 text-sm">
              <div>
                <p className="font-display text-lg font-bold text-green">{retPct}%</p>
                <p className="text-[11px] text-white/45">Returning · {compact(analytics.returningPlayers)}</p>
              </div>
              <div>
                <p className="font-display text-lg font-bold text-white/70">{newPct}%</p>
                <p className="text-[11px] text-white/45">New · {compact(analytics.newPlayers)}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Member Activity table */}
      <div className={cn(GLASS_PANEL, "overflow-hidden")}>
        <div className="border-b border-white/[0.08] px-5 py-4">
          <p className="font-display text-lg font-semibold text-white">Member Activity</p>
        </div>
        <div className="grid grid-cols-[1.6fr_1fr_1fr] gap-3 border-b border-white/[0.06] px-5 py-2.5 text-[10px] font-bold uppercase tracking-[0.18em] text-white/40">
          <span>Player</span>
          <span>Last Active</span>
          <span className="text-right">Total Stakes Played</span>
        </div>
        {activity.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-white/40">No member activity yet.</p>
        ) : (
          activity.map((m) => (
            <div
              key={m.user_id}
              className="grid grid-cols-[1.6fr_1fr_1fr] items-center gap-3 border-b border-white/[0.05] px-5 py-3 last:border-0"
            >
              <div className="flex min-w-0 items-center gap-3">
                <MemberAvatar seed={m.user_id} name={m.username} size={34} />
                <span className="truncate font-medium text-white">{m.username}</span>
              </div>
              <span className="text-sm text-white/60">{relTime(m.joined_at) || "—"}</span>
              <span className="text-right font-bold text-green">{usd(m.balance + m.locked_amount)}</span>
            </div>
          ))
        )}
      </div>
      {demo && (
        <p className="text-[11px] text-white/40">
          Demo analytics — connect to Nakama for live membership trends.
        </p>
      )}
    </div>
  );
}
