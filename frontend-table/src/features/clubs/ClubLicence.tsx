"use client";

// A club's authority to host cash games, and who supplies it.
//
// The licence belongs to a PERSON, not the club — an owner with a sponsor-capable
// membership AND verified identity. A club may have several owners; one qualified
// owner licenses the club, and the rest do not each need their own.
//
// This screen exists because a greyed-out button teaches nothing. The blocker is
// frequently a CO-OWNER's missing KYC or lapsed plan — someone who is not the
// person looking at the screen — so "you can't do this" without naming the reason
// leaves an operator with nothing to try. It says which of the two requirements
// is missing, and that a co-owner can satisfy it instead.

import { useCallback, useEffect, useState } from "react";

import { callSessionRpc } from "@/lib/nakama/sessionRpc";
import { Button } from "@/features/ui";
import { GLASS_PANEL, HEADING_SM, cn } from "@/features/ui/tokens";

export interface ClubLicenceInfo {
  club_id: string;
  can_host_cash: boolean;
  licensed_by?: string;
  reason?: string;
  owners_checked: number;
}

/** Read a club's licence. Returns null when it cannot be determined. */
export async function fetchClubLicence(clubId: string): Promise<ClubLicenceInfo | null> {
  try {
    return (await callSessionRpc("club_licence_get", { club_id: clubId })) as ClubLicenceInfo;
  } catch {
    return null;
  }
}

export function ClubLicencePanel({ clubId }: { clubId: string }) {
  const [lic, setLic] = useState<ClubLicenceInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [unreachable, setUnreachable] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetchClubLicence(clubId);
    // An unreadable licence is unknown, never "licensed". The server fails closed
    // for the same reason; the screen must not disagree with it.
    setUnreachable(res === null);
    setLic(res);
    setLoading(false);
  }, [clubId]);

  useEffect(() => {
    if (clubId) void load();
  }, [clubId, load]);

  if (!clubId) return null;

  return (
    <section className={cn(GLASS_PANEL, "p-5")}>
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <p className={cn(HEADING_SM, "text-gold/80")}>Cash Game Licence</p>
        <Button size="sm" variant="outline" onClick={() => void load()} disabled={loading}>
          {loading ? "Checking…" : "Re-check"}
        </Button>
      </div>

      {loading ? (
        <p className="mt-3 text-sm text-neutral-500">Checking the club&apos;s licence…</p>
      ) : unreachable ? (
        <p className="mt-3 text-sm text-neutral-400">
          Couldn&apos;t check the licence. This is not the same as being unlicensed — cash tables
          will still be refused until it can be confirmed.
        </p>
      ) : lic?.can_host_cash ? (
        <>
          <p className="mt-3 text-sm font-semibold text-green">
            This club can host cash games.
          </p>
          <p className="mt-1 text-[12px] leading-snug text-neutral-500">
            Licensed by an owner with a sponsor-capable membership and verified identity
            {lic.licensed_by ? (
              <>
                {" "}
                (<span className="font-mono text-neutral-400">{lic.licensed_by.slice(0, 12)}</span>)
              </>
            ) : null}
            . Any operator with table permission can open cash tables under it — they do not each
            need their own membership.
          </p>
        </>
      ) : (
        <>
          <p className="mt-3 text-sm font-semibold text-gold-lite">
            This club cannot host cash games yet.
          </p>
          <p className="mt-1 text-[13px] leading-snug text-neutral-300">{lic?.reason}</p>
          <p className="mt-3 text-[12px] leading-snug text-neutral-500">
            The licence is held by an <span className="font-semibold text-neutral-300">owner</span>,
            not by the club — like a liquor licence. It needs one owner with both a membership that
            allows sponsoring and completed identity verification.{" "}
            <span className="text-neutral-400">
              Any one owner is enough: if a co-owner qualifies, the whole club is covered.
            </span>
          </p>
          <p className="mt-2 text-[12px] leading-snug text-neutral-500">
            Private and play-money games are unaffected — those need no licence, only permission to
            act for the club.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <a href="/membership">
              <Button size="sm" variant="gold">
                Upgrade membership
              </Button>
            </a>
            <a href="/profile/security">
              <Button size="sm" variant="outline">
                Complete verification
              </Button>
            </a>
          </div>
        </>
      )}
    </section>
  );
}
