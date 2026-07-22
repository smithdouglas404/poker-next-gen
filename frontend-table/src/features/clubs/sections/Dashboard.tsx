"use client";

import { useCallback, useEffect, useState } from "react";

import { Button } from "@/features/ui";
import { GLASS_PANEL, cn } from "@/features/ui/tokens";

import { ProgressBar } from "../charts";
import { clubApi, compact, money, relTime } from "../clubRpc";
import { CardHeader, EmptyState, MemberAvatar, StatTile, severityColor } from "../components";
import type {
  Alliance,
  Announcement,
  ClubEvent,
  Invitation,
  Mission,
  QuickStats,
} from "../types";

export function Dashboard({
  clubId,
  isConfigurer,
  toast,
}: {
  clubId: string;
  isConfigurer: boolean;
  toast: (msg: string, kind?: "ok" | "err") => void;
}) {
  const [quick, setQuick] = useState<QuickStats | null>(null);
  const [requests, setRequests] = useState<Invitation[]>([]);
  const [missions, setMissions] = useState<Mission[]>([]);
  const [events, setEvents] = useState<ClubEvent[]>([]);
  const [news, setNews] = useState<Announcement[]>([]);
  const [alliance, setAlliance] = useState<Alliance | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [q, ev, an, al, ms] = await Promise.allSettled([
      clubApi.quickStats(clubId),
      clubApi.events(clubId),
      clubApi.announcements(clubId),
      clubApi.alliance(clubId),
      clubApi.missions(),
    ]);
    if (q.status === "fulfilled") setQuick(q.value);
    if (ev.status === "fulfilled") setEvents(ev.value.events ?? []);
    if (an.status === "fulfilled") setNews(an.value.announcements ?? []);
    if (al.status === "fulfilled") setAlliance(al.value.alliance);
    if (ms.status === "fulfilled") setMissions(ms.value.missions ?? []);
    // Requests are configurer-gated — only fetch when permitted.
    if (isConfigurer) {
      try {
        const r = await clubApi.requests(clubId);
        setRequests(r.requests ?? []);
      } catch {
        setRequests([]);
      }
    } else {
      setRequests([]);
    }
  }, [clubId, isConfigurer]);

  useEffect(() => {
    void load();
  }, [load]);

  const review = (inv: Invitation, action: "approve" | "deny") =>
    void (async () => {
      setBusy(inv.id);
      try {
        await clubApi.reviewRequest(inv.id, action);
        toast(action === "approve" ? "Request approved." : "Request declined.");
        await load();
      } catch (e) {
        toast(e instanceof Error ? e.message : "Action failed", "err");
      } finally {
        setBusy(null);
      }
    })();

  const claim = (m: Mission) =>
    void (async () => {
      setBusy(m.id);
      try {
        await clubApi.claimMission(m.id);
        toast(`Claimed ${money(m.reward_cents)}.`);
        await load();
      } catch (e) {
        toast(e instanceof Error ? e.message : "Claim failed", "err");
      } finally {
        setBusy(null);
      }
    })();

  const stats = quick?.stats;

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
      <div className="space-y-5">
        {/* Overview stats */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatTile label="Members" value={compact(quick?.member_count ?? 0)} />
          <StatTile label="Active 7d" value={compact(stats?.active_7d ?? 0)} accent="#f3c14b" />
          <StatTile label="Hands" value={compact(stats?.hands ?? 0)} />
          <StatTile label="Chips Won" value={compact(stats?.chips_won ?? 0)} accent="#f3e2ad" />
        </div>

        {/* Daily missions */}
        <div className={cn(GLASS_PANEL, "p-5")}>
          <CardHeader>Daily Missions</CardHeader>
          {missions.length === 0 ? (
            <EmptyState>No active missions right now.</EmptyState>
          ) : (
            <div className="grid gap-3 sm:grid-cols-3">
              {missions.slice(0, 6).map((m) => {
                const pct = m.goal > 0 ? m.progress / m.goal : 0;
                return (
                  <div key={m.id} className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3">
                    <p className="text-[11px] font-semibold text-white/80">{m.title}</p>
                    <p className="mb-2 mt-0.5 text-[10px] text-neutral-500">
                      {compact(m.progress)} / {compact(m.goal)} · {money(m.reward_cents)}
                    </p>
                    <ProgressBar pct={pct} color={m.completed ? "#f3c14b" : "#81ecff"} />
                    {m.completed && !m.claimed && (
                      <Button
                        size="sm"
                        onClick={() => claim(m)}
                        disabled={busy === m.id}
                        className="mt-2 w-full"
                      >
                        {busy === m.id ? "…" : "Claim"}
                      </Button>
                    )}
                    {m.claimed && (
                      <p className="mt-2 text-center text-[10px] uppercase tracking-wider text-emerald-400/70">
                        Claimed
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Recent activity */}
        <div className={cn(GLASS_PANEL, "p-5")}>
          <CardHeader>Recent Activity</CardHeader>
          {(quick?.activity?.length ?? 0) === 0 ? (
            <EmptyState>No recent club activity.</EmptyState>
          ) : (
            <ul className="space-y-2">
              {quick!.activity.slice(0, 8).map((a) => (
                <li key={a.id} className="flex items-center justify-between text-sm">
                  <span className="text-white/75">
                    <span className="mr-2 rounded bg-white/[0.06] px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-cyan/80">
                      {a.kind}
                    </span>
                    {a.detail}
                  </span>
                  <span className="shrink-0 text-[11px] text-neutral-600">{relTime(a.created_at)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Right column */}
      <div className="space-y-4">
        {/* Club & Alliance news */}
        <div className={cn(GLASS_PANEL, "p-4")}>
          <CardHeader
            badge={
              news.length > 0 && (
                <span className="rounded-full bg-[#c9302c] px-1.5 text-[10px] font-bold text-white">
                  {news.length}
                </span>
              )
            }
          >
            Club &amp; Alliance News
          </CardHeader>
          {alliance && (
            <p className="mb-2 rounded-lg border border-gold/25 bg-gold/[0.06] px-3 py-2 text-[12px] text-gold/90">
              Allied with <span className="font-semibold">{alliance.name}</span> — cross-club seats open.
            </p>
          )}
          {news.length === 0 && !alliance ? (
            <EmptyState>No announcements yet.</EmptyState>
          ) : (
            <ul className="space-y-2">
              {news.slice(0, 4).map((n) => (
                <li key={n.id} className="border-l-2 pl-3" style={{ borderColor: severityColor(n.severity) }}>
                  <p className="text-[13px] font-semibold text-white">{n.title}</p>
                  {n.body && <p className="text-[12px] leading-relaxed text-white/60">{n.body}</p>}
                  <p className="mt-0.5 text-[10px] text-neutral-600">{relTime(n.created_at)}</p>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Pending join requests */}
        {isConfigurer && (
          <div className="rounded-2xl border border-cyan/30 bg-cyan/[0.06] p-4">
            <CardHeader>Pending Join Requests</CardHeader>
            {requests.length === 0 ? (
              <p className="text-[12px] text-white/50">No pending requests.</p>
            ) : (
              <div className="space-y-3">
                {requests.map((r) => (
                  <div key={r.id}>
                    <div className="flex items-center gap-3">
                      <MemberAvatar seed={r.user_id} name={r.username} size={44} ring="#b44dff" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-white">
                          {r.username || r.user_id.slice(0, 8)}
                        </p>
                        <p className="text-[11px] text-white/50">{r.message || "Requests to join"}</p>
                      </div>
                    </div>
                    <div className="mt-2 flex gap-2">
                      <button
                        type="button"
                        disabled={busy === r.id}
                        onClick={() => review(r, "approve")}
                        className="flex-1 rounded-lg py-2 text-[12px] font-bold text-white transition hover:brightness-110 disabled:opacity-50"
                        style={{ background: "linear-gradient(180deg,#2fbf6b,#1c8a4b)" }}
                      >
                        APPROVE
                      </button>
                      <button
                        type="button"
                        disabled={busy === r.id}
                        onClick={() => review(r, "deny")}
                        className="flex-1 rounded-lg py-2 text-[12px] font-bold text-white transition hover:brightness-110 disabled:opacity-50"
                        style={{ background: "linear-gradient(180deg,#d9534f,#a12e2a)" }}
                      >
                        DECLINE
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Upcoming private games */}
        <div className={cn(GLASS_PANEL, "p-4")}>
          <CardHeader>Upcoming Private Games</CardHeader>
          {events.length === 0 ? (
            <EmptyState>No games scheduled.</EmptyState>
          ) : (
            <div className="space-y-2.5">
              {events.slice(0, 4).map((ev) => (
                <div
                  key={ev.id}
                  className="flex items-center justify-between rounded-xl border border-white/[0.07] bg-white/[0.02] px-3 py-2.5"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-white">{ev.name}</p>
                    <p className="text-[11px] text-white/50">
                      {money(ev.small_blind)}/{money(ev.big_blind)} · {ev.variant || "NLH"}
                      {ev.format ? ` · ${ev.format}` : ""}
                    </p>
                  </div>
                  <span className="shrink-0 text-[11px] text-cyan/80">
                    {new Date(ev.scheduled_at).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                    })}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
