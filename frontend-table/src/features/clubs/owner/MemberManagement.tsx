"use client";

import { useMemo, useState } from "react";

import { Button, Input } from "@/features/ui";
import { GLASS_PANEL, cn } from "@/features/ui/tokens";

import { joinDate, relTime, usd } from "./ownerRpc";
import { EmptyState, MemberAvatar, Meter, SectionTitle, StatusPill, roleColor } from "./ui";
import type { JoinRequest, MemberTab, RosterRow } from "./types";

const PAGE_SIZE = 8;

export function MemberManagement({
  roster,
  requests,
  demo,
  canManage,
  onPromote,
  onKick,
  onAllocate,
  onReview,
}: {
  roster: RosterRow[];
  requests: JoinRequest[];
  demo: boolean;
  canManage: boolean;
  onPromote: (m: RosterRow) => Promise<void>;
  onKick: (m: RosterRow) => Promise<void>;
  onAllocate: (m: RosterRow, cents: number) => Promise<void>;
  onReview: (req: JoinRequest, action: "approve" | "deny") => Promise<void>;
}) {
  const [tab, setTab] = useState<MemberTab>("all");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [editing, setEditing] = useState<RosterRow | null>(null);
  const [editAmount, setEditAmount] = useState("");

  const q = query.trim().toLowerCase();

  const activeRows = useMemo(
    () => roster.filter((m) => m.status !== "banned" && (!q || m.username.toLowerCase().includes(q))),
    [roster, q],
  );
  const bannedRows = useMemo(
    () => roster.filter((m) => m.status === "banned" && (!q || m.username.toLowerCase().includes(q))),
    [roster, q],
  );
  const pendingRows = useMemo(
    () => requests.filter((r) => !q || r.username.toLowerCase().includes(q)),
    [requests, q],
  );

  const rows = tab === "all" ? activeRows : tab === "banned" ? bannedRows : [];
  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const pageRows = rows.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

  const maxBalance = Math.max(1, ...roster.map((m) => m.balance + m.locked_amount));

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    try {
      await fn();
    } finally {
      setBusy(null);
    }
  };

  const TABS: Array<{ id: MemberTab; label: string; count: number }> = [
    { id: "all", label: "All Members", count: activeRows.length },
    { id: "pending", label: "Pending", count: pendingRows.length },
    { id: "banned", label: "Banned", count: bannedRows.length },
  ];

  const submitEdit = () => {
    if (!editing) return;
    const dollars = Number(editAmount);
    if (!Number.isFinite(dollars) || dollars < 0) return;
    const target = editing;
    void run(`edit-${target.user_id}`, async () => {
      await onAllocate(target, Math.round(dollars * 100));
      setEditing(null);
      setEditAmount("");
    });
  };

  return (
    <div>
      <SectionTitle
        eyebrow="Elite Membership Registry"
        title="Member Management"
        right={
          <div className="flex items-center gap-2">
            <div className="relative">
              <Input
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setPage(0);
                }}
                placeholder="Filter members…"
                className="w-56 pl-9"
              />
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/40">
                ⌕
              </span>
            </div>
          </div>
        }
      />

      {/* Tabs */}
      <div className="mb-4 flex flex-wrap gap-2">
        {TABS.map((t) => {
          const active = t.id === tab;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => {
                setTab(t.id);
                setPage(0);
              }}
              className={cn(
                "rounded-full border px-4 py-1.5 text-[11px] font-bold uppercase tracking-[0.14em] transition",
                active
                  ? "border-cyan/50 bg-cyan/10 text-cyan"
                  : "border-white/10 text-white/50 hover:border-white/25 hover:text-white/80",
              )}
            >
              {t.label}
              <span className={cn("ml-2", active ? "text-cyan/80" : "text-white/35")}>{t.count}</span>
            </button>
          );
        })}
      </div>

      <div className={cn(GLASS_PANEL, "overflow-hidden")}>
        {/* Column header */}
        <div className="hidden grid-cols-[1.6fr_0.9fr_0.9fr_1.1fr_0.7fr_auto] gap-3 border-b border-white/[0.08] px-5 py-3 text-[10px] font-bold uppercase tracking-[0.18em] text-white/40 lg:grid">
          <span>Member</span>
          <span>Status</span>
          <span>Join Date</span>
          <span>Total Contribution</span>
          <span>Activity</span>
          <span className="text-right">Action</span>
        </div>

        {/* Pending tab → join requests */}
        {tab === "pending" ? (
          pendingRows.length === 0 ? (
            <EmptyState>No pending join requests.</EmptyState>
          ) : (
            <div>
              {pendingRows.map((r) => (
                <div
                  key={r.id}
                  className="flex flex-col gap-3 border-b border-white/[0.05] px-5 py-4 last:border-0 lg:flex-row lg:items-center"
                >
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <MemberAvatar seed={r.user_id} name={r.username} ring="#f3c14b" />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="truncate font-semibold text-white">{r.username}</p>
                        <StatusPill status="pending" />
                      </div>
                      <p className="truncate text-xs text-white/50">{r.message || "Requested to join"}</p>
                      <p className="text-[10px] text-white/35">{relTime(r.created_at)}</p>
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <Button
                      size="sm"
                      disabled={!canManage || busy === `rev-${r.id}`}
                      onClick={() => void run(`rev-${r.id}`, () => onReview(r, "approve"))}
                      className="!from-emerald-600 !via-emerald-500 !to-emerald-400 !text-black"
                    >
                      Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="danger"
                      disabled={!canManage || busy === `rev-${r.id}`}
                      onClick={() => void run(`rev-${r.id}`, () => onReview(r, "deny"))}
                    >
                      Decline
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )
        ) : pageRows.length === 0 ? (
          <EmptyState>{tab === "banned" ? "No banned members." : "No members yet."}</EmptyState>
        ) : (
          <div>
            {pageRows.map((m) => {
              const rowBusy = busy?.endsWith(m.user_id) ?? false;
              const contribPct = ((m.balance + m.locked_amount) / maxBalance) * 100;
              const nextRole = m.role === "admin" ? "member" : "admin";
              return (
                <div
                  key={m.user_id}
                  className="grid grid-cols-1 gap-3 border-b border-white/[0.05] px-5 py-4 last:border-0 lg:grid-cols-[1.6fr_0.9fr_0.9fr_1.1fr_0.7fr_auto] lg:items-center"
                >
                  {/* Member identity */}
                  <div className="flex min-w-0 items-center gap-3">
                    <MemberAvatar seed={m.user_id} name={m.username} />
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-white">
                        {m.username || m.user_id.slice(0, 8)}
                      </p>
                      <p
                        className="text-[10px] font-bold uppercase tracking-[0.14em]"
                        style={{ color: roleColor(m.role) }}
                      >
                        {m.role}
                      </p>
                    </div>
                  </div>

                  {/* Status */}
                  <div>
                    <StatusPill status={m.status} />
                  </div>

                  {/* Join date */}
                  <div className="text-sm text-white/70">
                    <span className="text-[10px] uppercase tracking-wide text-white/35 lg:hidden">
                      Joined{" "}
                    </span>
                    {joinDate(m.joined_at)}
                  </div>

                  {/* Contribution + meter */}
                  <div>
                    <p className="text-sm font-bold text-gold">{usd(m.balance)}</p>
                    <Meter value={contribPct} tone="gold" />
                    {m.locked_amount > 0 && (
                      <p className="mt-1 text-[10px] text-white/40">
                        {usd(m.locked_amount)} at tables
                      </p>
                    )}
                  </div>

                  {/* Activity */}
                  <div className="text-sm text-white/70">
                    {m.activity_count.toLocaleString()}
                    <span className="ml-1 text-[10px] text-white/35">hands</span>
                  </div>

                  {/* Actions */}
                  <div className="flex flex-wrap justify-start gap-2 lg:justify-end">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={!canManage || rowBusy}
                      onClick={() => {
                        setEditing(m);
                        setEditAmount(((m.balance || 0) / 100).toString());
                      }}
                    >
                      Edit
                    </Button>
                    {tab !== "banned" && (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={!canManage || rowBusy || m.role === "owner"}
                        onClick={() => void run(`promote-${m.user_id}`, () => onPromote(m))}
                        title={`Set role to ${nextRole}`}
                      >
                        {m.role === "admin" ? "Demote" : "Promote"}
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="danger"
                      disabled={!canManage || rowBusy || m.role === "owner"}
                      onClick={() => void run(`kick-${m.user_id}`, () => onKick(m))}
                    >
                      {tab === "banned" ? "Remove" : "Kick"}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer / pagination */}
      {tab !== "pending" && rows.length > 0 && (
        <div className="mt-4 flex items-center justify-between text-[11px] text-white/45">
          <span>
            Showing <span className="font-bold text-white/70">{page * PAGE_SIZE + 1}</span>–
            <span className="font-bold text-white/70">
              {Math.min(rows.length, (page + 1) * PAGE_SIZE)}
            </span>{" "}
            of <span className="font-bold text-white/70">{rows.length}</span> members
          </span>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              disabled={page === 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              className="rounded-lg border border-white/10 px-2.5 py-1 text-white/60 transition hover:border-white/25 disabled:opacity-30"
            >
              ‹
            </button>
            {Array.from({ length: pageCount }).map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setPage(i)}
                className={cn(
                  "min-w-[28px] rounded-lg border px-2 py-1 transition",
                  i === page
                    ? "border-cyan/50 bg-cyan/10 text-cyan"
                    : "border-white/10 text-white/60 hover:border-white/25",
                )}
              >
                {i + 1}
              </button>
            ))}
            <button
              type="button"
              disabled={page >= pageCount - 1}
              onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
              className="rounded-lg border border-white/10 px-2.5 py-1 text-white/60 transition hover:border-white/25 disabled:opacity-30"
            >
              ›
            </button>
          </div>
        </div>
      )}

      {/* Edit / allocate-balance modal */}
      {editing && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
          onClick={() => setEditing(null)}
        >
          <div
            className={cn(GLASS_PANEL, "w-full max-w-sm p-6")}
            onClick={(e) => e.stopPropagation()}
          >
            <p className="font-display text-[11px] font-bold uppercase tracking-[0.25em] text-gold/80">
              Edit Member
            </p>
            <div className="mt-3 flex items-center gap-3">
              <MemberAvatar seed={editing.user_id} name={editing.username} size={48} />
              <div>
                <p className="font-semibold text-white">{editing.username}</p>
                <p className="text-xs capitalize text-white/50">{editing.role}</p>
              </div>
            </div>
            <label className="mt-5 block">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-white/45">
                Allocated bankroll (USD)
              </span>
              <Input
                type="number"
                min={0}
                step={100}
                value={editAmount}
                onChange={(e) => setEditAmount(e.target.value)}
                className="mt-1.5"
                autoFocus
              />
              <span className="mt-1 block text-[10px] text-white/40">
                Sets this member&apos;s club-allocated balance via balance_allocate.
              </span>
            </label>
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setEditing(null)}>
                Cancel
              </Button>
              <Button
                size="sm"
                disabled={!canManage || busy === `edit-${editing.user_id}`}
                onClick={submitEdit}
              >
                {busy === `edit-${editing.user_id}` ? "Saving…" : "Save Allocation"}
              </Button>
            </div>
            {!canManage && (
              <p className="mt-3 text-[11px] text-amber-300/80">
                Only club owners/admins can allocate balances.
              </p>
            )}
            {demo && (
              <p className="mt-2 text-[11px] text-white/40">Demo mode — change is local only.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
