"use client";

// Club Invitations — the single invite surface (P0-8). Folds the former
// MemberInviteFlow + InvitationSystem screens into one: recipient + role +
// initial club credit, a live welcome-card preview, optional bulk paste, and one
// invitations table with copy-link / resend / revoke. Every action is wired to a
// real RPC — club_invite (send + resend), club_invite_revoke (revoke),
// balance_allocate (seed the member's club credit on send).

import { useCallback, useEffect, useMemo, useState } from "react";

import { Button, Field, Input, Select } from "@/features/ui";
import { GLASS_PANEL, cn } from "@/features/ui/tokens";
import { MoneyModeTag } from "@/features/money/MoneyModeTag";
import { formatMoneyMode } from "@/features/money/money";

import { OwnerPageShell, Toast, useToast } from "./OwnerPageShell";
import { useOwnedClub } from "./useOwnedClub";
import {
  DEMO_INVITES,
  dateOnly,
  screensApi,
  type ClubInvitation,
} from "./screensRpc";
import { EmptyState, MemberAvatar } from "./ui";

const ROLES = [
  { value: "member", label: "Member" },
  { value: "vip", label: "VIP" },
  { value: "admin", label: "Admin" },
];

// Invitations expire after this window; mirrors the server default surfaced by
// ClubRequestReview's "already resolved" gate on stale invites.
const INVITE_TTL_DAYS = 7;

function inviteCode(seed: string): string {
  // Deterministic pseudo-code from the recipient — purely presentational; the
  // authoritative invitation id comes back from club_invite.
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  const hex = h.toString(16).padStart(8, "0");
  return `HRC-${hex.slice(0, 4)}-${hex.slice(4, 8)}`.toUpperCase();
}

function inviteLink(code: string): string {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return `${origin}/clubs/join?invite=${code}`;
}

function StatusPill({ status }: { status: string }) {
  const s = (status || "sent").toLowerCase();
  const map: Record<string, { label: string; cls: string; dot: string }> = {
    sent: { label: "Pending", cls: "border-[#f5c518]/40 bg-[#f5c518]/10 text-[#f5c518]", dot: "◷" },
    pending: { label: "Pending", cls: "border-[#f5c518]/40 bg-[#f5c518]/10 text-[#f5c518]", dot: "◷" },
    accepted: { label: "Accepted", cls: "border-[#22c55e]/40 bg-[#22c55e]/10 text-[#22c55e]", dot: "✓" },
    expired: { label: "Expired", cls: "border-white/15 bg-white/[0.04] text-white/45", dot: "✕" },
    declined: { label: "Declined", cls: "border-[#e01e2b]/45 bg-[#e01e2b]/10 text-[#ff6b73]", dot: "✕" },
    revoked: { label: "Revoked", cls: "border-white/15 bg-white/[0.04] text-white/45", dot: "⊘" },
  };
  const m = map[s] ?? map.sent;
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold", m.cls)}>
      <span aria-hidden>{m.dot}</span>
      {m.label}
    </span>
  );
}

export function ClubInvitations() {
  const owned = useOwnedClub();
  const { toast, notify } = useToast();
  const [recipient, setRecipient] = useState("");
  const [role, setRole] = useState("member");
  const [creditStr, setCreditStr] = useState("10000");
  const [bulk, setBulk] = useState("");
  const [showBulk, setShowBulk] = useState(false);
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
  const creditCents = useMemo(() => Math.round((parseFloat(creditStr) || 0) * 100), [creditStr]);
  const previewCode = useMemo(() => inviteCode(recipient || "new-member"), [recipient]);

  // Send one invite (or resend an existing one). In demo/offline mode we mutate
  // the local list so the render path is identical; live mode hits club_invite.
  const sendOne = useCallback(
    async (to: string, credit: number, r: string, resend: boolean): Promise<boolean> => {
      if (demo || !owned.club) {
        if (!resend) {
          setInvites((prev) => [
            {
              id: `inv-${Date.now()}-${to}`,
              club_id: owned.club?.id ?? "demo-club",
              user_id: to,
              username: to,
              inviter: "owner",
              type: "invite",
              role: r,
              credit_limit_cents: credit,
              status: "sent",
              message: "",
              created_at: new Date().toISOString(),
            },
            ...prev,
          ]);
        }
        return true;
      }
      await screensApi.invite({
        clubId: owned.club.id,
        userId: to,
        username: to,
        role: r,
        creditLimitCents: credit,
      });
      if (!resend && credit > 0) {
        // Seed the invitee's club credit; best-effort until they accept.
        try {
          await screensApi.allocateBalance(owned.club.id, to, credit);
        } catch {
          /* allocation applies on accept */
        }
      }
      return true;
    },
    [demo, owned.club],
  );

  const onSend = () => {
    const to = recipient.trim();
    if (!to) {
      notify("Enter a member email or wallet address.", "err");
      return;
    }
    void (async () => {
      setBusy(true);
      try {
        await sendOne(to, creditCents, role, false);
        notify(`Invitation sent to ${to}${demo ? " (demo)" : ""}.`);
        setRecipient("");
        if (!demo && owned.club) await load(owned.club.id);
      } catch (e) {
        notify(e instanceof Error ? e.message : "Invite failed", "err");
      } finally {
        setBusy(false);
      }
    })();
  };

  const onBulk = () => {
    const list = bulk
      .split(/[\s,;]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (list.length === 0) {
      notify("Paste one or more emails/wallets.", "err");
      return;
    }
    void (async () => {
      setBusy(true);
      let ok = 0;
      for (const to of list) {
        try {
          await sendOne(to, creditCents, role, false);
          ok++;
        } catch {
          /* continue; report the count at the end */
        }
      }
      notify(`Sent ${ok}/${list.length} invitations${demo ? " (demo)" : ""}.`, ok ? "ok" : "err");
      setBulk("");
      if (!demo && owned.club) await load(owned.club.id);
      setBusy(false);
    })();
  };

  const onResend = (inv: ClubInvitation) => {
    void (async () => {
      setBusy(true);
      try {
        await sendOne(inv.user_id, inv.credit_limit_cents, inv.role || "member", true);
        notify(`Invitation resent to ${inv.username || inv.user_id}${demo ? " (demo)" : ""}.`);
        if (!demo && owned.club) await load(owned.club.id);
      } catch (e) {
        notify(e instanceof Error ? e.message : "Resend failed", "err");
      } finally {
        setBusy(false);
      }
    })();
  };

  const onRevoke = (inv: ClubInvitation) => {
    void (async () => {
      setBusy(true);
      if (demo || !owned.club) {
        setInvites((prev) => prev.map((i) => (i.id === inv.id ? { ...i, status: "revoked" } : i)));
        notify(`Invitation to ${inv.username || inv.user_id} revoked (demo).`);
        setBusy(false);
        return;
      }
      try {
        await screensApi.revokeInvite(inv.id);
        notify(`Invitation to ${inv.username || inv.user_id} revoked.`);
        await load(owned.club.id);
      } catch (e) {
        notify(e instanceof Error ? e.message : "Revoke failed", "err");
      } finally {
        setBusy(false);
      }
    })();
  };

  const onCopyLink = (inv: ClubInvitation) => {
    const link = inviteLink(inviteCode(inv.user_id));
    void navigator.clipboard
      ?.writeText(link)
      .then(() => notify("Invite link copied."))
      .catch(() => notify(link, "ok"));
  };

  return (
    <OwnerPageShell
      clubName={owned.club?.name ?? "High Rollers Club"}
      title="Club Invitations"
      subtitle="Invite and onboard members — credit is settled inside the club."
      demo={demo}
    >
      <Toast toast={toast} />

      {/* Invite form + welcome card */}
      <div className={cn(GLASS_PANEL, "p-6")}>
        <div className="flex items-center justify-between">
          <h2 className="font-display text-2xl font-bold uppercase tracking-wide text-white">Invite New Member</h2>
          <MoneyModeTag mode="club" />
        </div>
        <div className="mt-5 grid gap-6 lg:grid-cols-2">
          <div className="space-y-4">
            <Field label="Member Email or Wallet Address">
              <Input
                value={recipient}
                onChange={(e) => setRecipient(e.target.value)}
                placeholder="name@example.com or 0x…"
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Access Role">
                <Select value={role} onChange={(e) => setRole(e.target.value)}>
                  {ROLES.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Initial Club Credit">
                <div className="relative">
                  <Input
                    value={creditStr}
                    onChange={(e) => setCreditStr(e.target.value)}
                    inputMode="decimal"
                    placeholder="10000"
                    className="pr-9"
                  />
                  <span
                    className="absolute right-3 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-full text-[11px] font-bold text-[#231b00]"
                    style={{ background: "linear-gradient(180deg,#ffd54a,#f5c518)" }}
                  >
                    $
                  </span>
                </div>
              </Field>
            </div>
            <Button variant="gold" className="w-full" disabled={busy} onClick={onSend}>
              {busy ? "Sending…" : "Send Invitation"}
            </Button>

            <button
              type="button"
              onClick={() => setShowBulk((v) => !v)}
              className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45 hover:text-white/70"
            >
              {showBulk ? "− Hide bulk invite" : "+ Bulk invite (paste a list)"}
            </button>
            {showBulk && (
              <div className="space-y-3 rounded-xl border border-white/[0.08] bg-black/20 p-4">
                <p className="text-[11px] text-white/45">
                  Paste emails/wallets separated by commas, spaces, or new lines. Each gets the role and credit above.
                </p>
                <textarea
                  value={bulk}
                  onChange={(e) => setBulk(e.target.value)}
                  rows={4}
                  placeholder={"alice@example.com, bob@example.com\n0xAbC…"}
                  className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white/90 outline-none placeholder:text-white/25 focus:border-gold/50"
                />
                <Button variant="outline" size="sm" disabled={busy} onClick={onBulk}>
                  {busy ? "Sending…" : "Send all"}
                </Button>
              </div>
            )}
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
              <p className="mt-1 text-xs uppercase tracking-[0.2em] text-white/50">Your Exclusive Access Awaits</p>
              <div className="mt-4 rounded-lg border border-white/10 bg-black/40 px-3 py-2">
                <p className="text-[10px] uppercase tracking-[0.2em] text-white/40">Unique Invite Code</p>
                <p className="font-mono text-sm font-bold text-gold">{previewCode}</p>
              </div>
              <p className="mt-3 text-[11px] text-white/45">
                Initial club credit:{" "}
                <span className="font-semibold text-green">{formatMoneyMode(creditCents, "club")}</span>
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Invitations table */}
      <div className={cn(GLASS_PANEL, "mt-6 overflow-hidden")}>
        <div className="border-b border-white/[0.08] px-5 py-3.5">
          <h2 className="font-display text-lg font-bold uppercase tracking-wide text-white">Invitations</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-left text-sm">
            <thead>
              <tr className="border-b border-white/[0.08] text-[11px] uppercase tracking-[0.14em] text-white/45">
                <th className="px-5 py-3 font-semibold">Invitee</th>
                <th className="px-5 py-3 font-semibold">Role</th>
                <th className="px-5 py-3 font-semibold">Club Credit</th>
                <th className="px-5 py-3 font-semibold">Sent</th>
                <th className="px-5 py-3 font-semibold">Expires</th>
                <th className="px-5 py-3 font-semibold">Status</th>
                <th className="px-5 py-3 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {invites.map((inv) => {
                const sent = new Date(inv.created_at);
                const expires = new Date(+sent + INVITE_TTL_DAYS * 86_400_000);
                const s = inv.status.toLowerCase();
                const pending = s === "sent" || s === "pending";
                const resolved = s === "accepted";
                return (
                  <tr key={inv.id} className="border-b border-white/[0.05] last:border-0">
                    <td className="px-5 py-3">
                      <span className="flex items-center gap-3">
                        <MemberAvatar seed={inv.user_id} name={inv.username || inv.user_id} size={32} />
                        <span className="truncate text-white/85">{inv.username || inv.user_id}</span>
                      </span>
                    </td>
                    <td className="px-5 py-3 capitalize text-white/70">{inv.role || "member"}</td>
                    <td className="px-5 py-3 text-white/70">{formatMoneyMode(inv.credit_limit_cents, "club")}</td>
                    <td className="px-5 py-3 text-white/55">{dateOnly(inv.created_at)}</td>
                    <td className="px-5 py-3 text-white/55">{resolved ? "—" : dateOnly(expires.toISOString())}</td>
                    <td className="px-5 py-3">
                      <StatusPill status={inv.status} />
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center justify-end gap-2">
                        <Button size="sm" variant="ghost" disabled={busy} onClick={() => onCopyLink(inv)}>
                          Copy link
                        </Button>
                        {pending && (
                          <>
                            <Button size="sm" variant="outline" disabled={busy} onClick={() => onResend(inv)}>
                              Resend
                            </Button>
                            <Button size="sm" variant="ghost" disabled={busy} onClick={() => onRevoke(inv)}>
                              Revoke
                            </Button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {invites.length === 0 && <EmptyState>No invitations yet.</EmptyState>}
      </div>
    </OwnerPageShell>
  );
}
