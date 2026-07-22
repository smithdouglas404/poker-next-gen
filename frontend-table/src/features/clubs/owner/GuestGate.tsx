"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { Button, Input } from "@/features/ui";
import { GLASS_PANEL, cn } from "@/features/ui/tokens";

import { ownerApi } from "./ownerRpc";
import { EmptyState, MemberAvatar } from "./ui";
import type { OwnerClub } from "./types";

/** Shown to signed-in users who own no club: browse public clubs (club_browse)
 * and request to join (club_join_request). Graceful, never a dead end. */
export function GuestGate({
  toast,
}: {
  toast: (msg: string, kind?: "ok" | "err") => void;
}) {
  const [search, setSearch] = useState("");
  const [clubs, setClubs] = useState<OwnerClub[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await ownerApi.browse(search.trim());
      setClubs(data.clubs ?? []);
    } catch {
      setClubs([]);
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    void load();
  }, [load]);

  const requestJoin = (club: OwnerClub) =>
    void (async () => {
      setBusy(club.id);
      try {
        await ownerApi.joinRequest(club.id, "Requesting to join via the club directory.");
        toast(`Join request sent to ${club.name}.`);
      } catch (e) {
        toast(e instanceof Error ? e.message : "Join request failed", "err");
      } finally {
        setBusy(null);
      }
    })();

  return (
    <div className="mx-auto min-h-screen max-w-[1000px] px-4 py-10 text-foreground">
      <p className="font-display text-[11px] font-bold uppercase tracking-[0.25em] text-gold/80">
        Private Clubs
      </p>
      <h1 className="font-display mt-1 text-3xl font-bold uppercase tracking-wide text-white">
        You don&apos;t own a club yet
      </h1>
      <p className="mt-2 max-w-xl text-sm text-white/55">
        Browse public clubs below and request a seat, or start your own club to unlock the owner
        hub — member management, house rake, tables and tournaments.
      </p>

      <div className="mt-6 flex flex-wrap items-end gap-3">
        <div className="relative min-w-[240px] flex-1">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void load();
            }}
            placeholder="Search clubs by name…"
            className="pl-9"
          />
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/40">
            ⌕
          </span>
        </div>
        <Button variant="outline" onClick={() => void load()}>
          Search
        </Button>
        <Link href="/hub">
          <Button variant="ghost">Start a club</Button>
        </Link>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        {loading ? (
          <div className={cn(GLASS_PANEL, "p-6 text-sm text-white/40")}>Loading clubs…</div>
        ) : clubs.length === 0 ? (
          <div className="sm:col-span-2">
            <EmptyState>No public clubs found. Try another search or start your own.</EmptyState>
          </div>
        ) : (
          clubs.map((c) => (
            <div key={c.id} className={cn(GLASS_PANEL, "flex items-center gap-3 p-4")}>
              <MemberAvatar seed={c.id} name={c.name} size={48} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold text-white">{c.name}</p>
                <p className="truncate text-xs text-white/50">
                  {c.description || "Public poker club"}
                </p>
              </div>
              <Button
                size="sm"
                disabled={busy === c.id}
                onClick={() => requestJoin(c)}
              >
                {busy === c.id ? "Sending…" : "Request Join"}
              </Button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
