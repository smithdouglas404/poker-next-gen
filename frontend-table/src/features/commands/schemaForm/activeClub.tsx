"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import { callSessionRpc } from "@/lib/nakama/sessionRpc";

export interface ClubRef {
  id: string;
  name: string;
  slug?: string;
  currency?: string;
}

interface ActiveClubValue {
  clubs: ClubRef[];
  loading: boolean;
  activeClubId: string | null;
  activeClub: ClubRef | null;
  setActiveClubId: (id: string) => void;
  refresh: () => Promise<void>;
}

const STORAGE_KEY = "png.activeClubId";

const ActiveClubContext = createContext<ActiveClubValue | null>(null);

/**
 * ActiveClubProvider (UI review P0-4): loads the operator's clubs from the live
 * `club_list` RPC and holds the active-club selection (persisted per device).
 * Command forms read this so `club_id` is inherited from context instead of
 * being pasted by hand. An operator managing two clubs switches once.
 */
export function ActiveClubProvider({ children }: { children: React.ReactNode }) {
  const [clubs, setClubs] = useState<ClubRef[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeClubId, setActive] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const data = (await callSessionRpc("club_list", {})) as { clubs?: ClubRef[] } | null;
      const list = Array.isArray(data?.clubs) ? data!.clubs! : [];
      setClubs(list);
      setActive((current) => {
        if (current && list.some((c) => c.id === current)) return current;
        const stored = typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
        if (stored && list.some((c) => c.id === stored)) return stored;
        return list[0]?.id ?? null;
      });
    } catch {
      setClubs([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const setActiveClubId = useCallback((id: string) => {
    setActive(id);
    if (typeof window !== "undefined") localStorage.setItem(STORAGE_KEY, id);
  }, []);

  const value = useMemo<ActiveClubValue>(() => {
    const activeClub = clubs.find((c) => c.id === activeClubId) ?? null;
    return { clubs, loading, activeClubId, activeClub, setActiveClubId, refresh };
  }, [clubs, loading, activeClubId, setActiveClubId, refresh]);

  return <ActiveClubContext.Provider value={value}>{children}</ActiveClubContext.Provider>;
}

export function useActiveClub(): ActiveClubValue {
  const ctx = useContext(ActiveClubContext);
  if (!ctx) {
    // Safe fallback so a form used outside the provider still renders.
    return {
      clubs: [],
      loading: false,
      activeClubId: null,
      activeClub: null,
      setActiveClubId: () => {},
      refresh: async () => {},
    };
  }
  return ctx;
}

/** Header chip: shows the active club and switches context (P0-4). */
export function ActiveClubSwitcher() {
  const { clubs, activeClubId, setActiveClubId, loading } = useActiveClub();

  if (loading) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2 text-xs text-neutral-400">
        Loading clubs…
      </div>
    );
  }
  if (clubs.length === 0) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2 text-xs text-neutral-400">
        No club yet — create one below
      </div>
    );
  }

  return (
    <label className="flex items-center gap-2 rounded-xl border border-gold/30 bg-gold/10 px-3 py-2">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-gold/80">Active Club</span>
      <select
        value={activeClubId ?? ""}
        onChange={(e) => setActiveClubId(e.target.value)}
        className="bg-transparent text-sm font-semibold text-white outline-none"
      >
        {clubs.map((c) => (
          <option key={c.id} value={c.id} className="bg-neutral-900 text-white">
            {c.name}
          </option>
        ))}
      </select>
    </label>
  );
}
