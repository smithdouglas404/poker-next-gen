"use client";

import { useCallback, useEffect, useState } from "react";

import { Button, Field, Input, Select } from "@/features/ui";
import { GLASS_PANEL, cn } from "@/features/ui/tokens";

import { clubApi, relTime } from "../clubRpc";
import { CardHeader, EmptyState, severityColor } from "../components";
import type { Alliance, AllianceMember, Announcement, Club, Invitation } from "../types";

export function Alliances({
  clubId,
  isConfigurer,
  toast,
}: {
  clubId: string;
  isConfigurer: boolean;
  toast: (msg: string, kind?: "ok" | "err") => void;
}) {
  const [alliance, setAlliance] = useState<Alliance | null>(null);
  const [allianceMembers, setAllianceMembers] = useState<AllianceMember[]>([]);
  const [news, setNews] = useState<Announcement[]>([]);
  const [invites, setInvites] = useState<Invitation[]>([]);
  const [browse, setBrowse] = useState<Club[]>([]);
  const [search, setSearch] = useState("");
  const [ann, setAnn] = useState({ title: "", body: "", severity: "info" });
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [al, an, inv, br] = await Promise.allSettled([
      clubApi.alliance(clubId),
      clubApi.announcements(clubId),
      clubApi.invitations(),
      clubApi.browse(""),
    ]);
    if (al.status === "fulfilled") {
      setAlliance(al.value.alliance);
      setAllianceMembers(al.value.members ?? []);
    }
    if (an.status === "fulfilled") setNews(an.value.announcements ?? []);
    if (inv.status === "fulfilled") setInvites(inv.value.invitations ?? []);
    if (br.status === "fulfilled") setBrowse((br.value.clubs ?? []).filter((c) => c.id !== clubId));
  }, [clubId]);

  useEffect(() => {
    void load();
  }, [load]);

  const runSearch = () =>
    void (async () => {
      setBusy("search");
      try {
        const r = await clubApi.browse(search.trim());
        setBrowse((r.clubs ?? []).filter((c) => c.id !== clubId));
      } catch (e) {
        toast(e instanceof Error ? e.message : "Search failed", "err");
      } finally {
        setBusy(null);
      }
    })();

  const post = () =>
    void (async () => {
      if (ann.title.trim() === "") return;
      setBusy("post");
      try {
        await clubApi.createAnnouncement(clubId, ann.title.trim(), ann.body.trim(), ann.severity);
        toast("Announcement posted.");
        setAnn({ title: "", body: "", severity: "info" });
        await load();
      } catch (e) {
        toast(e instanceof Error ? e.message : "Post failed", "err");
      } finally {
        setBusy(null);
      }
    })();

  const reviewInvite = (inv: Invitation, action: "approve" | "deny") =>
    void (async () => {
      setBusy(inv.id);
      try {
        await clubApi.reviewRequest(inv.id, action);
        toast(action === "approve" ? "Invitation accepted." : "Invitation declined.");
        await load();
      } catch (e) {
        toast(e instanceof Error ? e.message : "Action failed", "err");
      } finally {
        setBusy(null);
      }
    })();

  const requestJoin = (id: string) =>
    void (async () => {
      setBusy(id);
      try {
        await clubApi.joinRequest(id, "Requesting to join via clubs dashboard");
        toast("Join request sent.");
      } catch (e) {
        toast(e instanceof Error ? e.message : "Request failed", "err");
      } finally {
        setBusy(null);
      }
    })();

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <div className="space-y-5">
        {/* Alliance */}
        <div className={cn(GLASS_PANEL, "p-5")}>
          <CardHeader>Your Alliance</CardHeader>
          {alliance ? (
            <div>
              <p className="font-display text-xl font-bold text-gold">{alliance.name}</p>
              <p className="mt-1 text-[12px] text-white/55">
                {allianceMembers.length} allied club{allianceMembers.length === 1 ? "" : "s"} · formed{" "}
                {relTime(alliance.created_at)}
              </p>
            </div>
          ) : (
            <EmptyState>This club is not in an alliance yet.</EmptyState>
          )}
        </div>

        {/* Announcements */}
        <div className={cn(GLASS_PANEL, "p-5")}>
          <CardHeader>Club News</CardHeader>
          {news.length === 0 ? (
            <EmptyState>No announcements yet.</EmptyState>
          ) : (
            <ul className="mb-4 space-y-2">
              {news.map((n) => (
                <li key={n.id} className="border-l-2 pl-3" style={{ borderColor: severityColor(n.severity) }}>
                  <p className="text-[13px] font-semibold text-white">{n.title}</p>
                  {n.body && <p className="text-[12px] leading-relaxed text-white/60">{n.body}</p>}
                  <p className="mt-0.5 text-[10px] text-neutral-600">{relTime(n.created_at)}</p>
                </li>
              ))}
            </ul>
          )}
          {isConfigurer && (
            <div className="space-y-2 border-t border-white/[0.06] pt-3">
              <Input
                value={ann.title}
                onChange={(e) => setAnn({ ...ann, title: e.target.value })}
                placeholder="Announcement title"
              />
              <Input
                value={ann.body}
                onChange={(e) => setAnn({ ...ann, body: e.target.value })}
                placeholder="Details (optional)"
              />
              <div className="flex gap-2">
                <Select
                  value={ann.severity}
                  onChange={(e) => setAnn({ ...ann, severity: e.target.value })}
                  className="w-40"
                >
                  <option value="info">Info</option>
                  <option value="warning">Warning</option>
                  <option value="critical">Critical</option>
                </Select>
                <Button onClick={post} disabled={busy === "post" || ann.title.trim() === ""} className="flex-1">
                  {busy === "post" ? "Posting…" : "Post"}
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="space-y-5">
        {/* My invitations */}
        <div className={cn(GLASS_PANEL, "p-5")}>
          <CardHeader>Your Invitations</CardHeader>
          {invites.length === 0 ? (
            <EmptyState>No pending invitations.</EmptyState>
          ) : (
            <div className="space-y-2">
              {invites.map((inv) => (
                <div
                  key={inv.id}
                  className="flex items-center justify-between rounded-xl border border-white/[0.07] bg-white/[0.02] px-3 py-2.5"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-white">Invited as {inv.role}</p>
                    <p className="truncate text-[11px] text-white/50">{inv.message || "Club invitation"}</p>
                  </div>
                  <div className="flex shrink-0 gap-1.5">
                    <Button size="sm" onClick={() => reviewInvite(inv, "approve")} disabled={busy === inv.id}>
                      Accept
                    </Button>
                    <Button
                      size="sm"
                      variant="danger"
                      onClick={() => reviewInvite(inv, "deny")}
                      disabled={busy === inv.id}
                    >
                      Decline
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Discover clubs */}
        <div className={cn(GLASS_PANEL, "p-5")}>
          <CardHeader>Discover Clubs</CardHeader>
          <div className="mb-3 flex gap-2">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") runSearch();
              }}
              placeholder="Search public clubs…"
            />
            <Button size="sm" variant="outline" onClick={runSearch} disabled={busy === "search"}>
              Search
            </Button>
          </div>
          {browse.length === 0 ? (
            <EmptyState>No public clubs found.</EmptyState>
          ) : (
            <div className="space-y-2">
              {browse.slice(0, 8).map((c) => (
                <div
                  key={c.id}
                  className="flex items-center justify-between rounded-xl border border-white/[0.07] bg-white/[0.02] px-3 py-2.5"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-white">{c.name}</p>
                    {c.description && <p className="truncate text-[11px] text-white/45">{c.description}</p>}
                  </div>
                  <Button size="sm" variant="outline" onClick={() => requestJoin(c.id)} disabled={busy === c.id}>
                    Request
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
