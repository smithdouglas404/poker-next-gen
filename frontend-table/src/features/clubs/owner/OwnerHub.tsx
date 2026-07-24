"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { Button } from "@/features/ui";
import { GLASS_PANEL, cn } from "@/features/ui/tokens";

import { Announcements } from "./Announcements";
import { Financials, type FinancialsPeriod } from "./Financials";
import { GlobalSettings } from "./GlobalSettings";
import { GuestGate } from "./GuestGate";
import { MemberAnalytics } from "./MemberAnalytics";
import { MemberManagement } from "./MemberManagement";
import { OperatorsEquity } from "./OperatorsEquity";
import { Overview } from "./Overview";
import { OwnerShell } from "./OwnerShell";
import { QuickStats } from "./QuickStats";
import { StatCards, type StatCard } from "./StatCards";
import {
  DEMO_ANALYTICS,
  DEMO_ANNOUNCEMENTS,
  DEMO_CHAT,
  DEMO_CLUB,
  DEMO_OVERVIEW_SPARKS,
  DEMO_QUICK_STATS,
  DEMO_RAKE_CONFIG,
  DEMO_RAKE_LEDGER,
  DEMO_REQUESTS,
  DEMO_ROSTER,
  demoRakeReport,
  totalBankrollCents,
} from "./demoData";
import { compact, ownerApi, usdCompact } from "./ownerRpc";
import { EmptyState, SectionTitle } from "./ui";
import type {
  ClubAnnouncement,
  ClubChatMessage,
  ClubSettingsBlob,
  JoinRequest,
  OwnerClub,
  OwnerClubExt,
  OwnerSection,
  QuickStats as QuickStatsData,
  RakeConfig,
  RakeLedger,
  RakeReport,
  RosterRow,
} from "./types";

type Mode = "loading" | "owner" | "guest";

interface Toast {
  msg: string;
  kind: "ok" | "err";
}

export function OwnerHub() {
  const [mode, setMode] = useState<Mode>("loading");
  const [demo, setDemo] = useState(false);
  const [forceBrowse, setForceBrowse] = useState(false);

  const [club, setClub] = useState<OwnerClubExt | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [roster, setRoster] = useState<RosterRow[]>([]);
  const [requests, setRequests] = useState<JoinRequest[]>([]);
  const [quick, setQuick] = useState<QuickStatsData | null>(null);
  const [ledger, setLedger] = useState<RakeLedger | null>(null);
  const [report, setReport] = useState<RakeReport | null>(null);
  const [period, setPeriod] = useState<FinancialsPeriod>("week");
  const [announcements, setAnnouncements] = useState<ClubAnnouncement[]>([]);
  const [chat, setChat] = useState<ClubChatMessage[]>([]);
  const [rakeConfig, setRakeConfig] = useState<RakeConfig | null>(null);

  const [section, setSection] = useState<OwnerSection>("overview");
  const [toast, setToast] = useState<Toast | null>(null);

  const notify = useCallback((msg: string, kind: "ok" | "err" = "ok") => {
    setToast({ msg, kind });
    window.setTimeout(() => setToast(null), 3200);
  }, []);

  const loadDemo = useCallback(() => {
    setDemo(true);
    setClub(DEMO_CLUB);
    setRole("owner");
    setRoster(DEMO_ROSTER);
    setRequests(DEMO_REQUESTS);
    setQuick(DEMO_QUICK_STATS);
    setLedger(DEMO_RAKE_LEDGER);
    setReport(demoRakeReport("week"));
    setAnnouncements(DEMO_ANNOUNCEMENTS);
    setChat(DEMO_CHAT);
    setRakeConfig(DEMO_RAKE_CONFIG);
    setMode("owner");
  }, []);

  // Reload the live roster (used after every mutation to avoid state drift).
  // Prefer club_member_stats (configurer analytics); fall back to club_roster,
  // then the basic club_members list, so a single 403 never blanks the table.
  const reloadRoster = useCallback(async (clubId: string) => {
    try {
      const r = await ownerApi.memberStats(clubId);
      if (r.members) {
        setRoster(r.members);
        return;
      }
    } catch {
      /* try next source */
    }
    try {
      const r = await ownerApi.roster(clubId);
      if (r.roster) {
        setRoster(r.roster);
        return;
      }
    } catch {
      /* try next source */
    }
    try {
      const r = await ownerApi.members(clubId);
      if (r.members) setRoster(r.members);
    } catch {
      /* keep last known roster */
    }
  }, []);

  const reloadRequests = useCallback(async (clubId: string) => {
    try {
      const r = await ownerApi.requests(clubId);
      setRequests(r.requests ?? []);
    } catch {
      setRequests([]);
    }
  }, []);

  const loadReport = useCallback(async (clubId: string, p: FinancialsPeriod) => {
    try {
      setReport(await ownerApi.rakeReport(clubId, p));
    } catch {
      setReport({ total_rake: 0, hand_count: 0, series: [], period: p });
    }
  }, []);

  // Bootstrap: find a club the caller owns/configures, else guest.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      let list: OwnerClub[] = [];
      try {
        const data = await ownerApi.list();
        list = data.clubs ?? [];
      } catch {
        // Fully offline / no session → demo hub.
        if (!cancelled) loadDemo();
        return;
      }

      // Find the first club where the caller is owner/admin.
      let owned: { club: OwnerClub; role: string } | null = null;
      for (const c of list.slice(0, 12)) {
        try {
          const detail = await ownerApi.get(c.id);
          const r = detail.my_membership?.role;
          if (r === "owner" || r === "admin") {
            owned = { club: detail.club, role: r };
            break;
          }
        } catch {
          /* skip */
        }
      }

      if (cancelled) return;
      if (!owned) {
        setMode("guest");
        return;
      }

      setClub(owned.club);
      setRole(owned.role);

      // Load all owner data in parallel; individual failures degrade gracefully.
      const [quickRes, ledgerRes, annRes, chatRes, rakeRes] = await Promise.allSettled([
        ownerApi.quickStats(owned.club.id),
        ownerApi.rakeLedger(owned.club.id),
        ownerApi.announcements(owned.club.id),
        ownerApi.chatList(owned.club.id),
        ownerApi.rakeConfigGet(owned.club.id),
      ]);
      if (cancelled) return;

      if (quickRes.status === "fulfilled") setQuick(quickRes.value);
      if (ledgerRes.status === "fulfilled") setLedger(ledgerRes.value);
      if (annRes.status === "fulfilled") setAnnouncements(annRes.value.announcements ?? []);
      if (chatRes.status === "fulfilled") setChat((chatRes.value.messages ?? []).slice().reverse());
      if (rakeRes.status === "fulfilled" && rakeRes.value?.club_id) setRakeConfig(rakeRes.value);

      await Promise.all([
        reloadRoster(owned.club.id),
        reloadRequests(owned.club.id),
        loadReport(owned.club.id, "week"),
      ]);
      setMode("owner");
    })();
    return () => {
      cancelled = true;
    };
  }, [loadDemo, reloadRoster, reloadRequests, loadReport]);

  const canManage = role === "owner" || role === "admin";

  // ---- Action handlers (live → RPC + reload; demo → local mutation) ----

  const onPromote = useCallback(
    async (m: RosterRow) => {
      const next: "member" | "admin" = m.role === "admin" ? "member" : "admin";
      if (demo || !club) {
        setRoster((prev) => prev.map((x) => (x.user_id === m.user_id ? { ...x, role: next } : x)));
        notify(`${m.username} is now ${next}.${demo ? " (demo)" : ""}`);
        return;
      }
      try {
        await ownerApi.setRole(club.id, m.user_id, next);
        await reloadRoster(club.id);
        notify(`${m.username} is now ${next}.`);
      } catch (e) {
        notify(e instanceof Error ? e.message : "Role change failed", "err");
      }
    },
    [demo, club, notify, reloadRoster],
  );

  const onKick = useCallback(
    async (m: RosterRow) => {
      if (demo || !club) {
        setRoster((prev) => prev.filter((x) => x.user_id !== m.user_id));
        notify(`${m.username} removed.${demo ? " (demo)" : ""}`);
        return;
      }
      try {
        await ownerApi.kick(club.id, m.user_id);
        await reloadRoster(club.id);
        notify(`${m.username} removed from the club.`);
      } catch (e) {
        notify(e instanceof Error ? e.message : "Kick failed", "err");
      }
    },
    [demo, club, notify, reloadRoster],
  );

  const onAllocate = useCallback(
    async (m: RosterRow, cents: number) => {
      if (demo || !club) {
        setRoster((prev) =>
          prev.map((x) => (x.user_id === m.user_id ? { ...x, balance: cents } : x)),
        );
        notify(`Allocated ${usdCompact(cents)} to ${m.username}.${demo ? " (demo)" : ""}`);
        return;
      }
      try {
        await ownerApi.allocateBalance(club.id, m.user_id, cents);
        await reloadRoster(club.id);
        notify(`Allocated ${usdCompact(cents)} to ${m.username}.`);
      } catch (e) {
        notify(e instanceof Error ? e.message : "Allocation failed", "err");
      }
    },
    [demo, club, notify, reloadRoster],
  );

  const onReview = useCallback(
    async (req: JoinRequest, action: "approve" | "deny") => {
      if (demo || !club) {
        setRequests((prev) => prev.filter((x) => x.id !== req.id));
        if (action === "approve") {
          setRoster((prev) => [
            {
              user_id: req.user_id,
              username: req.username,
              role: "member",
              status: "active",
              joined_at: new Date().toISOString(),
              balance: 0,
              locked_amount: 0,
              can_configure: false,
              activity_count: 0,
            },
            ...prev,
          ]);
        }
        notify(`${action === "approve" ? "Approved" : "Declined"} ${req.username}.${demo ? " (demo)" : ""}`);
        return;
      }
      try {
        await ownerApi.reviewRequest(req.id, action);
        await Promise.all([reloadRequests(club.id), reloadRoster(club.id)]);
        notify(`${action === "approve" ? "Approved" : "Declined"} ${req.username}.`);
      } catch (e) {
        notify(e instanceof Error ? e.message : "Review failed", "err");
      }
    },
    [demo, club, notify, reloadRequests, reloadRoster],
  );

  const changePeriod = useCallback(
    (p: FinancialsPeriod) => {
      setPeriod(p);
      if (demo || !club) {
        setReport(demoRakeReport(p));
      } else {
        void loadReport(club.id, p);
      }
    },
    [demo, club, loadReport],
  );

  const onSendChat = useCallback(
    async (text: string) => {
      const optimistic: ClubChatMessage = {
        id: `local-${Date.now()}`,
        club_id: club?.id ?? DEMO_CLUB.id,
        user_id: "you",
        username: role === "admin" ? "Admin" : "Owner",
        text,
        created_at: new Date().toISOString(),
      };
      if (demo || !club) {
        setChat((prev) => [...prev, optimistic]);
        return;
      }
      try {
        await ownerApi.chatSend(club.id, text);
        const r = await ownerApi.chatList(club.id);
        setChat((r.messages ?? []).slice().reverse());
      } catch (e) {
        notify(e instanceof Error ? e.message : "Message failed", "err");
      }
    },
    [demo, club, role, notify],
  );

  const onBroadcast = useCallback(
    async (title: string, body: string, severity: string) => {
      const optimistic: ClubAnnouncement = {
        id: `local-${Date.now()}`,
        club_id: club?.id ?? DEMO_CLUB.id,
        title,
        body,
        severity,
        created_by: role ?? "owner",
        created_at: new Date().toISOString(),
      };
      if (demo || !club) {
        setAnnouncements((prev) => [optimistic, ...prev]);
        notify(`Broadcast sent: "${title}". (demo)`);
        return;
      }
      try {
        await ownerApi.createAnnouncement(club.id, title, body, severity);
        const r = await ownerApi.announcements(club.id);
        setAnnouncements(r.announcements ?? []);
        notify(`Broadcast sent: "${title}".`);
      } catch (e) {
        notify(e instanceof Error ? e.message : "Broadcast failed", "err");
      }
    },
    [demo, club, role, notify],
  );

  const onSaveRake = useCallback(
    async (cfg: RakeConfig) => {
      if (demo || !club) {
        setRakeConfig(cfg);
        return;
      }
      try {
        const saved = await ownerApi.rakeConfigSet({ ...cfg, club_id: club.id });
        setRakeConfig(saved?.club_id ? saved : cfg);
        notify("Rake configuration saved.");
      } catch (e) {
        notify(e instanceof Error ? e.message : "Rake save failed", "err");
        throw e;
      }
    },
    [demo, club, notify],
  );

  const onSaveSettings = useCallback(
    async (
      patch: { is_public?: boolean; require_approval?: boolean; avatar_ref?: string },
      settings: ClubSettingsBlob,
    ) => {
      if (demo || !club) {
        setClub((prev) => (prev ? { ...prev, settings_json: settings } : prev));
        notify("Settings saved. (demo)");
        return;
      }
      try {
        await ownerApi.updateClub(club.id, {
          ...patch,
          settings_json: settings as unknown as Record<string, unknown>,
        });
        setClub((prev) => (prev ? { ...prev, ...patch, settings_json: settings } : prev));
        notify("Global settings saved.");
      } catch (e) {
        notify(e instanceof Error ? e.message : "Settings save failed", "err");
        throw e;
      }
    },
    [demo, club, notify],
  );

  // ---- Render ----

  if (mode === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-white/40">
        Loading club owner hub…
      </div>
    );
  }

  if (mode === "guest" || forceBrowse) {
    return (
      <div>
        {forceBrowse && (
          <div className="mx-auto max-w-[1000px] px-4 pt-6">
            <button
              type="button"
              onClick={() => setForceBrowse(false)}
              className="text-xs text-muted hover:text-brand"
            >
              ← Back to your club
            </button>
          </div>
        )}
        <GuestGate toast={notify} />
      </div>
    );
  }

  const houseBalance = ledger?.house_balance ?? 0;
  const bankroll = totalBankrollCents(roster, houseBalance);
  const onlineCount = roster.filter((m) => m.status === "active" || m.status === "online").length;
  const memberCount = quick?.member_count ?? roster.length;
  const active7d = quick?.stats?.active_7d ?? onlineCount;
  const rakeTotalCents = (report?.total_rake ?? 0) || houseBalance;
  const avgPotCents =
    quick?.stats && quick.stats.hands > 0 && quick.stats.chips_won > 0
      ? Math.max(1000, Math.round(quick.stats.chips_won / quick.stats.hands))
      : DEMO_OVERVIEW_SPARKS.potCents[DEMO_OVERVIEW_SPARKS.potCents.length - 1];

  const cards: StatCard[] = [
    { label: "Total Stakes", value: usdCompact(bankroll), sub: "Across all club tables", accent: "gold" },
    { label: "Active Now", value: compact(onlineCount), sub: "Live in-vault", accent: "green" },
    {
      label: "Pending Requests",
      value: compact(requests.length),
      sub: requests.length > 0 ? "Requires review" : "All clear",
      accent: "red",
    },
    {
      label: "Total Members",
      value: compact(memberCount),
      sub: `${compact(active7d)} active this week`,
      accent: "cyan",
    },
  ];

  const emptyQuick: QuickStatsData = quick ?? { stats: null, member_count: memberCount, activity: [] };

  return (
    <OwnerShell
      section={section}
      onSection={setSection}
      clubName={club?.name ?? "Club"}
      bankrollCents={bankroll}
      onlineCount={onlineCount}
      memberCount={memberCount}
      role={role}
      demo={demo}
      onBrowse={() => setForceBrowse(true)}
    >
      {toast && (
        <div
          className={cn(
            "fixed left-1/2 top-20 z-50 -translate-x-1/2 rounded-xl border px-4 py-2.5 text-sm",
            toast.kind === "ok"
              ? "border-[#22c55e]/30 bg-[#0a7d43]/25 text-[#bff5d3]"
              : "border-[#e01e2b]/35 bg-[#b3151f]/25 text-[#ffcdd1]",
          )}
        >
          {toast.msg}
        </div>
      )}

      {section === "members" && (
        <div className="mb-6">
          <StatCards cards={cards} />
        </div>
      )}

      {section === "overview" && (
        <Overview
          clubName={club?.name ?? "Club"}
          quick={emptyQuick}
          roster={roster}
          bankrollCents={bankroll}
          rakeTotalCents={rakeTotalCents}
          avgPotCents={avgPotCents}
          sparks={DEMO_OVERVIEW_SPARKS}
          chat={chat}
          demo={demo}
          canManage={canManage}
          onSendChat={onSendChat}
        />
      )}

      {section === "members" && (
        <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
          <MemberManagement
            roster={roster}
            requests={requests}
            demo={demo}
            canManage={canManage}
            onPromote={onPromote}
            onKick={onKick}
            onAllocate={onAllocate}
            onReview={onReview}
          />
          <QuickStats data={emptyQuick} />
        </div>
      )}

      {section === "operators" && (
        <OperatorsEquity
          clubId={club?.id ?? ""}
          roster={roster}
          canManage={canManage}
          demo={demo}
          onChanged={() => {
            if (club?.id) void reloadRoster(club.id);
          }}
        />
      )}

      {section === "announcements" && (
        <Announcements
          announcements={announcements}
          demo={demo}
          canManage={canManage}
          onBroadcast={onBroadcast}
        />
      )}

      {section === "analytics" && (
        <MemberAnalytics roster={roster} analytics={DEMO_ANALYTICS} demo={demo} />
      )}

      {section === "settings" && (
        <GlobalSettings
          club={club}
          rake={rakeConfig}
          demo={demo}
          canManage={canManage}
          onSaveRake={onSaveRake}
          onSaveSettings={onSaveSettings}
        />
      )}

      {section === "financials" && (
        <Financials
          report={report}
          ledger={ledger}
          period={period}
          demo={demo}
          onPeriod={changePeriod}
        />
      )}

      {section === "tables" && (
        <DerivedSection
          title="Live Tables"
          eyebrow="Public Table Browser"
          quick={emptyQuick}
          roster={roster}
          ctaHref="/lobby"
          ctaLabel="Open Lobby"
        />
      )}

      {section === "tournaments" && (
        <DerivedSection
          title="Tournament Center"
          eyebrow="Scheduled Series"
          quick={emptyQuick}
          roster={roster}
          ctaHref="/tournaments"
          ctaLabel="Tournament Center"
          tournaments
        />
      )}
    </OwnerShell>
  );
}

/** Tables / Tournaments overview panels, sourced from club_quick_stats + roster
 * (no fabricated table list — these summarize real club-stats fields). */
function DerivedSection({
  title,
  eyebrow,
  quick,
  roster,
  ctaHref,
  ctaLabel,
  tournaments,
}: {
  title: string;
  eyebrow: string;
  quick: QuickStatsData;
  roster: RosterRow[];
  ctaHref: string;
  ctaLabel: string;
  tournaments?: boolean;
}) {
  const s = quick.stats;
  const seated = roster.filter((m) => m.locked_amount > 0).length;
  const cards: StatCard[] = tournaments
    ? [
        { label: "Tournament Wins", value: `${s?.tourney_wins ?? 0}`, sub: "All-time", accent: "gold" },
        { label: "Active Players", value: compact(s?.active_7d ?? 0), sub: "Last 7 days", accent: "green" },
        { label: "Total Hands", value: compact(s?.hands ?? 0), sub: "Across series", accent: "cyan" },
      ]
    : [
        { label: "Seated Players", value: compact(seated), sub: "With chips in play", accent: "cyan" },
        { label: "Hands Dealt", value: compact(s?.hands ?? 0), sub: "All tables", accent: "gold" },
        { label: "Active (7d)", value: compact(s?.active_7d ?? 0), sub: "Unique players", accent: "green" },
      ];

  return (
    <div className="space-y-5">
      <SectionTitle
        eyebrow={eyebrow}
        title={title}
        right={
          <Link href={ctaHref}>
            <Button variant="outline" size="sm">
              {ctaLabel}
            </Button>
          </Link>
        }
      />
      <StatCards cards={cards} />
      <div className={cn(GLASS_PANEL, "p-5")}>
        <p className="font-display text-[11px] font-bold uppercase tracking-[0.25em] text-gold/80">
          {tournaments ? "Featured Series" : "Featured Tables"}
        </p>
        <div className="mt-4 space-y-3">
          {(tournaments
            ? [
                { name: "Gold Cup Championship", note: "Prize pool $1M · Sundays 20:00" },
                { name: "Diamond Vault Turbo", note: "$50k GTD · Daily 21:00" },
              ]
            : [
                { name: "High Stakes — Table 1", note: "$500 / $1k · 6-max" },
                { name: "Nightly PLO — Table 3", note: "$25 / $50 · Pot-Limit Omaha" },
              ]
          ).map((t) => (
            <div
              key={t.name}
              className="flex items-center justify-between rounded-xl border border-white/[0.07] bg-white/[0.02] px-4 py-3"
            >
              <div>
                <p className="font-semibold text-white">{t.name}</p>
                <p className="text-xs text-white/50">{t.note}</p>
              </div>
              <Link href={ctaHref}>
                <Button size="sm" variant="ghost">
                  View
                </Button>
              </Link>
            </div>
          ))}
          {quick.activity.length === 0 && roster.length === 0 && (
            <EmptyState>No live data yet.</EmptyState>
          )}
        </div>
      </div>
    </div>
  );
}
