"use client";

// Operator × capability grid — the real version of the Security card's
// "Admin Roles" / "Moderator" dropdowns.
//
// Those were two <Select>s of role NAMES with no person attached: picking
// "Super Admin" wrote the string "Super Admin" into settings_json and granted
// nobody anything. Authority actually lives on operator seats (poker_owner), and
// until now it was binary — `can_configure` meant every capability at once, so
// there was no way to let someone moderate a club without also handing them its
// money.
//
// This renders one row per real seat and one column per real capability, saving
// through club_permissions_set (owner-only, server-enforced).

import { useCallback, useEffect, useState } from "react";

import { Button, Select } from "@/features/ui";
import { cn } from "@/features/ui/tokens";

import { ownerApi } from "./ownerRpc";
import type { ClubPermission, ClubPermissionsPayload, ClubSeat } from "./types";

/** Operator-facing wording. The slugs are an implementation detail. */
const PERM_LABEL: Record<ClubPermission, string> = {
  manage_members: "Members",
  manage_money: "Money",
  manage_tables: "Tables",
  manage_settings: "Settings",
};

const PERM_HINT: Record<ClubPermission, string> = {
  manage_members: "Invite, approve, kick, set roster roles, post announcements",
  manage_money: "Allocate balances, approve credit, set rake, read the house ledger",
  manage_tables: "Create tables, schedule and launch club nights",
  manage_settings: "Club identity, branding, visibility, and adding operators",
};

/** Offline showcase only. Disabled end to end — see `load`. */
const DEMO_PERMISSIONS: ClubPermissionsPayload = {
  club_id: "demo",
  catalog: ["manage_members", "manage_money", "manage_tables", "manage_settings"],
  roles: ["owner", "manager", "moderator", "agent"],
  role_preset: {
    owner: ["manage_members", "manage_money", "manage_tables", "manage_settings"],
    manager: ["manage_members", "manage_tables", "manage_settings"],
    moderator: ["manage_members"],
    agent: ["manage_members"],
  },
  seats: [
    { user_id: "demo-owner-0001", role: "owner", permissions: [] },
    {
      user_id: "demo-manager-0002",
      role: "manager",
      permissions: ["manage_members", "manage_tables", "manage_settings"],
    },
    { user_id: "demo-mod-0003", role: "moderator", permissions: ["manage_members"] },
    // A seat that predates the grid: still full access, and the row must say so.
    { user_id: "demo-legacy-0004", role: "manager", permissions: [], legacy: true },
  ],
};

const ROLE_HINT: Record<string, string> = {
  owner: "Full control, always — an owner can never be locked out of their own club.",
  manager: "Everything except the club's money.",
  moderator: "Members only — cannot touch funds, tables or settings.",
  agent: "Members only.",
};

function shortId(userID: string): string {
  return userID.length > 12 ? `${userID.slice(0, 6)}…${userID.slice(-4)}` : userID;
}

export function PermissionGrid({
  clubId,
  canManage,
  isOwner,
  demo,
  notify,
}: {
  clubId: string | null;
  /** Caller can configure the club at all. */
  canManage: boolean;
  /** Only a club OWNER may hand out authority — the server enforces this too. */
  isOwner: boolean;
  demo: boolean;
  notify: (msg: string, kind?: "ok" | "err") => void;
}) {
  const [data, setData] = useState<ClubPermissionsPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [savingUser, setSavingUser] = useState<string | null>(null);
  // Local edits keyed by user id; absent means "unchanged from the server".
  const [draft, setDraft] = useState<Record<string, { role: string; perms: ClubPermission[] }>>({});

  const load = useCallback(async () => {
    // Demo shows the SHAPE of the grid with sample seats so the screen is
    // reviewable offline, but every control is disabled — this edits real
    // authority and must never look actionable against data that isn't real.
    if (demo) {
      setData(DEMO_PERMISSIONS);
      setDraft({});
      return;
    }
    if (!clubId) return;
    setLoading(true);
    setFailed(false);
    try {
      setData(await ownerApi.permissionsList(clubId));
      setDraft({});
    } catch {
      setData(null);
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [clubId, demo]);

  useEffect(() => {
    void load();
  }, [load]);

  const seatDraft = (seat: ClubSeat) => {
    const edited = draft[seat.user_id];
    if (edited) return edited;
    // A legacy seat has no grid and therefore has EVERY capability. Showing its
    // stored (empty) list would render four unchecked boxes next to a badge
    // reading "full access" — a row that contradicts itself. Start it from the
    // truth, so constraining the seat means unchecking things.
    const perms = seat.legacy && seat.role !== "owner" ? [...(data?.catalog ?? [])] : seat.permissions;
    return { role: seat.role, perms };
  };

  const editSeat = (seat: ClubSeat, patch: Partial<{ role: string; perms: ClubPermission[] }>) =>
    setDraft((d) => ({ ...d, [seat.user_id]: { ...seatDraft(seat), ...patch } }));

  const togglePerm = (seat: ClubSeat, perm: ClubPermission) => {
    const cur = seatDraft(seat).perms;
    editSeat(seat, {
      perms: cur.includes(perm) ? cur.filter((p) => p !== perm) : [...cur, perm],
    });
  };

  const applyPreset = (seat: ClubSeat, role: string) => {
    const preset = data?.role_preset?.[role] ?? [];
    editSeat(seat, { role, perms: [...preset] });
  };

  const save = async (seat: ClubSeat) => {
    if (!clubId) return;
    const d = seatDraft(seat);
    setSavingUser(seat.user_id);
    try {
      await ownerApi.permissionsSet(clubId, seat.user_id, d.role, d.perms);
      notify(`Saved permissions for ${shortId(seat.user_id)}.`);
      await load();
    } catch (e) {
      notify(e instanceof Error ? e.message : "Could not save permissions", "err");
    } finally {
      setSavingUser(null);
    }
  };

  if (!clubId && !demo) {
    return <p className="text-sm text-white/50">Select a club to manage its operators.</p>;
  }
  if (loading && !data) {
    return <p className="text-sm text-white/50">Loading operators…</p>;
  }
  if (failed || !data) {
    return (
      <div className="space-y-2">
        <p className="text-sm text-white/50">
          Could not load this club&apos;s operators. Nothing is shown rather than a guess at who can
          do what.
        </p>
        <Button variant="outline" size="sm" onClick={() => void load()}>
          Retry
        </Button>
      </div>
    );
  }

  const catalog = data.catalog ?? [];

  return (
    <div className="space-y-4">
      {demo && (
        <p className="rounded-lg border border-gold/25 bg-gold/[0.06] px-3 py-2 text-xs text-gold/90">
          Sample operators, shown so the grid is reviewable offline. Nothing here is editable —
          permissions are real authority and are only ever set against a live club.
        </p>
      )}
      {!demo && !isOwner && (
        <p className="rounded-lg border border-gold/25 bg-gold/[0.06] px-3 py-2 text-xs text-gold/90">
          Only a club owner can change who holds which permissions. You can see the grid but not
          edit it.
        </p>
      )}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[620px] border-collapse text-sm">
          <thead>
            <tr className="text-[10px] uppercase tracking-[0.15em] text-white/40">
              <th className="px-2 py-2 text-left font-semibold">Operator</th>
              <th className="px-2 py-2 text-left font-semibold">Role</th>
              {catalog.map((p) => (
                <th key={p} className="px-2 py-2 text-center font-semibold" title={PERM_HINT[p]}>
                  {PERM_LABEL[p] ?? p}
                </th>
              ))}
              <th className="px-2 py-2 text-right font-semibold" />
            </tr>
          </thead>
          <tbody>
            {data.seats.map((seat) => {
              const d = seatDraft(seat);
              const isSeatOwner = d.role === "owner";
              // A legacy seat is dirty the moment it is touched: saving it is what
              // converts "unconstrained" into an explicit grid, even if every box
              // is left ticked.
              const dirty = seat.legacy
                ? draft[seat.user_id] !== undefined
                : d.role !== seat.role ||
                  d.perms.length !== seat.permissions.length ||
                  d.perms.some((p) => !seat.permissions.includes(p));
              const rowDisabled = demo || !canManage || !isOwner || savingUser === seat.user_id;

              return (
                <tr key={seat.user_id} className="border-t border-white/[0.06]">
                  <td className="px-2 py-3">
                    <span className="block font-medium text-white">{shortId(seat.user_id)}</span>
                    {seat.legacy && (
                      // A legacy seat has no grid yet and therefore still has FULL
                      // access. Showing four unchecked boxes would read as "no
                      // permissions" — the exact opposite of what the server does.
                      <span className="mt-0.5 block text-[10px] uppercase tracking-wider text-gold/80">
                        Full access (legacy)
                      </span>
                    )}
                  </td>
                  <td className="px-2 py-3">
                    <Select
                      value={d.role}
                      disabled={rowDisabled}
                      onChange={(e) => applyPreset(seat, e.target.value)}
                      title={ROLE_HINT[d.role]}
                    >
                      {(data.roles ?? []).map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </Select>
                  </td>
                  {catalog.map((p) => (
                    <td key={p} className="px-2 py-3 text-center">
                      <input
                        type="checkbox"
                        className="h-4 w-4 accent-[#22c55e] disabled:opacity-40"
                        // An owner is authorized structurally on the server; the
                        // column is never consulted for them. Showing an editable
                        // box would imply an owner's access can be revoked here.
                        checked={isSeatOwner || d.perms.includes(p)}
                        disabled={rowDisabled || isSeatOwner}
                        aria-label={`${PERM_LABEL[p]} for ${shortId(seat.user_id)}`}
                        onChange={() => togglePerm(seat, p)}
                      />
                    </td>
                  ))}
                  <td className="px-2 py-3 text-right">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={rowDisabled || !dirty}
                      onClick={() => void save(seat)}
                    >
                      {savingUser === seat.user_id ? "Saving…" : "Save"}
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <ul className="space-y-1 text-[11px] leading-relaxed text-white/45">
        {catalog.map((p) => (
          <li key={p}>
            <span className="font-semibold text-white/70">{PERM_LABEL[p]}</span> — {PERM_HINT[p]}
          </li>
        ))}
        <li className={cn("pt-1 text-white/35")}>
          Seats marked “full access (legacy)” predate this grid and keep the authority they already
          had. Assigning a role to one starts enforcing it.
        </li>
      </ul>
    </div>
  );
}
