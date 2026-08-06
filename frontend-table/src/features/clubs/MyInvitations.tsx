"use client";

// The invitee's side of the club invite flow (dpts_6).
//
// The operator's console has always shown a "Welcome Card" preview — club name,
// invite code, initial club credit. It was a preview of nothing. `club_invite`
// wrote a row to poker_club_invitation and logged an activity entry; it sent no
// notification, and `club_invitations_list` (which does exist, and is correct)
// was called by exactly one component in the dead `features/clubs/sections/`
// tree. So the invited player never learned they had been invited and had no way
// to accept — while `club_request_review` sat there, fully implemented, waiting
// for an "accept" it was never going to receive from anyone but an owner.
//
// This is the card the operator was previewing, delivered to the person it was
// addressed to, with the two buttons that resolve it.

import { useCallback, useEffect, useState } from "react";

import { callSessionRpc } from "@/lib/nakama/sessionRpc";
import { formatMoneyMode } from "@/features/money/money";
import { Button } from "@/features/ui";
import { GLASS_PANEL, HEADING_SM, cn } from "@/features/ui/tokens";

export interface ClubInvitation {
  id: string;
  club_id: string;
  club_name?: string;
  role?: string;
  credit_limit_cents?: number;
  message?: string;
  created_at?: string;
  expires_at?: string | null;
}

/** Days until `iso`, or null when there is no expiry. Negative = already past. */
function daysUntil(iso?: string | null): number | null {
  if (!iso) return null;
  const ms = new Date(iso).getTime() - Date.now();
  if (!Number.isFinite(ms)) return null;
  return Math.ceil(ms / 86_400_000);
}

function ExpiryNote({ expiresAt }: { expiresAt?: string | null }) {
  const days = daysUntil(expiresAt);
  // No expiry is a real, chosen state (an operator may issue a standing invite),
  // so it says so rather than showing nothing.
  if (days === null) {
    return <p className="mt-3 text-[11px] text-white/35">This invitation does not expire.</p>;
  }
  if (days <= 0) {
    return (
      <p className="mt-3 text-[11px] font-semibold text-gold-lite">
        This invitation has expired — ask the club to send a new one.
      </p>
    );
  }
  return (
    <p className={cn("mt-3 text-[11px]", days <= 3 ? "font-semibold text-gold" : "text-white/35")}>
      Expires in {days} day{days === 1 ? "" : "s"}.
    </p>
  );
}

function WelcomeCard({
  inv,
  busy,
  onAccept,
  onDecline,
}: {
  inv: ClubInvitation;
  busy: boolean;
  onAccept: () => void;
  onDecline: () => void;
}) {
  const clubName = inv.club_name?.trim() || "a High Rollers club";
  // The monogram is derived from the club's name, not a fixed "HR" — an invite
  // to the Ivy Room should not be stamped with someone else's initials.
  const monogram =
    (inv.club_name ?? "")
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]!.toUpperCase())
      .join("") || "HR";
  const credit = inv.credit_limit_cents ?? 0;
  const expired = (daysUntil(inv.expires_at) ?? 1) <= 0;

  return (
    <div
      className="relative overflow-hidden rounded-2xl border border-gold/30 p-6 text-center"
      style={{
        background:
          "radial-gradient(120% 120% at 50% 0%, rgba(245,197,24,0.12), rgba(11,13,15,0.9) 60%), #0f1114",
        boxShadow: "0 0 40px -18px rgba(245,197,24,0.5) inset",
      }}
    >
      <div
        className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-gold/50 font-display text-xl font-bold text-gold"
        style={{ background: "radial-gradient(circle,#1a1c1f,#0b0d0f)" }}
      >
        {monogram}
      </div>
      <h3 className="font-display mt-4 text-lg font-bold text-gold">Welcome to {clubName}</h3>
      <p className="mt-1 text-xs uppercase tracking-[0.2em] text-white/50">
        Your Exclusive Access Awaits
      </p>

      {inv.message?.trim() ? (
        <p className="mt-4 whitespace-pre-wrap text-sm leading-snug text-white/70">
          “{inv.message.trim()}”
        </p>
      ) : null}

      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        <div className="rounded-lg border border-white/10 bg-black/40 px-3 py-2">
          <p className="text-[10px] uppercase tracking-[0.2em] text-white/40">Role</p>
          <p className="text-sm font-semibold capitalize text-white">{inv.role || "member"}</p>
        </div>
        <div className="rounded-lg border border-white/10 bg-black/40 px-3 py-2">
          <p className="text-[10px] uppercase tracking-[0.2em] text-white/40">Initial Club Credit</p>
          {/* "club" mode, not cash: this credit settles through the club's
              ledger, which is a different thing from money in the global wallet. */}
          <p className="text-sm font-semibold text-green">{formatMoneyMode(credit, "club")}</p>
        </div>
      </div>

      <ExpiryNote expiresAt={inv.expires_at} />

      <div className="mt-4 flex justify-center gap-2">
        <Button variant="gold" size="sm" disabled={busy || expired} onClick={onAccept}>
          {busy ? "Working…" : "Accept invitation"}
        </Button>
        <Button variant="outline" size="sm" disabled={busy} onClick={onDecline}>
          Decline
        </Button>
      </div>
      {credit > 0 && !expired ? (
        <p className="mt-2 text-[10px] leading-snug text-white/30">
          Accepting joins the club and allocates this credit to you.
        </p>
      ) : null}
    </div>
  );
}

export function MyInvitations() {
  const [invites, setInvites] = useState<ClubInvitation[] | null>(null);
  const [unreachable, setUnreachable] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = (await callSessionRpc("club_invitations_list", { status: "pending" })) as {
        invitations?: ClubInvitation[];
      };
      setInvites(res?.invitations ?? []);
      setUnreachable(false);
    } catch {
      // An unreachable server is not "no invitations". Rendering nothing would
      // be the same as saying nobody invited you, which may be false.
      setInvites([]);
      setUnreachable(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const resolve = useCallback(
    async (inv: ClubInvitation, action: "accept" | "decline") => {
      setBusyId(inv.id);
      setError(null);
      try {
        await callSessionRpc("club_request_review", { invitation_id: inv.id, action });
        setDone(
          action === "accept"
            ? `You've joined ${inv.club_name?.trim() || "the club"}.`
            : "Invitation declined.",
        );
        // Re-read rather than dropping the row locally: the server is the
        // authority on what is still pending, and an accept that half-failed
        // must not leave the UI claiming success.
        await load();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not resolve the invitation");
      } finally {
        setBusyId(null);
      }
    },
    [load],
  );

  // Nothing pending is the common case — stay silent rather than occupying the
  // dashboard with an empty panel.
  if (invites === null || (invites.length === 0 && !done)) return null;

  return (
    <section className={cn(GLASS_PANEL, "p-5")}>
      <p className={HEADING_SM}>Club Invitations</p>

      {unreachable && (
        <p className="mt-2 text-[11px] text-white/40">
          Couldn&apos;t reach the club service — any pending invitations aren&apos;t shown.
        </p>
      )}
      {done && <p className="mt-2 text-[12px] font-semibold text-green">{done}</p>}
      {error && <p className="mt-2 text-[12px] font-semibold text-gold-lite">{error}</p>}

      {invites.length > 0 && (
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {invites.map((inv) => (
            <WelcomeCard
              key={inv.id}
              inv={inv}
              busy={busyId === inv.id}
              onAccept={() => void resolve(inv, "accept")}
              onDecline={() => void resolve(inv, "decline")}
            />
          ))}
        </div>
      )}
    </section>
  );
}
