"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import {
  CardLabel,
  EmptyState,
  Modal,
  SectionCard,
  SocialShell,
  StatusBadge,
  Toast,
  useClubNames,
  useToast,
} from "@/features/social/common";
import { dateLabel, localToIso, socialApi } from "@/features/social/socialRpc";
import type { Club, League, LeagueStanding, LeagueStatus, MeRoles } from "@/features/social/types";
import { Button, Field, Input, Select } from "@/features/ui";
import { cn } from "@/features/ui/tokens";

export default function LeaguesPage() {
  const { toast, notify } = useToast();
  const [leagues, setLeagues] = useState<League[]>([]);
  const [clubs, setClubs] = useState<Club[]>([]);
  const [roles, setRoles] = useState<MeRoles>({ platform_admin: false, club_admin_of: [] });
  const [standings, setStandings] = useState<Record<string, LeagueStanding[]>>({});
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ name: "", starts: "", ends: "" });

  const clubName = useClubNames(clubs);
  const myClubs = useMemo(
    () => clubs.filter((c) => roles.club_admin_of.includes(c.id)),
    [clubs, roles],
  );
  const isAdmin = roles.platform_admin;

  const load = useCallback(async () => {
    const [lg, cl, mr] = await Promise.allSettled([
      socialApi.leagueList(),
      socialApi.clubList(),
      socialApi.meRoles(),
    ]);
    if (lg.status === "fulfilled") setLeagues(lg.value.leagues ?? []);
    else notify(lg.reason instanceof Error ? lg.reason.message : "Failed to load leagues", "err");
    if (cl.status === "fulfilled") setClubs(cl.value.clubs ?? []);
    if (mr.status === "fulfilled") setRoles(mr.value);
    setLoading(false);
  }, [notify]);

  useEffect(() => {
    void load();
  }, [load]);

  const openLeague = useCallback(
    (id: string) =>
      void (async () => {
        if (selected === id) {
          setSelected(null);
          return;
        }
        setSelected(id);
        try {
          const d = await socialApi.leagueGet(id);
          setStandings((prev) => ({ ...prev, [id]: d.standings ?? [] }));
        } catch (e) {
          notify(e instanceof Error ? e.message : "Failed to open league", "err");
        }
      })(),
    [selected, notify],
  );

  const refreshStandings = useCallback(async (id: string) => {
    const d = await socialApi.leagueGet(id);
    setStandings((prev) => ({ ...prev, [id]: d.standings ?? [] }));
  }, []);

  const create = () =>
    void (async () => {
      if (form.name.trim() === "") return;
      setBusy("create");
      try {
        await socialApi.leagueCreate(form.name.trim(), localToIso(form.starts), localToIso(form.ends));
        notify(`League "${form.name.trim()}" opened.`);
        setCreateOpen(false);
        setForm({ name: "", starts: "", ends: "" });
        await load();
      } catch (e) {
        notify(e instanceof Error ? e.message : "Create failed", "err");
      } finally {
        setBusy(null);
      }
    })();

  const setStatus = (l: League, status: LeagueStatus) =>
    void (async () => {
      setBusy(l.id);
      try {
        await socialApi.leagueUpdate(l.id, { status });
        notify(`League set to ${status}.`);
        await load();
      } catch (e) {
        notify(e instanceof Error ? e.message : "Update failed", "err");
      } finally {
        setBusy(null);
      }
    })();

  const complete = (l: League) =>
    void (async () => {
      if (!window.confirm(`Complete "${l.name}"? This closes the season.`)) return;
      setBusy(l.id);
      try {
        const r = await socialApi.leagueComplete(l.id);
        notify(
          r.champion_club_id
            ? `Season closed — champion: ${clubName(r.champion_club_id)}.`
            : "Season closed.",
        );
        await load();
        await refreshStandings(l.id);
      } catch (e) {
        notify(e instanceof Error ? e.message : "Complete failed", "err");
      } finally {
        setBusy(null);
      }
    })();

  const remove = (l: League) =>
    void (async () => {
      if (!window.confirm(`Delete "${l.name}"? All standings are removed.`)) return;
      setBusy(l.id);
      try {
        await socialApi.leagueDelete(l.id);
        notify("League deleted.");
        setSelected(null);
        await load();
      } catch (e) {
        notify(e instanceof Error ? e.message : "Delete failed", "err");
      } finally {
        setBusy(null);
      }
    })();

  const join = (leagueId: string, clubId: string) =>
    void (async () => {
      if (!clubId) return;
      setBusy(leagueId);
      try {
        await socialApi.leagueJoin(leagueId, clubId);
        notify("Club enrolled in league.");
        await refreshStandings(leagueId);
      } catch (e) {
        notify(e instanceof Error ? e.message : "Join failed", "err");
      } finally {
        setBusy(null);
      }
    })();

  const setStanding = (leagueId: string, s: { club: string; points: number; wins: number; losses: number }) =>
    void (async () => {
      if (!s.club) return;
      setBusy(`st:${leagueId}`);
      try {
        const r = await socialApi.leagueStandingsSet(leagueId, s.club, s.points, s.wins, s.losses);
        setStandings((prev) => ({ ...prev, [leagueId]: r.standings ?? prev[leagueId] ?? [] }));
        notify("Standing saved.");
      } catch (e) {
        notify(e instanceof Error ? e.message : "Save failed", "err");
      } finally {
        setBusy(null);
      }
    })();

  return (
    <SocialShell
      eyebrow="Competitive Seasons"
      title="Leagues"
      subtitle="Season-long inter-club competition. Clubs you configure enroll to compete; standings accrue from match play, and platform directors open, adjust, and close each season."
    >
      <Toast toast={toast} />

      <div className="flex items-center justify-between">
        <CardLabel>
          {leagues.length} league{leagues.length === 1 ? "" : "s"}
        </CardLabel>
        {isAdmin && (
          <Button onClick={() => setCreateOpen(true)} size="sm">
            Open Season
          </Button>
        )}
      </div>

      {loading ? (
        <div className="flex h-48 items-center justify-center text-sm text-neutral-500">
          Loading leagues…
        </div>
      ) : leagues.length === 0 ? (
        <SectionCard className="p-8">
          <EmptyState>
            No leagues yet.{isAdmin ? " Open the first season above." : " Check back soon."}
          </EmptyState>
        </SectionCard>
      ) : (
        <div className="space-y-4">
          {leagues.map((l) => {
            const open = selected === l.id;
            const table = standings[l.id];
            const enrolled = new Set((table ?? []).map((s) => s.club_id));
            const joinable = myClubs.filter((c) => !enrolled.has(c.id));
            return (
              <SectionCard key={l.id} hover className="p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-3">
                      <p className="font-display truncate text-xl font-bold text-gold">{l.name}</p>
                      <StatusBadge status={l.status} />
                    </div>
                    <p className="mt-1 text-[12px] text-white/55">
                      {dateLabel(l.starts_at)} → {dateLabel(l.ends_at)}
                    </p>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => openLeague(l.id)}>
                    {open ? "Hide standings" : "View standings"}
                  </Button>
                </div>

                {isAdmin && (
                  <div className="mt-4 flex flex-wrap gap-2 border-t border-white/[0.06] pt-4">
                    {l.status !== "active" && l.status !== "completed" && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setStatus(l, "active")}
                        disabled={busy === l.id}
                      >
                        Activate
                      </Button>
                    )}
                    {l.status !== "completed" && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => complete(l)}
                        disabled={busy === l.id}
                      >
                        Complete season
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="danger"
                      onClick={() => remove(l)}
                      disabled={busy === l.id}
                    >
                      Delete
                    </Button>
                  </div>
                )}

                {open && (
                  <div className="mt-4 space-y-4 border-t border-white/[0.06] pt-4">
                    <StandingsTable
                      rows={table}
                      clubName={clubName}
                      completed={l.status === "completed"}
                    />

                    {l.status !== "completed" && joinable.length > 0 && (
                      <JoinRow
                        clubs={joinable}
                        busy={busy === l.id}
                        onJoin={(clubId) => join(l.id, clubId)}
                      />
                    )}

                    {isAdmin && (
                      <StandingEditor
                        clubs={clubs}
                        busy={busy === `st:${l.id}`}
                        onSave={(s) => setStanding(l.id, s)}
                      />
                    )}
                  </div>
                )}
              </SectionCard>
            );
          })}
        </div>
      )}

      <Modal open={createOpen} title="Open Season" onClose={() => setCreateOpen(false)}>
        <div className="space-y-4">
          <Field label="League name">
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Summer Championship"
              autoFocus
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Starts" hint="Defaults to now">
              <Input
                type="datetime-local"
                value={form.starts}
                onChange={(e) => setForm({ ...form, starts: e.target.value })}
              />
            </Field>
            <Field label="Ends" hint="Defaults +30d">
              <Input
                type="datetime-local"
                value={form.ends}
                onChange={(e) => setForm({ ...form, ends: e.target.value })}
              />
            </Field>
          </div>
          <Button
            onClick={create}
            disabled={busy === "create" || form.name.trim() === ""}
            className="w-full"
          >
            {busy === "create" ? "Opening…" : "Open Season"}
          </Button>
        </div>
      </Modal>
    </SocialShell>
  );
}

function StandingsTable({
  rows,
  clubName,
  completed,
}: {
  rows: LeagueStanding[] | undefined;
  clubName: (id: string) => string;
  completed: boolean;
}) {
  if (!rows) return <p className="text-sm text-neutral-500">Loading standings…</p>;
  if (rows.length === 0) return <EmptyState>No clubs enrolled yet.</EmptyState>;
  const sorted = [...rows].sort((a, b) => b.points - a.points || b.wins - a.wins);
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-[10px] uppercase tracking-[0.18em] text-neutral-500">
            <th className="px-2 py-1.5 text-left font-semibold">#</th>
            <th className="px-2 py-1.5 text-left font-semibold">Club</th>
            <th className="px-2 py-1.5 text-right font-semibold">Pts</th>
            <th className="px-2 py-1.5 text-right font-semibold">W</th>
            <th className="px-2 py-1.5 text-right font-semibold">L</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((s, i) => {
            const champ = completed && i === 0;
            return (
              <tr
                key={s.club_id}
                className={cn(
                  "border-t border-white/[0.05]",
                  champ && "bg-gold/[0.06]",
                )}
              >
                <td className="px-2 py-2 text-left">
                  <span className={cn("font-display font-bold", champ ? "text-gold" : "text-white/60")}>
                    {i + 1}
                  </span>
                </td>
                <td className="px-2 py-2 text-left text-white">
                  {clubName(s.club_id)}
                  {champ && (
                    <span className="ml-2 text-[10px] uppercase tracking-wider text-gold">
                      champion
                    </span>
                  )}
                </td>
                <td className="px-2 py-2 text-right font-semibold text-gold">{s.points}</td>
                <td className="px-2 py-2 text-right text-white/70">{s.wins}</td>
                <td className="px-2 py-2 text-right text-white/70">{s.losses}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function JoinRow({
  clubs,
  busy,
  onJoin,
}: {
  clubs: Club[];
  busy: boolean;
  onJoin: (clubId: string) => void;
}) {
  const [pick, setPick] = useState("");
  return (
    <div className="flex gap-2">
      <Select value={pick} onChange={(e) => setPick(e.target.value)} className="flex-1">
        <option value="">Enroll one of your clubs…</option>
        {clubs.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </Select>
      <Button size="sm" onClick={() => onJoin(pick)} disabled={busy || pick === ""}>
        Enroll
      </Button>
    </div>
  );
}

function StandingEditor({
  clubs,
  busy,
  onSave,
}: {
  clubs: Club[];
  busy: boolean;
  onSave: (s: { club: string; points: number; wins: number; losses: number }) => void;
}) {
  const [club, setClub] = useState("");
  const [points, setPoints] = useState(0);
  const [wins, setWins] = useState(0);
  const [losses, setLosses] = useState(0);
  const num = (v: string) => Math.max(0, Math.floor(Number(v) || 0));
  return (
    <div className="rounded-xl border border-gold/20 bg-gold/[0.03] p-3">
      <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-gold/70">
        Director override — set standing
      </p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        <Select value={club} onChange={(e) => setClub(e.target.value)} className="col-span-2 sm:col-span-2">
          <option value="">Club…</option>
          {clubs.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
        <Input type="number" min={0} value={points} onChange={(e) => setPoints(num(e.target.value))} placeholder="Pts" />
        <Input type="number" min={0} value={wins} onChange={(e) => setWins(num(e.target.value))} placeholder="W" />
        <Input type="number" min={0} value={losses} onChange={(e) => setLosses(num(e.target.value))} placeholder="L" />
      </div>
      <Button
        size="sm"
        className="mt-2 w-full"
        onClick={() => onSave({ club, points, wins, losses })}
        disabled={busy || club === ""}
      >
        {busy ? "Saving…" : "Save standing"}
      </Button>
    </div>
  );
}
