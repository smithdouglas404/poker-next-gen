"use client";

// Resolves the club the signed-in caller owns/configures, so the standalone
// owner sub-pages (sponsorship, invite, revenue, invitation system) can bind to
// a real club_id. Mirrors the bootstrap in OwnerHub.
//
// It used to flip to a fabricated club whenever the RPC failed OR the caller
// simply owned no club — so a network blip and "you don't run a club yet" both
// rendered a fictional roster worth $184M. Those are different facts and now
// report differently: `failed` for an unreachable server, `club: null` with
// `failed: false` for a caller who genuinely owns nothing. The showcase dataset
// only appears when the URL asks for it (`?demo=1`).

import { useEffect, useState } from "react";

import { ownerApi } from "./ownerRpc";
import { DEMO_CLUB } from "./demoData";
import { demoRequested } from "@/features/ui/demoMode";
import type { OwnerClub } from "./types";

export interface OwnedClubState {
  loading: boolean;
  /** True only when `?demo=1` asked for the showcase dataset. */
  demo: boolean;
  /** True when the lookup could not reach the server — distinct from "owns none". */
  failed: boolean;
  club: OwnerClub | null;
  role: string | null;
}

export function useOwnedClub(): OwnedClubState {
  const [state, setState] = useState<OwnedClubState>({
    loading: true,
    demo: false,
    failed: false,
    club: null,
    role: null,
  });

  useEffect(() => {
    let cancelled = false;
    const wantsDemo = demoRequested();

    // Only ever reached when the URL asked for it.
    const toDemo = () =>
      !cancelled &&
      setState({ loading: false, demo: true, failed: false, club: DEMO_CLUB, role: "owner" });

    const toFailed = () =>
      !cancelled &&
      setState({ loading: false, demo: false, failed: true, club: null, role: null });

    /** Reached the server; the caller genuinely configures no club. */
    const toNone = () =>
      !cancelled &&
      setState({ loading: false, demo: false, failed: false, club: null, role: null });

    void (async () => {
      if (wantsDemo) {
        toDemo();
        return;
      }

      let list: OwnerClub[] = [];
      try {
        const data = await ownerApi.list();
        list = data.clubs ?? [];
      } catch {
        toFailed();
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
        // Reached the server and the caller runs no club. That is a real answer,
        // not a failure — the screens offer "create a club" rather than an error.
        toNone();
        return;
      }
      setState({ loading: false, demo: false, failed: false, club: owned.club, role: owned.role });
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
