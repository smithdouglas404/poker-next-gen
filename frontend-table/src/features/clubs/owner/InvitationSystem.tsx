"use client";

// Screen 4 — Club Member Invitation System. Invite form (recipient, initial
// game credit, access role) + a formal certificate preview, and a Sent Invites
// table with a Resend action. Wired to club_invite (create + resend).

import { useCallback, useEffect, useState } from "react";

import { Button, Field, Input, Select } from "@/features/ui";
import { GLASS_PANEL, cn } from "@/features/ui/tokens";

import { OwnerPageShell, Toast, useToast } from "./OwnerPageShell";
import { useOwnedClub } from "./useOwnedClub";
import {
  DEMO_INVITES,
  dateTime,
  screensApi,
  usd,
  type ClubInvitation,
} from "./screensRpc";
import { EmptyState, MemberAvatar } from "./ui";

const ROLES = [
  { value: "member", label: "Member" },
  { value: "vip", label: "VIP" },
  { value: "admin", label: "Admin" },
];

function StatusPill({ status }: { status: string }) {
  const s = (status || "pending").toLowerCase();
  const map: Record<string, string> = {
    pending: "bg-[#f5c518] text-[#231b00]",
    sent: "bg-[#f5c518] text-[#231b00]",
    accepted: "bg-[#22c55e] text-white",
    expired: "bg-[#e01e2b] text-white",
    declined: "bg-[#e01e2b] text-white",
  };
  const label = s === "sent" ? "Pending" : s.charAt(0).toUpperCase() + s.slice(1);
  return (
    <span className={cn("inline-flex rounded-md px-3 py-1 text-xs font-bold", map[s] ?? map.pending)}>
      {label}
    </span>
  );
}

export function InvitationSystem() {
  const owned = useOwnedClub();
  const { toast, notify } = useToast();
  const [recipient, setRecipient] = useState("");
  const [creditStr, setCreditStr] = useState("");
  const [role, setRole] = useState("member");
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

  const sendInvite = (to: string, credit: number, r: string, resend: boolean) => {
    void (async () => {
      setBusy(true);
      if (demo || !owned.club) {
        if (!resend) {
          setInvites((prev) => [
            {
              id: `inv-${Date.now()}`,
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
        notify(resend ? `Invitation resent to ${to} (demo).` : `Invitation sent to ${to} (demo).`);
        setBusy(false);
        return;
      }
      try {
        await screensApi.invite({
          clubId: owned.club.id,
          userId: to,
          username: to,
          role: r,
          creditLimitCents: credit,
        });
        notify(resend ? `Invitation resent to ${to}.` : `Invitation sent to ${to}.`);
        await load(owned.club.id);
      } catch (e) {
        notify(e instanceof Error ? e.message : "Invite failed", "err");
      } finally {
        setBusy(false);
      }
    })();
  };

  const onSend = () => {
    const to = recipient.trim();
    if (!to) {
      notify("Enter a recipient email or wallet.", "err");
      return;
    }
    const credit = Math.round((parseFloat(creditStr) || 0) * 100);
    sendInvite(to, credit, role, false);
    setRecipient("");
    setCreditStr("");
  };

  return (
    <OwnerPageShell
      clubName={owned.club?.name ?? "High Rollers Club"}
      title="Club Member Invitation System"
      subtitle="Issue formal club invitations and track their status."
      demo={demo}
    >
      <Toast toast={toast} />

      {/* Invite form + certificate */}
      <div className={cn(GLASS_PANEL, "p-6")}>
        <div className="grid gap-8 lg:grid-cols-2">
          <div>
            <h2 className="font-display text-2xl font-bold uppercase tracking-wide text-white">
              Invite New Member
            </h2>
            <div className="mt-5 space-y-4">
              <Field label="Recipient Email / Wallet">
                <Input
                  value={recipient}
                  onChange={(e) => setRecipient(e.target.value)}
                  placeholder="name@example.com or 0x…"
                />
              </Field>
              <Field label="Initial Game Credit">
                <div className="relative">
                  <Input
                    value={creditStr}
                    onChange={(e) => setCreditStr(e.target.value)}
                    inputMode="decimal"
                    placeholder="10000"
                    className="pr-10"
                  />
                  <span
                    className="absolute right-3 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-full text-[11px] font-bold text-[#231b00]"
                    style={{ background: "linear-gradient(180deg,#ffd54a,#f5c518)" }}
                  >
                    $
                  </span>
                </div>
              </Field>
              <Field label="Access Role">
                <Select value={role} onChange={(e) => setRole(e.target.value)}>
                  {ROLES.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Button variant="gold" className="w-full" disabled={busy} onClick={onSend}>
                {busy ? "Sending…" : "Send Invitation"}
              </Button>
            </div>
          </div>

          {/* Certificate preview */}
          <div className="flex items-center justify-center">
            <div
              className="w-full max-w-sm rounded-lg p-1"
              style={{ background: "linear-gradient(135deg,#c9a227,#f3e2ad,#c9a227)" }}
            >
              <div className="rounded-md bg-[#faf7ef] p-6 text-center text-[#2b2410]">
                <div className="mx-auto mb-3 text-2xl text-[#b8901f]">♠</div>
                <p className="font-display text-lg font-bold uppercase tracking-[0.15em] text-[#7a5f14]">
                  {owned.club?.name ?? "High Rollers"}
                </p>
                <p className="text-[10px] uppercase tracking-[0.35em] text-[#a98b32]">Invitation</p>
                <div className="my-4 h-px bg-[#d8c98f]" />
                <p className="text-xs italic leading-relaxed text-[#5b4d24]">
                  You are cordially invited to join our exclusive members-only poker club. Present
                  your unique code to claim your seat and initial game credit.
                </p>
                <div className="mt-5 flex items-center justify-between text-[10px] uppercase tracking-[0.2em] text-[#8a7328]">
                  <span>Authorized</span>
                  <span>{new Date().getFullYear()}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Sent invites */}
      <div className={cn(GLASS_PANEL, "mt-6 overflow-hidden")}>
        <div className="border-b border-white/[0.08] px-5 py-3.5">
          <h2 className="font-display text-lg font-bold uppercase tracking-wide text-white">
            Sent Invites
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead>
              <tr className="border-b border-white/[0.08] text-[11px] uppercase tracking-[0.14em] text-white/45">
                <th className="px-5 py-3 font-semibold">Recipient</th>
                <th className="px-5 py-3 font-semibold">Role</th>
                <th className="px-5 py-3 font-semibold">Sent Date</th>
                <th className="px-5 py-3 font-semibold">Status</th>
                <th className="px-5 py-3 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {invites.map((inv) => {
                const pending = ["sent", "pending", "expired", "declined"].includes(
                  inv.status.toLowerCase(),
                );
                return (
                  <tr key={inv.id} className="border-b border-white/[0.05] last:border-0">
                    <td className="px-5 py-3">
                      <span className="flex items-center gap-3">
                        <MemberAvatar seed={inv.user_id} name={inv.username || inv.user_id} size={32} />
                        <span className="truncate text-white/85">{inv.username || inv.user_id}</span>
                      </span>
                    </td>
                    <td className="px-5 py-3 capitalize text-white/70">{inv.role || "member"}</td>
                    <td className="px-5 py-3 text-white/55">{dateTime(inv.created_at)}</td>
                    <td className="px-5 py-3">
                      <StatusPill status={inv.status} />
                    </td>
                    <td className="px-5 py-3 text-right">
                      {pending ? (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busy}
                          onClick={() =>
                            sendInvite(inv.user_id, inv.credit_limit_cents, inv.role || "member", true)
                          }
                        >
                          Resend
                        </Button>
                      ) : (
                        <span className="text-xs text-white/30">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {invites.length === 0 && <EmptyState>No invitations sent yet.</EmptyState>}
      </div>
    </OwnerPageShell>
  );
}
