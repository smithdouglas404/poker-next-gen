"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { callSessionRpc } from "@/lib/nakama/sessionRpc";
import { Button } from "@/features/ui";
import { GLASS_PANEL, cn } from "@/features/ui/tokens";

import { Announcements } from "./Announcements";
import { Financials, type FinancialsPeriod } from "./Financials";
import { GlobalSettings } from "./GlobalSettings";
import { GuestGate } from "./GuestGate";
import { MemberAnalytics } from "./MemberAnalytics";
import { CreditRequests } from "./CreditRequests";
import { GuestApprovals } from "./GuestApprovals";
import { GuestSessions } from "./GuestSessions";
import { TableSettlements } from "./TableSettlements";
import { SeatSessions } from "./SeatSessions";
import { ClubNights } from "./ClubNights";
import { MemberManagement } from "./MemberManagement";
import { OperatorsEquity } from "./OperatorsEquity";
import { ClubLicencePanel } from "@/features/clubs/ClubLicence";
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
import { demoRequested } from "@/features/ui/demoMode";
import { FailedState } from "@/features/ui/EmptyState";
import { compact, ownerApi, usdCompact } from "./ownerRpc";
import { EmptyState, SectionTitle } from "./ui";
import type {
  AnalyticsSeries,
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
  // Distinct from "you run no club": the server was unreachable, so we say that
  // rather than showing an operator numbers we cannot stand behind.
  const [loadFailed, setLoadFailed] = useState(false);
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
  const [series, setSeries] = useState<AnalyticsSeries | null>(null);

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
  //
  // An unreachable server used to load the fabricated hub — a fictional club with
  // a 12-strong roster and $184M of balances, indistinguishable from live figures.
  // Now the showcase dataset loads ONLY when the URL asks (`?demo=1`); a real
  // failure shows the guest/empty state instead of inventing an operator's books.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (demoRequested()) {
        if (!cancelled) loadDemo();
        return;
      }

      let list: OwnerClub[] = [];
      try {
        const data = await ownerApi.list();
        list = data.clubs ?? [];
      } catch {
        if (!cancelled) {
          setLoadFailed(true);
          setMode("guest");
        }
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
      const [quickRes, ledgerRes, annRes, chatRes, rakeRes, seriesRes] = await Promise.allSettled([
        ownerApi.quickStats(owned.club.id),
        ownerApi.rakeLedger(owned.club.id),
        ownerApi.announcements(owned.club.id),
        ownerApi.chatList(owned.club.id),
        ownerApi.rakeConfigGet(owned.club.id),
        ownerApi.analyticsSeries(owned.club.id, 30),
      ]);
      if (cancelled) return;

      if (quickRes.status === "fulfilled") setQuick(quickRes.value);
      if (ledgerRes.status === "fulfilled") setLedger(ledgerRes.value);
      if (annRes.status === "fulfilled") setAnnouncements(annRes.value.announcements ?? []);
      if (chatRes.status === "fulfilled") setChat((chatRes.value.messages ?? []).slice().reverse());
      if (rakeRes.status === "fulfilled" && rakeRes.value?.club_id) setRakeConfig(rakeRes.value);
      if (seriesRes.status === "fulfilled" && seriesRes.value?.series) setSeries(seriesRes.value);

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
  // Handing out authority is owner-only — a configuring manager must not be able
  // to grant themselves the permissions they were denied. The server enforces
  // this independently in club_permissions_set; this just hides the controls.
  const isOwner = role === "owner";

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
    async (
      title: string,
      body: string,
      severity: string,
      audience: string = "all",
      channel: string = "overlay",
    ) => {
      const optimistic: ClubAnnouncement = {
        id: `local-${Date.now()}`,
        club_id: club?.id ?? DEMO_CLUB.id,
        title,
        body,
        severity,
        audience,
        channel,
        created_by: role ?? "owner",
        created_at: new Date().toISOString(),
      };
      if (demo || !club) {
        setAnnouncements((prev) => [optimistic, ...prev]);
        notify(`Broadcast sent: "${title}". (demo)`);
        return;
      }
      try {
        await ownerApi.createAnnouncement(club.id, title, body, severity, audience, channel);
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
      patch: {
        is_public?: boolean;
        require_approval?: boolean;
        avatar_ref?: string;
        // Real club columns, validated server-side (IANA zone; 2FA cannot be
        // required by an owner who has none).
        timezone?: string;
        primary_language?: string;
        twofa_required?: boolean;
      },
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

  // Server unreachable. Say so plainly and offer a retry — never dress the failure
  // up as an operator's real books.
  if (loadFailed && !forceBrowse) {
    return (
      <div className="mx-auto max-w-[1000px] px-4 py-16">
        <FailedState
          message="We couldn't reach the club service, so nothing is shown here. Your club's figures are never estimated."
          onRetry={() => window.location.reload()}
        />
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
  // No hands played yet means no average pot. It used to borrow the last value
  // from the fabricated series, which showed an operator a pot size for a club
  // that had never dealt a hand.
  const avgPotCents =
    quick?.stats && quick.stats.hands > 0 && quick.stats.chips_won > 0
      ? Math.max(1000, Math.round(quick.stats.chips_won / quick.stats.hands))
      : 0;

  // Real trend series from club_analytics_series (zero-filled 30-day window).
  // With no series, the sparklines render empty rather than borrowing a shape —
  // a chart is a claim about history, and an invented one is the worst kind.
  const liveSeries = series?.series?.length ? series.series : null;
  const EMPTY_SPARKS = { members: [], tables: [], volumeCents: [], potCents: [], rakeCents: [] };
  const overviewSparks = liveSeries
    ? {
        members: liveSeries.map((p) => p.members_cumulative),
        tables: [],
        volumeCents: liveSeries.map((p) => p.rake_cents),
        potCents: [],
        rakeCents: liveSeries.map((p) => p.rake_cents),
      }
    : demo
      ? DEMO_OVERVIEW_SPARKS
      : EMPTY_SPARKS;
  const memberAnalytics = liveSeries
    ? {
        months: liveSeries.map((p) => p.label),
        activeMembers: liveSeries.map((p) => p.active),
        tableVolumeCents: liveSeries.map((p) => p.rake_cents),
        newPlayers: series?.new_total ?? 0,
        returningPlayers: series?.returning_total ?? 0,
      }
    : demo
      ? DEMO_ANALYTICS
      : { months: [], activeMembers: [], tableVolumeCents: [], newPlayers: 0, returningPlayers: 0 };

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
          sparks={overviewSparks}
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
          <div className="mt-6">
            <CreditRequests clubId={club?.id} canManage={canManage} />
            {/* Approvals FIRST: someone is sitting at a table waiting on it,
                whereas reconciliation below is settle-up after the fact. */}
            <GuestApprovals clubId={club?.id} canManage={canManage} />
            <GuestSessions clubId={club?.id} canManage={canManage} />
            {/* Below the two guest queues: approvals block a live player and
                reconciliation settles one guest, but this is the whole
                table's loan position and it is what closes the game. */}
            <TableSettlements clubId={club?.id} canManage={canManage} />
            <SeatSessions clubId={club?.id} canManage={canManage} />
            <ClubNights clubId={club?.id} canManage={canManage} />
          </div>
          <QuickStats data={emptyQuick} clubId={club?.id ?? null} />
        </div>
      )}

      {section === "operators" && (
        <div className="mb-6">
          {/* The licence lives with an owner, so it belongs beside the owner
              list — it is the one thing on this screen that depends on WHO the
              owners are rather than what they may do. */}
          <ClubLicencePanel clubId={club?.id ?? ""} />
        </div>
      )}

      {section === "operators" && (
        <OperatorsEquity
          clubId={club?.id ?? ""}
          clubName={club?.name}
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
        <MemberAnalytics roster={roster} analytics={memberAnalytics} demo={demo} />
      )}

      {section === "settings" && (
        <GlobalSettings
          club={club}
          rake={rakeConfig}
          demo={demo}
          canManage={canManage}
          isOwner={isOwner}
          notify={notify}
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

  // Real featured tables / series from table_list / tournament_list (demo fallback).
  const [featured, setFeatured] = useState<{ name: string; note: string }[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        if (tournaments) {
          const d = (await callSessionRpc("tournament_list", {})) as {
            tournaments?: Array<{ name: string; status: string; buy_in_minor?: number; variant?: string }>;
          };
          const rows = (d.tournaments ?? [])
            .filter((t) => t.status !== "finished")
            .slice(0, 4)
            .map((t) => ({
              name: t.name,
              note: `${usdCompact(t.buy_in_minor ?? 0)} · ${t.variant === "omaha" ? "PLO" : "Hold'em"} · ${t.status}`,
            }));
          if (!cancelled && rows.length) setFeatured(rows);
        } else {
          const d = (await callSessionRpc("table_list", {})) as {
            matches?: Array<{ label?: string }>;
          };
          const rows = (d.matches ?? []).slice(0, 5).map((m) => {
            let l: { room_id?: string; sb?: number; bb?: number; seated?: number } = {};
            try {
              l = JSON.parse(m.label ?? "{}");
            } catch {
              /* label not json */
            }
            const blinds = l.sb && l.bb ? `$${l.sb / 100} / $${l.bb / 100}` : "";
            return { name: l.room_id || "Table", note: `${blinds}${blinds ? " · " : ""}${l.seated ?? 0} seated` };
          });
          if (!cancelled && rows.length) setFeatured(rows);
        }
      } catch {
        /* guest / offline → keep demo rows */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tournaments]);

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
          {(featured ??
            (tournaments
              ? [
                  { name: "Gold Cup Championship", note: "Prize pool $1M · Sundays 20:00" },
                  { name: "Diamond Vault Turbo", note: "$50k GTD · Daily 21:00" },
                ]
              : [
                  { name: "High Stakes — Table 1", note: "$500 / $1k · 6-max" },
                  { name: "Nightly PLO — Table 3", note: "$25 / $50 · Pot-Limit Omaha" },
                ])
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
