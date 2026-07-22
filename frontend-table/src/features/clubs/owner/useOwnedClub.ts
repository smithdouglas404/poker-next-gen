"use client";

// Resolves the club the signed-in caller owns/configures, so the standalone
// owner sub-pages (sponsorship, invite, revenue, invitation system) can bind to
// a real club_id. Mirrors the bootstrap in OwnerHub. When Nakama is unreachable
// or the caller owns no club, `demo` flips true and the pages render the
// clearly-labelled offline dataset instead of fabricating live figures.

import { useEffect, useState } from "react";

import { ownerApi } from "./ownerRpc";
import { DEMO_CLUB } from "./demoData";
import type { OwnerClub } from "./types";

export interface OwnedClubState {
  loading: boolean;
  demo: boolean;
  club: OwnerClub | null;
  role: string | null;
}

export function useOwnedClub(): OwnedClubState {
  const [state, setState] = useState<OwnedClubState>({
    loading: true,
    demo: false,
    club: null,
    role: null,
  });

  useEffect(() => {
    let cancelled = false;

    const toDemo = () =>
      !cancelled &&
      setState({ loading: false, demo: true, club: DEMO_CLUB, role: "owner" });

    void (async () => {
      let list: OwnerClub[] = [];
      try {
        const data = await ownerApi.list();
        list = data.clubs ?? [];
      } catch {
        toDemo();
        return;
      }

      let owned: { club: OwnerClub; role: string } | null = null;
      for (const c of list.slice(0, 12)) {
        try {
          const detail = await ownerApi.get(c.id);
          const r = detail.my_membership?.role;
          if (r === "owner" || r === "admin") {
            owned = { club: detail.club, role: r };
            break;
          }
        } catch {
          /* skip */
        }
      }

      if (cancelled) return;
      if (!owned) {
        toDemo();
        return;
      }
      setState({ loading: false, demo: false, club: owned.club, role: owned.role });
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
