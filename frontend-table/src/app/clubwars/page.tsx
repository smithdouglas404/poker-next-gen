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
import { localToIso, relTime, socialApi } from "@/features/social/socialRpc";
import type { Club, ClubWar, ClubWarHand, MeRoles } from "@/features/social/types";
import { Button, Field, Input, Select } from "@/features/ui";
import { cn } from "@/features/ui/tokens";

export default function ClubWarsPage() {
  const { toast, notify } = useToast();
  const [wars, setWars] = useState<ClubWar[]>([]);
  const [clubs, setClubs] = useState<Club[]>([]);
  const [roles, setRoles] = useState<MeRoles>({ platform_admin: false, club_admin_of: [] });
  const [hands, setHands] = useState<Record<string, ClubWarHand[]>>({});
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"" | "pending" | "active" | "completed">("");

  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [form, setForm] = useState({ clubA: "", clubB: "", at: "" });

  const clubName = useClubNames(clubs);
  const isAdmin = roles.platform_admin;
  const configures = useCallback((id: string) => roles.club_admin_of.includes(id), [roles]);
  const myClubs = useMemo(
    () => clubs.filter((c) => roles.club_admin_of.includes(c.id)),
    [clubs, roles],
  );

  const load = useCallback(async () => {
    const [wr, cl, mr] = await Promise.allSettled([
      socialApi.clubwarList("", filter),
      socialApi.clubList(),
      socialApi.meRoles(),
    ]);
    if (wr.status === "fulfilled") setWars(wr.value.wars ?? []);
    else notify(wr.reason instanceof Error ? wr.reason.message : "Failed to load wars", "err");
    if (cl.status === "fulfilled") setClubs(cl.value.clubs ?? []);
    if (mr.status === "fulfilled") setRoles(mr.value);
    setLoading(false);
  }, [filter, notify]);

  useEffect(() => {
    void load();
  }, [load]);

  const openWar = useCallback(
    (id: string) =>
      void (async () => {
        if (selected === id) {
          setSelected(null);
          return;
        }
        setSelected(id);
        try {
          const d = await socialApi.clubwarGet(id);
          setHands((prev) => ({ ...prev, [id]: d.hands ?? [] }));
        } catch (e) {
          notify(e instanceof Error ? e.message : "Failed to open war", "err");
        }
      })(),
    [selected, notify],
  );

  const schedule = () =>
    void (async () => {
      if (!form.clubA || !form.clubB || form.clubA === form.clubB) return;
      setBusy("schedule");
      try {
        await socialApi.clubwarSchedule(form.clubA, form.clubB, localToIso(form.at));
        notify("War proposed — awaiting the challenged club.");
        setScheduleOpen(false);
        setForm({ clubA: "", clubB: "", at: "" });
        await load();
      } catch (e) {
        notify(e instanceof Error ? e.message : "Schedule failed", "err");
      } finally {
        setBusy(null);
      }
    })();

  const accept = (w: ClubWar) =>
    void (async () => {
      setBusy(w.id);
      try {
        await socialApi.clubwarAccept(w.id);
        notify("War accepted — it is now active.");
        await load();
      } catch (e) {
        notify(e instanceof Error ? e.message : "Accept failed", "err");
      } finally {
        setBusy(null);
      }
    })();

  const matchmake = (w: ClubWar) =>
    void (async () => {
      setBusy(w.id);
      try {
        await socialApi.clubwarMatchmake(w.id);
        notify("War activated by director.");
        await load();
      } catch (e) {
        notify(e instanceof Error ? e.message : "Matchmake failed", "err");
      } finally {
        setBusy(null);
      }
    })();

  const settle = (w: ClubWar, scoreA?: number, scoreB?: number) =>
    void (async () => {
      setBusy(w.id);
      try {
        const r = await socialApi.clubwarResult(w.id, scoreA, scoreB);
        const winner = r.war.winner_id ? clubName(r.war.winner_id) : "Draw";
        notify(
          r.already_settled
            ? "War was already settled."
            : `Settled — ${winner}. ELO ${r.prev_elo_a}→${r.elo_a} / ${r.prev_elo_b}→${r.elo_b}.`,
        );
        await load();
      } catch (e) {
        notify(e instanceof Error ? e.message : "Settle failed", "err");
      } finally {
        setBusy(null);
      }
    })();

  const filters: Array<{ id: typeof filter; label: string }> = [
    { id: "", label: "All" },
    { id: "pending", label: "Pending" },
    { id: "active", label: "Active" },
    { id: "completed", label: "Completed" },
  ];

  return (
    <SocialShell
      eyebrow="Head-to-Head"
      title="Club Wars"
      subtitle="Challenge a rival club to a scored head-to-head. The challenged club accepts to go live; hands played settle the score, and directors finalize the result — recomputing each club's ELO."
    >
      <Toast toast={toast} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex gap-1 rounded-xl border border-white/[0.08] bg-white/[0.03] p-1">
          {filters.map((f) => (
            <button
              key={f.id || "all"}
              type="button"
              onClick={() => setFilter(f.id)}
              className={cn(
                "rounded-lg px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider transition",
                filter === f.id ? "bg-cyan/15 text-cyan" : "text-neutral-400 hover:text-white",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
        <Button
          onClick={() => setScheduleOpen(true)}
          disabled={myClubs.length === 0}
          size="sm"
          title={myClubs.length === 0 ? "You must configure a club to declare war" : undefined}
        >
          Declare War
        </Button>
      </div>

      {loading ? (
        <div className="flex h-48 items-center justify-center text-sm text-neutral-500">
          Loading wars…
        </div>
      ) : wars.length === 0 ? (
        <SectionCard className="p-8">
          <EmptyState>No club wars in this view.</EmptyState>
        </SectionCard>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {wars.map((w) => {
            const open = selected === w.id;
            const iConfigureB = configures(w.club_b);
            const aWinning = w.score_a >= w.score_b;
            return (
              <SectionCard key={w.id} hover className="p-5">
                <div className="flex items-center justify-between gap-2">
                  <StatusBadge status={w.status} />
                  <span className="text-[11px] text-white/45">
                    {w.status === "completed" ? "settled" : "scheduled"} {relTime(w.scheduled_at)}
                  </span>
                </div>

                <div className="mt-4 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
                  <WarSide
                    name={clubName(w.club_a)}
                    score={w.score_a}
                    winner={w.status === "completed" && w.winner_id === w.club_a}
                    lead={w.status !== "completed" && w.score_a > w.score_b}
                    align="left"
                  />
                  <span className="font-display text-[11px] font-bold uppercase tracking-[0.2em] text-neutral-500">
                    vs
                  </span>
                  <WarSide
                    name={clubName(w.club_b)}
                    score={w.score_b}
                    winner={w.status === "completed" && w.winner_id === w.club_b}
                    lead={w.status !== "completed" && w.score_b > w.score_a}
                    align="right"
                  />
                </div>

                {w.status === "completed" && !w.winner_id && (
                  <p className="mt-2 text-center text-[11px] uppercase tracking-wider text-neutral-500">
                    Draw
                  </p>
                )}

                <div className="mt-4 flex flex-wrap gap-2 border-t border-white/[0.06] pt-4">
                  <Button size="sm" variant="outline" onClick={() => openWar(w.id)}>
                    {open ? "Hide detail" : "View detail"}
                  </Button>
                  {w.status === "pending" && iConfigureB && (
                    <Button size="sm" onClick={() => accept(w)} disabled={busy === w.id}>
                      Accept challenge
                    </Button>
                  )}
                  {w.status === "pending" && isAdmin && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => matchmake(w)}
                      disabled={busy === w.id}
                    >
                      Force activate
                    </Button>
                  )}
                  {w.status === "active" && isAdmin && (
                    <SettleControls
                      war={w}
                      busy={busy === w.id}
                      onSettle={(a, b) => settle(w, a, b)}
                    />
                  )}
                </div>

                {open && (
                  <div className="mt-4 space-y-2 border-t border-white/[0.06] pt-4">
                    <CardLabel>Scoring hands</CardLabel>
                    <HandFeed
                      rows={hands[w.id]}
                      clubName={clubName}
                      leaderNote={
                        w.status !== "completed"
                          ? `${clubName(aWinning ? w.club_a : w.club_b)} leads`
                          : undefined
                      }
                    />
                  </div>
                )}
              </SectionCard>
            );
          })}
        </div>
      )}

      <Modal open={scheduleOpen} title="Declare War" onClose={() => setScheduleOpen(false)}>
        <div className="space-y-4">
          <Field label="Your club (challenger)" hint="Only clubs you configure can declare war.">
            <Select value={form.clubA} onChange={(e) => setForm({ ...form, clubA: e.target.value })}>
              <option value="">Select your club…</option>
              {myClubs.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Opponent club">
            <Select value={form.clubB} onChange={(e) => setForm({ ...form, clubB: e.target.value })}>
              <option value="">Select opponent…</option>
              {clubs
                .filter((c) => c.id !== form.clubA)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
            </Select>
          </Field>
          <Field label="Scheduled time" hint="Defaults to now">
            <Input
              type="datetime-local"
              value={form.at}
              onChange={(e) => setForm({ ...form, at: e.target.value })}
            />
          </Field>
          <Button
            onClick={schedule}
            disabled={
              busy === "schedule" || !form.clubA || !form.clubB || form.clubA === form.clubB
            }
            className="w-full"
          >
            {busy === "schedule" ? "Declaring…" : "Declare War"}
          </Button>
        </div>
      </Modal>
    </SocialShell>
  );
}

function WarSide({
  name,
  score,
  winner,
  lead,
  align,
}: {
  name: string;
  score: number;
  winner: boolean;
  lead: boolean;
  align: "left" | "right";
}) {
  return (
    <div className={cn(align === "right" ? "text-right" : "text-left")}>
      <p
        className={cn(
          "truncate text-sm font-semibold",
          winner ? "text-gold" : lead ? "text-cyan" : "text-white",
        )}
      >
        {name}
        {winner && <span className="ml-1 text-gold">♚</span>}
      </p>
      <p
        className={cn(
          "font-display text-3xl font-bold",
          winner ? "text-gold" : lead ? "text-cyan" : "text-white/70",
        )}
      >
        {score}
      </p>
    </div>
  );
}

function SettleControls({
  war,
  busy,
  onSettle,
}: {
  war: ClubWar;
  busy: boolean;
  onSettle: (a?: number, b?: number) => void;
}) {
  const [override, setOverride] = useState(false);
  const [a, setA] = useState(String(war.score_a));
  const [b, setB] = useState(String(war.score_b));
  if (!override) {
    return (
      <>
        <Button size="sm" onClick={() => onSettle()} disabled={busy}>
          Settle (running score)
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setOverride(true)} disabled={busy}>
          Override scores
        </Button>
      </>
    );
  }
  return (
    <div className="flex w-full flex-wrap items-end gap-2">
      <Field label="Score A" className="w-24">
        <Input type="number" value={a} onChange={(e) => setA(e.target.value)} />
      </Field>
      <Field label="Score B" className="w-24">
        <Input type="number" value={b} onChange={(e) => setB(e.target.value)} />
      </Field>
      <Button
        size="sm"
        onClick={() => onSettle(Math.floor(Number(a) || 0), Math.floor(Number(b) || 0))}
        disabled={busy}
      >
        Settle
      </Button>
      <Button size="sm" variant="ghost" onClick={() => setOverride(false)} disabled={busy}>
        Cancel
      </Button>
    </div>
  );
}

function HandFeed({
  rows,
  clubName,
  leaderNote,
}: {
  rows: ClubWarHand[] | undefined;
  clubName: (id: string) => string;
  leaderNote?: string;
}) {
  if (!rows) return <p className="text-sm text-neutral-500">Loading…</p>;
  if (rows.length === 0)
    return (
      <EmptyState>
        No scoring hands recorded yet.
        {leaderNote ? ` ${leaderNote}.` : ""}
      </EmptyState>
    );
  return (
    <ul className="max-h-56 space-y-1.5 overflow-y-auto">
      {rows.map((h) => (
        <li
          key={h.id}
          className="flex items-center justify-between rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-1.5 text-[12px]"
        >
          <span className="truncate text-white/80">
            {clubName(h.club_id)} · hand #{h.hand_no}
          </span>
          <span className={cn("font-display font-bold", h.delta >= 0 ? "text-emerald-300" : "text-red-300")}>
            {h.delta >= 0 ? "+" : ""}
            {h.delta}
          </span>
        </li>
      ))}
    </ul>
  );
}
