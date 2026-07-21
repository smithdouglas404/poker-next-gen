"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { callSessionRpc } from "@/lib/nakama/sessionRpc";
import { Button, Field, Input, Panel, SectionHeader } from "@/features/ui";

interface Club {
  id: string;
  name: string;
  slug: string;
  description?: string;
}

interface Member {
  user_id: string;
  username: string;
  role: string;
}

interface ClubDetail {
  club: Club;
  members: Member[];
  my_membership: Member | null;
  create_fee_cents: number;
}

export default function ClubsPage() {
  const [clubs, setClubs] = useState<Club[]>([]);
  const [detail, setDetail] = useState<ClubDetail | null>(null);
  const [newName, setNewName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const loadClubs = useCallback(async () => {
    setError(null);
    try {
      const data = (await callSessionRpc("club_list", {})) as { clubs?: Club[] };
      setClubs(data.clubs ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load clubs");
    }
  }, []);

  const [rakePct, setRakePct] = useState(5);
  const openClub = useCallback(async (id: string) => {
    setMessage(null);
    try {
      const d = (await callSessionRpc("club_get", { club_id: id })) as ClubDetail;
      setDetail(d);
      try {
        const rc = (await callSessionRpc("rake_config_get", { club_id: id })) as {
          percent_bps?: number;
        };
        setRakePct(Math.round((rc.percent_bps ?? 500) / 100));
      } catch {
        setRakePct(5);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to open club");
    }
  }, []);

  useEffect(() => {
    void loadClubs();
  }, [loadClubs]);

  const act = useCallback(
    async (key: string, fn: () => Promise<void>) => {
      setBusy(key);
      setMessage(null);
      setError(null);
      try {
        await fn();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Action failed");
      } finally {
        setBusy(null);
      }
    },
    [],
  );

  const createClub = () =>
    act("create", async () => {
      await callSessionRpc("club_create", { name: newName.trim() });
      setMessage(`Club "${newName.trim()}" created.`);
      setNewName("");
      await loadClubs();
    });

  const isOwnerAdmin = detail?.my_membership && ["owner", "admin"].includes(detail.my_membership.role);

  return (
    <div className="min-h-screen text-white">
      <header className="border-b border-white/10 px-6 py-8">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
          <div>
            <SectionHeader>Clubs</SectionHeader>
            <h1 className="font-display mt-1 text-3xl font-bold">Private Clubs</h1>
          </div>
          <Link href="/" className="text-sm text-cyan hover:underline">
            ← Command Center
          </Link>
        </div>
      </header>

      <main className="mx-auto grid max-w-6xl gap-6 px-6 py-10 lg:grid-cols-[1fr_1.2fr]">
        {error && (
          <div className="rounded-xl border border-red-500/30 bg-red-950/20 p-4 text-red-200 lg:col-span-2">
            {error}
          </div>
        )}
        {message && (
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-950/20 p-4 text-emerald-200 lg:col-span-2">
            {message}
          </div>
        )}

        <div className="space-y-6">
          <Panel className="p-6">
            <h2 className="font-display text-lg font-bold">Start a club</h2>
            <p className="mt-1 text-xs text-neutral-400">
              A one-time ownership fee applies (from your wallet). You become the owner and
              can manage members, rake, and settings.
            </p>
            <Field label="Club name" className="mt-4">
              <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="High Rollers Lounge" />
            </Field>
            <Button
              disabled={busy !== null || newName.trim() === ""}
              onClick={createClub}
              className="mt-3 w-full"
            >
              {busy === "create" ? "Creating…" : "Create club"}
            </Button>
          </Panel>

          <Panel className="p-6">
            <h2 className="font-display text-lg font-bold">All clubs</h2>
            <ul className="mt-3 space-y-2">
              {clubs.length === 0 && <li className="text-sm text-neutral-500">No clubs yet.</li>}
              {clubs.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => void openClub(c.id)}
                    className={`w-full rounded-xl border px-4 py-2.5 text-left text-sm transition ${
                      detail?.club.id === c.id
                        ? "border-amber-400/50 bg-amber-400/10"
                        : "border-white/10 bg-white/[0.02] hover:border-white/25"
                    }`}
                  >
                    <span className="font-semibold">{c.name}</span>
                    {c.description && <span className="block text-xs text-neutral-500">{c.description}</span>}
                  </button>
                </li>
              ))}
            </ul>
          </Panel>
        </div>

        <div>
          {detail ? (
            <Panel className="p-6">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="font-display text-2xl font-bold">{detail.club.name}</h2>
                  <p className="text-xs text-neutral-500">
                    {detail.members.length} member{detail.members.length === 1 ? "" : "s"}
                    {detail.my_membership && (
                      <span className="text-amber-300"> · you are {detail.my_membership.role}</span>
                    )}
                  </p>
                </div>
                {!detail.my_membership ? (
                  <Button
                    size="sm"
                    disabled={busy !== null}
                    onClick={() =>
                      act("join", async () => {
                        await callSessionRpc("club_join", { club_id: detail.club.id });
                        await openClub(detail.club.id);
                      })
                    }
                  >
                    Join
                  </Button>
                ) : detail.my_membership.role !== "owner" ? (
                  <Button
                    size="sm"
                    variant="danger"
                    disabled={busy !== null}
                    onClick={() =>
                      act("leave", async () => {
                        await callSessionRpc("club_leave", { club_id: detail.club.id });
                        await openClub(detail.club.id);
                      })
                    }
                  >
                    Leave
                  </Button>
                ) : null}
              </div>

              {isOwnerAdmin && (
                <div className="mt-5 rounded-xl border border-amber-400/25 bg-amber-950/10 p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-amber-200">
                      House rake
                    </span>
                    <span className="text-lg font-bold text-amber-300">{rakePct}%</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={10}
                    step={1}
                    value={rakePct}
                    onChange={(e) => setRakePct(Number(e.target.value))}
                    className="mt-2 w-full accent-amber-400"
                  />
                  <div className="mt-1 flex justify-between text-[10px] text-neutral-500">
                    <span>0%</span>
                    <span>10% max</span>
                  </div>
                  <Button
                    size="sm"
                    disabled={busy !== null}
                    onClick={() =>
                      act("rake", async () => {
                        await callSessionRpc("rake_config_set", {
                          club_id: detail.club.id,
                          name: "Standard",
                          percent_bps: rakePct * 100,
                        });
                        setMessage(`Rake set to ${rakePct}%.`);
                      })
                    }
                    className="mt-3"
                  >
                    Save rake
                  </Button>
                </div>
              )}

              <div className="mt-5 space-y-2">
                {detail.members.map((m) => (
                  <div
                    key={m.user_id}
                    className="flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2 text-sm"
                  >
                    <span>
                      {m.username || m.user_id.slice(0, 8)}
                      <span
                        className={`ml-2 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${
                          m.role === "owner"
                            ? "bg-amber-500/20 text-amber-300"
                            : m.role === "admin"
                              ? "bg-cyan/20 text-cyan"
                              : "bg-white/5 text-neutral-400"
                        }`}
                      >
                        {m.role}
                      </span>
                    </span>
                    {isOwnerAdmin && m.role !== "owner" && (
                      <span className="flex gap-1.5">
                        <button
                          type="button"
                          onClick={() =>
                            act("role" + m.user_id, async () => {
                              await callSessionRpc("club_member_role", {
                                club_id: detail.club.id,
                                user_id: m.user_id,
                                role: m.role === "admin" ? "member" : "admin",
                              });
                              await openClub(detail.club.id);
                            })
                          }
                          className="rounded border border-cyan/30 px-2 py-0.5 text-[10px] font-semibold text-cyan hover:bg-cyan/10"
                        >
                          {m.role === "admin" ? "Demote" : "Make admin"}
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            act("kick" + m.user_id, async () => {
                              await callSessionRpc("club_kick", {
                                club_id: detail.club.id,
                                user_id: m.user_id,
                              });
                              await openClub(detail.club.id);
                            })
                          }
                          className="rounded border border-red-500/30 px-2 py-0.5 text-[10px] font-semibold text-red-300 hover:bg-red-950/30"
                        >
                          Kick
                        </button>
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </Panel>
          ) : (
            <Panel className="flex h-full items-center justify-center p-10 text-sm text-neutral-500">
              Select a club to view members and manage it.
            </Panel>
          )}
        </div>
      </main>
    </div>
  );
}
