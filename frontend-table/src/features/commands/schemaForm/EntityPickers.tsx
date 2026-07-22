"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { callSessionRpc } from "@/lib/nakama/sessionRpc";
import { useActiveClub } from "./activeClub";

const FIELD =
  "w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2.5 text-sm text-white outline-none transition focus:border-gold/50 focus:ring-1 focus:ring-gold/30";

/**
 * ClubPicker (UI review P0-1): a dropdown of the operator's clubs from the live
 * `club_list` RPC, defaulting to the active club. Replaces pasting `club_id`.
 */
export function ClubPicker({
  value,
  onChange,
  id,
  invalid,
}: {
  value: string;
  onChange: (v: string) => void;
  id?: string;
  invalid?: boolean;
}) {
  const { clubs, activeClubId } = useActiveClub();

  // Default an empty field to the active club so the operator never types an id.
  useEffect(() => {
    if (!value && activeClubId) onChange(activeClubId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeClubId]);

  if (clubs.length === 0) {
    return (
      <input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="No clubs found — create one first"
        className={`${FIELD} ${invalid ? "border-brand/60" : ""}`}
      />
    );
  }

  return (
    <select
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`${FIELD} ${invalid ? "border-brand/60" : ""}`}
    >
      <option value="" className="bg-surface-2">Select a club…</option>
      {clubs.map((c) => (
        <option key={c.id} value={c.id} className="bg-surface-2 text-white">
          {c.name}
        </option>
      ))}
    </select>
  );
}

interface MemberOption {
  user_id: string;
  username: string;
  role?: string;
}

/**
 * UserPicker (UI review P0-1): a username typeahead. It suggests members of the
 * active club (live `club_members` RPC) — the right scope for club owner/role/
 * balance actions — and always allows a free-typed id as a fallback so it's
 * never a dead end. Emits the selected `user_id`.
 */
export function UserPicker({
  value,
  onChange,
  clubId,
  id,
  invalid,
}: {
  value: string;
  onChange: (v: string) => void;
  clubId?: string;
  id?: string;
  invalid?: boolean;
}) {
  const { activeClubId } = useActiveClub();
  const effectiveClub = clubId || activeClubId || "";
  const [members, setMembers] = useState<MemberOption[]>([]);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    if (!effectiveClub) {
      setMembers([]);
      return;
    }
    void (async () => {
      try {
        const data = (await callSessionRpc("club_members", { club_id: effectiveClub })) as
          | { members?: MemberOption[] }
          | null;
        if (!cancelled) setMembers(Array.isArray(data?.members) ? data!.members! : []);
      } catch {
        if (!cancelled) setMembers([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [effectiveClub]);

  // Close the suggestion list on outside click.
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const selected = members.find((m) => m.user_id === value);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return members.slice(0, 8);
    return members
      .filter((m) => m.username?.toLowerCase().includes(q) || m.user_id.toLowerCase().includes(q))
      .slice(0, 8);
  }, [members, query]);

  return (
    <div ref={boxRef} className="relative">
      <input
        id={id}
        value={open ? query : selected?.username ?? value}
        placeholder={effectiveClub ? "Search members by username…" : "Enter a user id"}
        aria-invalid={invalid}
        onFocus={() => {
          setOpen(true);
          setQuery("");
        }}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          // Allow raw id entry as a fallback.
          onChange(e.target.value);
        }}
        className={`${FIELD} ${invalid ? "border-brand/60" : ""}`}
      />
      {selected && !open && (
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-mono text-neutral-500">
          {selected.user_id.slice(0, 8)}
        </span>
      )}
      {open && filtered.length > 0 && (
        <ul className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-xl border border-white/10 bg-surface-2 py-1 shadow-2xl">
          {filtered.map((m) => (
            <li key={m.user_id}>
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  onChange(m.user_id);
                  setOpen(false);
                }}
                className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm text-white hover:bg-white/10"
              >
                <span className="font-medium">{m.username || "(no name)"}</span>
                <span className="flex items-center gap-2">
                  {m.role && (
                    <span className="rounded-full bg-white/10 px-2 py-0.5 text-[9px] uppercase tracking-wider text-neutral-300">
                      {m.role}
                    </span>
                  )}
                  <span className="font-mono text-[10px] text-neutral-500">{m.user_id.slice(0, 8)}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
