"use client";

// The member's view of their own clubs.
//
// Everything club-related was operator-facing: the Owner Hub for people who run
// a club, the join screen for people entering one. A player who had already
// joined had nowhere to see which clubs they belonged to, what club chips they
// held there, or how to leave.
//
// `club_leave` shipped with the club backend and had no caller anywhere, so
// joining a club was one-way. This is the surface that resolves that, and it
// shows the club balance beside the Leave control on purpose: leaving is refused
// while chips are held, and the reason should be visible before the click, not
// only in the error afterwards.

import { useCallback, useEffect, useState } from "react";

import { callSessionRpc } from "@/lib/nakama/sessionRpc";
import { formatMoneyMode } from "@/features/money/money";
import { Button } from "@/features/ui";
import { GLASS_PANEL, HEADING_SM, cn } from "@/features/ui/tokens";

interface MyClub {
  id: string;
  name: string;
  role: string;
  operator: boolean;
  balanceCents: number | null;
}

export function MyClubs() {
  const [clubs, setClubs] = useState<MyClub[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const roles = (await callSessionRpc("me_roles", {})) as {
        clubs?: Array<{ club_id: string; role: string; operator?: boolean }>;
      };
      const mine = roles?.clubs ?? [];
      if (mine.length === 0) {
        setClubs([]);
        return;
      }
      // Names are cosmetic — a failed lookup must not hide the club itself.
      let names = new Map<string, string>();
      try {
        const list = (await callSessionRpc("club_list", {})) as {
          clubs?: Array<{ id: string; name: string }>;
        };
        names = new Map((list?.clubs ?? []).map((c) => [c.id, c.name]));
      } catch {
        /* fall back to the id */
      }
      const rows = await Promise.all(
        mine.map(async (c) => {
          let balanceCents: number | null = null;
          try {
            const b = (await callSessionRpc("balance_get", { club_id: c.club_id })) as {
              balance?: number;
              locked_amount?: number;
            };
            // Held = spendable + locked. Chips in a live pot are still theirs and
            // still block leaving, so showing only `balance` would make the
            // refusal look arbitrary.
            balanceCents = (b?.balance ?? 0) + (b?.locked_amount ?? 0);
          } catch {
            balanceCents = null;
          }
          return {
            id: c.club_id,
            name: names.get(c.club_id) ?? c.club_id,
            role: c.role,
            operator: !!c.operator,
            balanceCents,
          };
        }),
      );
      setClubs(rows);
    } catch {
      setClubs([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const leave = useCallback(
    (club: MyClub) => {
      if (
        !window.confirm(
          `Leave ${club.name}?\n\nYou'll lose access to this club's tables and any credit line it extended you. You can be invited back.`,
        )
      ) {
        return;
      }
      void (async () => {
        setBusyId(club.id);
        setError(null);
        try {
          await callSessionRpc("club_leave", { club_id: club.id });
          setNotice(`You've left ${club.name}.`);
          await load();
        } catch (e) {
          // The server refuses on held chips or an active seat, with a reason.
          // Surface it verbatim — it tells the player exactly what to do next.
          setError(e instanceof Error ? e.message : "Could not leave the club");
        } finally {
          setBusyId(null);
        }
      })();
    },
    [load],
  );

  // Nothing to show for a player in no clubs — stay out of the way.
  if (clubs === null || (clubs.length === 0 && !notice)) return null;

  return (
    <section className={cn(GLASS_PANEL, "p-5")}>
      <p className={cn(HEADING_SM, "text-gold/80")}>My Clubs</p>
      {notice && <p className="mt-2 text-[12px] font-semibold text-green">{notice}</p>}
      {error && <p className="mt-2 text-[12px] font-semibold text-gold-lite">{error}</p>}

      <div className="mt-4 space-y-2">
        {clubs.map((c) => (
          <div
            key={c.id}
            className="flex flex-wrap items-center gap-3 rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-white">{c.name}</p>
              <p className="text-[11px] capitalize text-neutral-500">
                {c.operator ? `${c.role} · operator` : c.role}
                {c.balanceCents !== null && c.balanceCents > 0 ? (
                  <>
                    {" · "}
                    <span className="text-green">
                      {formatMoneyMode(c.balanceCents, "club")} held
                    </span>
                  </>
                ) : null}
              </p>
            </div>
            {c.operator ? (
              // An owner cannot leave their own club (the server refuses), and a
              // dead button that always errors is worse than none.
              <span className="text-[11px] uppercase tracking-wider text-neutral-600">
                Operator
              </span>
            ) : (
              <Button
                size="sm"
                variant="outline"
                disabled={busyId === c.id}
                onClick={() => leave(c)}
              >
                {busyId === c.id ? "Leaving…" : "Leave"}
              </Button>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
