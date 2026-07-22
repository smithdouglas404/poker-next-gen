"use client";

// Screen 2 — Club Member Invite Flow. Email/wallet + initial credit dropdown +
// Send, a live welcome-card preview, and a pending-invitations table. Wired to
// club_invite (creates the invitation, carrying credit_limit_cents) and
// balance_allocate (seeds the member's club credit on send).

import { useCallback, useEffect, useMemo, useState } from "react";

import { Button, Field, Input, Select } from "@/features/ui";
import { GLASS_PANEL, cn } from "@/features/ui/tokens";

import { OwnerPageShell, Toast, useToast } from "./OwnerPageShell";
import { useOwnedClub } from "./useOwnedClub";
import {
  DEMO_INVITES,
  dateOnly,
  screensApi,
  usd,
  type ClubInvitation,
} from "./screensRpc";
import { EmptyState } from "./ui";

const CREDIT_OPTIONS = [1_000_000_00, 2_500_000_00, 5_000_000_00];

function inviteCode(seed: string): string {
  // Deterministic pseudo-code from the recipient, purely presentational — the
  // authoritative invitation id comes back from club_invite.
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  const hex = h.toString(16).padStart(8, "0");
  return `HRC-${hex.slice(0, 4)}-${hex.slice(4, 8)}`.toUpperCase();
}

function StatusPill({ status }: { status: string }) {
  const s = (status || "sent").toLowerCase();
  const map: Record<string, { label: string; cls: string; dot: string }> = {
    sent: { label: "Sent", cls: "border-[#f5c518]/40 bg-[#f5c518]/10 text-[#f5c518]", dot: "◷" },
    pending: { label: "Sent", cls: "border-[#f5c518]/40 bg-[#f5c518]/10 text-[#f5c518]", dot: "◷" },
    accepted: { label: "Accepted", cls: "border-[#22c55e]/40 bg-[#22c55e]/10 text-[#22c55e]", dot: "✓" },
    expired: { label: "Expired", cls: "border-[#e01e2b]/45 bg-[#e01e2b]/10 text-[#ff6b73]", dot: "✕" },
    declined: { label: "Declined", cls: "border-[#e01e2b]/45 bg-[#e01e2b]/10 text-[#ff6b73]", dot: "✕" },
  };
  const m = map[s] ?? map.sent;
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold", m.cls)}>
      <span aria-hidden>{m.dot}</span>
      {m.label}
    </span>
  );
}

export function MemberInviteFlow() {
  const owned = useOwnedClub();
  const { toast, notify } = useToast();
  const [recipient, setRecipient] = useState("");
  const [credit, setCredit] = useState(CREDIT_OPTIONS[0]);
  const [invites, setInvites] = useState<ClubInvitation[]>([]);
  const [demoData, setDemoData] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (clubId: string) => {
    try {
      const res = await screensApi.invites(clubId);
      setInvites(res.requests?.filter((r) => r.type === "invite") ?? []);
      setDemoData(false);
    } catch {
      setInvites(DEMO_INVITES);
      setDemoData(true);
    }
  }, []);

  useEffect(() => {
    if (owned.loading) return;
    if (owned.demo || !owned.club) {
      setInvites(DEMO_INVITES);
      setDemoData(true);
      return;
    }
    void load(owned.club.id);
  }, [owned.loading, owned.demo, owned.club, load]);

  const demo = owned.demo || demoData;
  const previewCode = useMemo(() => inviteCode(recipient || "new-member"), [recipient]);

  const send = () => {
    const to = recipient.trim();
    if (!to) {
      notify("Enter a member email or wallet address.", "err");
      return;
    }
    void (async () => {
      setBusy(true);
      if (demo || !owned.club) {
        setInvites((prev) => [
          {
            id: `inv-${Date.now()}`,
            club_id: owned.club?.id ?? "demo-club",
            user_id: to,
            username: to,
            inviter: "owner",
            type: "invite",
            role: "member",
            credit_limit_cents: credit,
            status: "sent",
            message: "",
            created_at: new Date().toISOString(),
          },
          ...prev,
        ]);
        notify(`Invitation sent to ${to} with ${usd(credit)} credit (demo).`);
        setRecipient("");
        setBusy(false);
        return;
      }
      try {
        await screensApi.invite({
          clubId: owned.club.id,
          userId: to,
          username: to,
          role: "member",
          creditLimitCents: credit,
        });
        // Seed the initial club credit for the invitee.
        try {
          await screensApi.allocateBalance(owned.club.id, to, credit);
        } catch {
          /* allocation is best-effort until the invite is accepted */
        }
        notify(`Invitation sent to ${to}.`);
        setRecipient("");
        await load(owned.club.id);
      } catch (e) {
        notify(e instanceof Error ? e.message : "Invite failed", "err");
      } finally {
        setBusy(false);
      }
    })();
  };

  return (
    <OwnerPageShell
      clubName={owned.club?.name ?? "High Rollers Club"}
      title="Club Member Invite Flow"
      subtitle="Recruiting and onboarding new members into the club."
      demo={demo}
    >
      <Toast toast={toast} />

      {/* Invite form + welcome card */}
      <div className={cn(GLASS_PANEL, "p-6")}>
        <h2 className="font-display text-2xl font-bold uppercase tracking-wide text-white">
          Invite New Member
        </h2>
        <div className="mt-5 grid gap-6 lg:grid-cols-2">
          <div className="space-y-4">
            <Field label="Member Email or Wallet Address">
              <Input
                value={recipient}
                onChange={(e) => setRecipient(e.target.value)}
                placeholder="Member Email or Wallet Address"
              />
            </Field>
            <Field label="Assign Initial Credit Limit">
              <Select value={credit} onChange={(e) => setCredit(Number(e.target.value))}>
                {CREDIT_OPTIONS.map((c) => (
                  <option key={c} value={c}>
                    {usd(c)}
                  </option>
                ))}
              </Select>
            </Field>
            <Button variant="gold" className="w-full" disabled={busy} onClick={send}>
              {busy ? "Sending…" : "Send Invitation"}
            </Button>
          </div>

          {/* Welcome card preview */}
          <div>
            <p className="mb-2 text-center text-[11px] font-semibold uppercase tracking-[0.22em] text-white/45">
              Welcome Card
            </p>
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
                HR
              </div>
              <h3 className="font-display mt-4 text-lg font-bold text-gold">
                Welcome to {owned.club?.name ?? "the High Rollers Club"}
              </h3>
              <p className="mt-1 text-xs uppercase tracking-[0.2em] text-white/50">
                Your Exclusive Access Awaits
              </p>
              <div className="mt-4 rounded-lg border border-white/10 bg-black/40 px-3 py-2">
                <p className="text-[10px] uppercase tracking-[0.2em] text-white/40">
                  Unique Invite Code
                </p>
                <p className="font-mono text-sm font-bold text-gold">{previewCode}</p>
              </div>
              <p className="mt-3 text-[11px] text-white/45">
                Initial credit limit: <span className="font-semibold text-green">{usd(credit)}</span>
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Pending invitations */}
      <div className={cn(GLASS_PANEL, "mt-6 overflow-hidden")}>
        <div className="border-b border-white/[0.08] px-5 py-3.5">
          <h2 className="font-display text-lg font-bold uppercase tracking-wide text-white">
            Pending Invitations
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead>
              <tr className="border-b border-white/[0.08] text-[11px] uppercase tracking-[0.14em] text-white/45">
                <th className="px-5 py-3 font-semibold">Invitee</th>
                <th className="px-5 py-3 font-semibold">Status</th>
                <th className="px-5 py-3 font-semibold">Sent Date</th>
                <th className="px-5 py-3 font-semibold">Expiration Date</th>
              </tr>
            </thead>
            <tbody>
              {invites.map((inv) => {
                const sent = new Date(inv.created_at);
                const expires = new Date(+sent + 7 * 86_400_000);
                const accepted = inv.status.toLowerCase() === "accepted";
                return (
                  <tr key={inv.id} className="border-b border-white/[0.05] last:border-0">
                    <td className="px-5 py-3.5 text-white/85">{inv.username || inv.user_id}</td>
                    <td className="px-5 py-3.5">
                      <StatusPill status={inv.status} />
                    </td>
                    <td className="px-5 py-3.5 text-white/55">{dateOnly(inv.created_at)}</td>
                    <td className="px-5 py-3.5 text-white/55">
                      {accepted ? "—" : dateOnly(expires.toISOString())}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {invites.length === 0 && <EmptyState>No pending invitations.</EmptyState>}
      </div>
    </OwnerPageShell>
  );
}
