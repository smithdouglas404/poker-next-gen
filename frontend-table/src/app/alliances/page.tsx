"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import {
  CardLabel,
  EmptyState,
  Modal,
  SectionCard,
  SocialShell,
  Toast,
  useClubNames,
  useToast,
} from "@/features/social/common";
import { relTime, socialApi } from "@/features/social/socialRpc";
import type { Alliance, AllianceMember, Club, MeRoles } from "@/features/social/types";
import { Button, Field, Input, Select } from "@/features/ui";
import { cn } from "@/features/ui/tokens";

interface DetailState {
  members: AllianceMember[];
}

export default function AlliancesPage() {
  const { toast, notify } = useToast();
  const [alliances, setAlliances] = useState<Alliance[]>([]);
  const [clubs, setClubs] = useState<Club[]>([]);
  const [roles, setRoles] = useState<MeRoles>({ platform_admin: false, club_admin_of: [] });
  const [details, setDetails] = useState<Record<string, DetailState>>({});
  const [expanded, setExpanded] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Create-alliance modal.
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [foundingClub, setFoundingClub] = useState("");

  const clubName = useClubNames(clubs);
  const myClubs = useMemo(
    () => clubs.filter((c) => roles.club_admin_of.includes(c.id)),
    [clubs, roles],
  );
  const configures = useCallback((id: string) => roles.club_admin_of.includes(id), [roles]);

  const load = useCallback(async () => {
    const [al, cl, mr] = await Promise.allSettled([
      socialApi.allianceList(),
      socialApi.clubList(),
      socialApi.meRoles(),
    ]);
    if (al.status === "fulfilled") setAlliances(al.value.alliances ?? []);
    else notify(al.reason instanceof Error ? al.reason.message : "Failed to load alliances", "err");
    if (cl.status === "fulfilled") setClubs(cl.value.clubs ?? []);
    if (mr.status === "fulfilled") setRoles(mr.value);
    setLoading(false);
  }, [notify]);

  useEffect(() => {
    void load();
  }, [load]);

  const openDetail = useCallback(
    (id: string) =>
      void (async () => {
        if (expanded === id) {
          setExpanded(null);
          return;
        }
        setExpanded(id);
        try {
          const d = await socialApi.allianceGet(id);
          setDetails((prev) => ({ ...prev, [id]: { members: d.members ?? [] } }));
        } catch (e) {
          notify(e instanceof Error ? e.message : "Failed to open alliance", "err");
        }
      })(),
    [expanded, notify],
  );

  const create = () =>
    void (async () => {
      if (newName.trim() === "" || foundingClub === "") return;
      setBusy("create");
      try {
        await socialApi.allianceCreate(newName.trim(), foundingClub);
        notify(`Alliance "${newName.trim()}" founded.`);
        setCreateOpen(false);
        setNewName("");
        setFoundingClub("");
        await load();
      } catch (e) {
        notify(e instanceof Error ? e.message : "Create failed", "err");
      } finally {
        setBusy(null);
      }
    })();

  const rename = (a: Alliance) =>
    void (async () => {
      const next = window.prompt("New alliance name", a.name);
      if (!next || next.trim() === "" || next.trim() === a.name) return;
      setBusy(a.id);
      try {
        await socialApi.allianceUpdate(a.id, next.trim());
        notify("Alliance renamed.");
        await load();
      } catch (e) {
        notify(e instanceof Error ? e.message : "Rename failed", "err");
      } finally {
        setBusy(null);
      }
    })();

  const join = (allianceId: string, clubId: string) =>
    void (async () => {
      if (!clubId) return;
      setBusy(allianceId);
      try {
        await socialApi.allianceJoin(allianceId, clubId);
        notify("Club joined the alliance.");
        const d = await socialApi.allianceGet(allianceId);
        setDetails((prev) => ({ ...prev, [allianceId]: { members: d.members ?? [] } }));
      } catch (e) {
        notify(e instanceof Error ? e.message : "Join failed", "err");
      } finally {
        setBusy(null);
      }
    })();

  const removeClub = (allianceId: string, clubId: string) =>
    void (async () => {
      setBusy(`${allianceId}:${clubId}`);
      try {
        await socialApi.allianceRemoveClub(allianceId, clubId);
        notify("Club removed from alliance.");
        const d = await socialApi.allianceGet(allianceId);
        setDetails((prev) => ({ ...prev, [allianceId]: { members: d.members ?? [] } }));
      } catch (e) {
        notify(e instanceof Error ? e.message : "Remove failed", "err");
      } finally {
        setBusy(null);
      }
    })();

  const disband = (a: Alliance) =>
    void (async () => {
      if (!window.confirm(`Disband "${a.name}"? This cannot be undone.`)) return;
      setBusy(a.id);
      try {
        await socialApi.allianceDelete(a.id);
        notify("Alliance disbanded.");
        setExpanded(null);
        await load();
      } catch (e) {
        notify(e instanceof Error ? e.message : "Disband failed", "err");
      } finally {
        setBusy(null);
      }
    })();

  return (
    <SocialShell
      eyebrow="Federation Network"
      title="Alliances"
      subtitle="Federate clubs into a shared banner. A founding club opens the alliance; other clubs you configure can join, and a club belongs to at most one alliance."
    >
      <Toast toast={toast} />

      <div className="flex items-center justify-between">
        <CardLabel>
          {alliances.length} alliance{alliances.length === 1 ? "" : "s"}
        </CardLabel>
        <Button
          onClick={() => setCreateOpen(true)}
          disabled={myClubs.length === 0}
          size="sm"
          title={myClubs.length === 0 ? "You must configure a club to found an alliance" : undefined}
        >
          Found Alliance
        </Button>
      </div>

      {loading ? (
        <div className="flex h-48 items-center justify-center text-sm text-neutral-500">
          Loading alliances…
        </div>
      ) : alliances.length === 0 ? (
        <SectionCard className="p-8">
          <EmptyState>
            No alliances have been founded yet.
            {myClubs.length > 0 ? " Be the first — found one from a club you configure." : ""}
          </EmptyState>
        </SectionCard>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {alliances.map((a) => {
            const detail = details[a.id];
            const open = expanded === a.id;
            const iConfigureFounder = configures(a.founding_club_id);
            const memberClubIds = new Set((detail?.members ?? []).map((m) => m.club_id));
            const joinable = myClubs.filter((c) => !memberClubIds.has(c.id));
            return (
              <SectionCard key={a.id} hover className="p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-display truncate text-xl font-bold text-gold">{a.name}</p>
                    <p className="mt-1 text-[12px] text-white/55">
                      Founded by {clubName(a.founding_club_id)} · {relTime(a.created_at)}
                    </p>
                  </div>
                  {iConfigureFounder && (
                    <span className="shrink-0 rounded-full border border-gold/30 bg-gold/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.15em] text-gold">
                      Founder
                    </span>
                  )}
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={() => openDetail(a.id)}>
                    {open ? "Hide clubs" : "View clubs"}
                  </Button>
                  {iConfigureFounder && (
                    <>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => rename(a)}
                        disabled={busy === a.id}
                      >
                        Rename
                      </Button>
                      <Button
                        size="sm"
                        variant="danger"
                        onClick={() => disband(a)}
                        disabled={busy === a.id}
                      >
                        Disband
                      </Button>
                    </>
                  )}
                </div>

                {open && (
                  <div className="mt-4 space-y-3 border-t border-white/[0.06] pt-4">
                    <CardLabel>Member clubs</CardLabel>
                    {!detail ? (
                      <p className="text-sm text-neutral-500">Loading…</p>
                    ) : detail.members.length === 0 ? (
                      <EmptyState>No member clubs.</EmptyState>
                    ) : (
                      <ul className="space-y-2">
                        {detail.members.map((m) => {
                          const canRemove = iConfigureFounder || configures(m.club_id);
                          return (
                            <li
                              key={m.club_id}
                              className="flex items-center justify-between rounded-xl border border-white/[0.07] bg-white/[0.02] px-3 py-2"
                            >
                              <span className="truncate text-sm text-white">
                                {clubName(m.club_id)}
                                {m.club_id === a.founding_club_id && (
                                  <span className="ml-2 text-[10px] uppercase tracking-wider text-gold/70">
                                    founder
                                  </span>
                                )}
                              </span>
                              {canRemove && m.club_id !== a.founding_club_id && (
                                <Button
                                  size="sm"
                                  variant="danger"
                                  onClick={() => removeClub(a.id, m.club_id)}
                                  disabled={busy === `${a.id}:${m.club_id}`}
                                >
                                  {configures(m.club_id) && !iConfigureFounder ? "Leave" : "Remove"}
                                </Button>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    )}

                    {joinable.length > 0 && (
                      <JoinRow
                        clubs={joinable}
                        busy={busy === a.id}
                        onJoin={(clubId) => join(a.id, clubId)}
                      />
                    )}
                  </div>
                )}
              </SectionCard>
            );
          })}
        </div>
      )}

      <Modal open={createOpen} title="Found Alliance" onClose={() => setCreateOpen(false)}>
        <div className="space-y-4">
          <Field label="Alliance name">
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Diamond Federation"
              autoFocus
            />
          </Field>
          <Field label="Founding club" hint="Only clubs you configure can found an alliance.">
            <Select value={foundingClub} onChange={(e) => setFoundingClub(e.target.value)}>
              <option value="">Select a club…</option>
              {myClubs.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
          <Button
            onClick={create}
            disabled={busy === "create" || newName.trim() === "" || foundingClub === ""}
            className="w-full"
          >
            {busy === "create" ? "Founding…" : "Found Alliance"}
          </Button>
        </div>
      </Modal>
    </SocialShell>
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
    <div className={cn("flex gap-2 border-t border-white/[0.06] pt-3")}>
      <Select value={pick} onChange={(e) => setPick(e.target.value)} className="flex-1">
        <option value="">Add one of your clubs…</option>
        {clubs.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </Select>
      <Button size="sm" onClick={() => onJoin(pick)} disabled={busy || pick === ""}>
        Join
      </Button>
    </div>
  );
}
