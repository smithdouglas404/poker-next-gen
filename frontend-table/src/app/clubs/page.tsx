"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { ClubShell } from "@/features/clubs/ClubShell";
import { clubApi } from "@/features/clubs/clubRpc";
import { Dashboard } from "@/features/clubs/sections/Dashboard";
import { Members } from "@/features/clubs/sections/Members";
import { Games } from "@/features/clubs/sections/Games";
import { Settings } from "@/features/clubs/sections/Settings";
import { Alliances } from "@/features/clubs/sections/Alliances";
import { Analytics } from "@/features/clubs/sections/Analytics";
import type { Club, ClubDetail, ClubSection } from "@/features/clubs/types";
import { Button, Field, Input } from "@/features/ui";
import { GLASS_PANEL, cn } from "@/features/ui/tokens";

interface Toast {
  msg: string;
  kind: "ok" | "err";
}

export default function ClubsPage() {
  const [clubs, setClubs] = useState<Club[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ClubDetail | null>(null);
  const [section, setSection] = useState<ClubSection>("dashboard");
  const [toast, setToast] = useState<Toast | null>(null);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [loading, setLoading] = useState(true);

  const notify = useCallback((msg: string, kind: "ok" | "err" = "ok") => {
    setToast({ msg, kind });
    window.setTimeout(() => setToast(null), 3200);
  }, []);

  const loadClubs = useCallback(async () => {
    try {
      const data = await clubApi.list();
      const list = data.clubs ?? [];
      setClubs(list);
      setActiveId((prev) => prev ?? list[0]?.id ?? null);
    } catch (e) {
      notify(e instanceof Error ? e.message : "Failed to load clubs", "err");
    } finally {
      setLoading(false);
    }
  }, [notify]);

  const loadDetail = useCallback(
    async (id: string) => {
      try {
        setDetail(await clubApi.get(id));
      } catch (e) {
        notify(e instanceof Error ? e.message : "Failed to open club", "err");
        setDetail(null);
      }
    },
    [notify],
  );

  useEffect(() => {
    void loadClubs();
  }, [loadClubs]);

  useEffect(() => {
    if (activeId) void loadDetail(activeId);
    else setDetail(null);
  }, [activeId, loadDetail]);

  const createClub = () =>
    void (async () => {
      if (newName.trim() === "") return;
      setCreating(true);
      try {
        const created = await clubApi.create(newName.trim());
        notify(`Club "${newName.trim()}" created.`);
        setNewName("");
        await loadClubs();
        if (created?.id) setActiveId(created.id);
      } catch (e) {
        notify(e instanceof Error ? e.message : "Create failed", "err");
      } finally {
        setCreating(false);
      }
    })();

  const myRole = detail?.my_membership?.role ?? null;
  const isConfigurer = myRole === "owner" || myRole === "admin";
  const isOwner = myRole === "owner";

  const content = useMemo(() => {
    if (!activeId || !detail) return null;
    switch (section) {
      case "dashboard":
        return <Dashboard clubId={activeId} isConfigurer={isConfigurer} toast={notify} />;
      case "members":
        return (
          <Members
            clubId={activeId}
            isConfigurer={isConfigurer}
            fallbackMembers={detail.members}
            toast={notify}
          />
        );
      case "games":
        return <Games clubId={activeId} isConfigurer={isConfigurer} toast={notify} />;
      case "settings":
        return (
          <Settings
            club={detail.club}
            members={detail.members}
            isConfigurer={isConfigurer}
            isOwner={isOwner}
            toast={notify}
            onChanged={() => void loadDetail(activeId)}
            onDeleted={() => {
              setActiveId(null);
              setSection("dashboard");
              void loadClubs();
            }}
          />
        );
      case "alliances":
        return <Alliances clubId={activeId} isConfigurer={isConfigurer} toast={notify} />;
      case "analytics":
        return <Analytics clubId={activeId} isConfigurer={isConfigurer} toast={notify} />;
      default:
        return null;
    }
  }, [activeId, detail, section, isConfigurer, isOwner, notify, loadDetail, loadClubs]);

  // No club yet → onboarding.
  if (!loading && clubs.length === 0) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4 text-foreground">
        <div className={cn(GLASS_PANEL, "w-full max-w-md p-8")}>
          <p className="font-display text-[11px] font-bold uppercase tracking-[0.25em] text-gold/80">
            Private Clubs
          </p>
          <h1 className="font-display mt-1 text-2xl font-bold uppercase tracking-wide">Start your club</h1>
          <p className="mt-2 text-sm text-neutral-400">
            A one-time ownership fee applies from your wallet. You become the owner and manage members,
            rake, games, and settings.
          </p>
          <Field label="Club name" className="mt-5">
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="High Rollers Lounge"
              onKeyDown={(e) => {
                if (e.key === "Enter") createClub();
              }}
            />
          </Field>
          <Button onClick={createClub} disabled={creating || newName.trim() === ""} className="mt-4 w-full">
            {creating ? "Creating…" : "Create Club"}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <>
      {toast && (
        <div
          className={cn(
            "fixed left-1/2 top-4 z-50 -translate-x-1/2 rounded-xl border px-4 py-2.5 text-sm backdrop-blur-xl",
            toast.kind === "ok"
              ? "border-emerald-500/30 bg-emerald-950/40 text-emerald-200"
              : "border-red-500/30 bg-red-950/40 text-red-200",
          )}
        >
          {toast.msg}
        </div>
      )}
      <ClubShell
        section={section}
        onSection={setSection}
        clubs={clubs}
        activeClubId={activeId}
        onSelectClub={(id) => setActiveId(id)}
        clubName={detail?.club.name ?? (loading ? "Loading…" : "Select a club")}
        memberCount={detail?.members.length ?? null}
        role={myRole}
      >
        {content ?? (
          <div className={cn(GLASS_PANEL, "flex h-64 items-center justify-center text-sm text-neutral-500")}>
            {loading ? "Loading club…" : "Select a club to begin."}
          </div>
        )}
      </ClubShell>
    </>
  );
}
