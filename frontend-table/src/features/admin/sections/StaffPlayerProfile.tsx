"use client";

// Comprehensive staff player profile (_16): identity + performance + limits +
// transactions + moderation, assembled from admin_player_profile /
// admin_ledger_search and mutated through admin_user_adjust_wallet (Grant Bonus),
// admin_player_set_limit (Edit Limit — writes the ENFORCED rg deposit limit), and
// admin_player_flag (Flag). Every control binds to a real admin RPC.

import { useCallback, useEffect, useState } from "react";

import { Button, Field, Input } from "@/features/ui";

import { adminApi, money, type LedgerEntry, type PlayerProfileResponse } from "../adminRpc";
import { Badge, Card, Empty, Mono } from "../primitives";
import type { UserRow } from "../types";
import type { Notify } from "./shared";

function pct(n: number, d: number): string {
  return d > 0 ? `${Math.round((n * 100) / d)}%` : "—";
}

export function StaffPlayerProfile({ user, notify }: { user: UserRow; notify: Notify }) {
  const [data, setData] = useState<PlayerProfileResponse | null>(null);
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [bonus, setBonus] = useState("");
  const [limit, setLimit] = useState("");
  const [flagReason, setFlagReason] = useState("");

  const load = useCallback(async () => {
    try {
      const [p, l] = await Promise.allSettled([
        adminApi.playerProfile(user.user_id),
        adminApi.playerLedger(user.user_id, 15),
      ]);
      if (p.status === "fulfilled") {
        setData(p.value);
        setLimit(p.value.limits.deposit_daily_cents ? String(p.value.limits.deposit_daily_cents / 100) : "");
        setFlagReason(p.value.flag.reason ?? "");
      }
      if (l.status === "fulfilled") setLedger(l.value.entries ?? []);
    } catch (e) {
      notify(e instanceof Error ? e.message : "Failed to load profile", "err");
    }
  }, [user.user_id, notify]);

  useEffect(() => {
    void load();
  }, [load]);

  const grantBonus = () =>
    void (async () => {
      const cents = Math.round(parseFloat(bonus) * 100);
      if (!Number.isFinite(cents) || cents <= 0) {
        notify("Enter a positive bonus amount.", "err");
        return;
      }
      setBusy("bonus");
      try {
        const res = await adminApi.adjustWallet(user.user_id, cents, "staff bonus grant");
        notify(`Bonus granted — balance now ${money(res.balance_cents)}`);
        setBonus("");
        await load();
      } catch (e) {
        notify(e instanceof Error ? e.message : "Grant failed", "err");
      } finally {
        setBusy(null);
      }
    })();

  const saveLimit = () =>
    void (async () => {
      const cents = limit.trim() === "" ? 0 : Math.round(parseFloat(limit) * 100);
      if (!Number.isFinite(cents) || cents < 0) {
        notify("Enter a limit in dollars (blank or 0 = no limit).", "err");
        return;
      }
      setBusy("limit");
      try {
        await adminApi.playerSetLimit(user.user_id, cents);
        notify(cents === 0 ? "Daily deposit limit cleared." : `Daily deposit limit set to ${money(cents)}.`);
        await load();
      } catch (e) {
        notify(e instanceof Error ? e.message : "Limit update failed", "err");
      } finally {
        setBusy(null);
      }
    })();

  const toggleFlag = (next: boolean) =>
    void (async () => {
      setBusy("flag");
      try {
        await adminApi.playerFlag(user.user_id, next, flagReason.trim());
        notify(next ? "Player flagged for review." : "Flag cleared.");
        await load();
      } catch (e) {
        notify(e instanceof Error ? e.message : "Flag update failed", "err");
      } finally {
        setBusy(null);
      }
    })();

  const s = data?.stats;
  const flagged = data?.flag.flagged ?? false;

  return (
    <div className="space-y-6">
      {/* Identity header */}
      <Card eyebrow="Player Profile" title={user.username || user.user_id}>
        <div className="flex flex-wrap items-center gap-4">
          <div className="grid h-16 w-16 place-items-center rounded-2xl bg-gradient-to-br from-[#262d38] to-[#0c0e13] font-display text-2xl font-bold text-gold">
            {(user.username || "?").slice(0, 1).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <Mono>{user.email || user.user_id}</Mono>
            <div className="mt-1 flex flex-wrap gap-2">
              <Badge tone={user.banned ? "red" : "green"}>{user.banned ? "banned" : "active"}</Badge>
              {flagged && <Badge tone="red">flagged</Badge>}
              <Badge tone="gold">{money(user.balance_cents)} balance</Badge>
              {data?.loyalty?.hrp_total != null && <Badge tone="neutral">{data.loyalty.hrp_total} HRP</Badge>}
            </div>
          </div>
        </div>
      </Card>

      {/* Performance */}
      <Card eyebrow="Performance" title="Lifetime play">
        {s ? (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Stat label="Hands" value={String(s.hands)} />
            <Stat label="Win rate" value={pct(s.wins, s.hands)} />
            <Stat label="VPIP" value={pct(s.vpip_hands, s.hands)} />
            <Stat label="PFR" value={pct(s.pfr_hands, s.hands)} />
            <Stat label="Showdown win" value={pct(s.showdown_wins, s.showdowns)} />
            <Stat label="Net" value={money(s.net_cents)} tone={s.net_cents >= 0 ? "text-green" : "text-brand"} />
            <Stat label="Biggest pot" value={money(s.biggest_pot)} />
            <Stat label="HRP" value={String(data?.loyalty?.hrp_total ?? 0)} />
          </div>
        ) : (
          <Empty>No hands recorded yet.</Empty>
        )}
      </Card>

      {/* Actions: Grant Bonus / Edit Limit / Flag */}
      <div className="grid gap-6 lg:grid-cols-3">
        <Card eyebrow="Wallet" title="Grant Bonus">
          <Field label="Amount (USD)">
            <Input value={bonus} onChange={(e) => setBonus(e.target.value)} placeholder="25.00" inputMode="decimal" />
          </Field>
          <Button className="mt-3 w-full" disabled={busy === "bonus"} onClick={grantBonus}>
            {busy === "bonus" ? "Granting…" : "Grant bonus"}
          </Button>
        </Card>

        <Card eyebrow="Responsible gaming" title="Edit Limit">
          <Field label="Daily deposit limit (USD, blank = none)">
            <Input value={limit} onChange={(e) => setLimit(e.target.value)} placeholder="no limit" inputMode="decimal" />
          </Field>
          <Button variant="outline" className="mt-3 w-full" disabled={busy === "limit"} onClick={saveLimit}>
            {busy === "limit" ? "Saving…" : "Save limit"}
          </Button>
          <p className="mt-2 text-[11px] text-neutral-500">Enforced at every deposit, same as the player&apos;s own control.</p>
        </Card>

        <Card eyebrow="Moderation" title="Flag">
          <Field label="Reason">
            <Input value={flagReason} onChange={(e) => setFlagReason(e.target.value)} placeholder="e.g. collusion review" />
          </Field>
          <Button
            variant={flagged ? "outline" : "gold"}
            className="mt-3 w-full"
            disabled={busy === "flag"}
            onClick={() => toggleFlag(!flagged)}
          >
            {busy === "flag" ? "…" : flagged ? "Clear flag" : "Flag player"}
          </Button>
          {flagged && data?.flag.flagged_by && (
            <p className="mt-2 text-[11px] text-neutral-500">Flagged by {data.flag.flagged_by}</p>
          )}
        </Card>
      </div>

      {/* Transactions */}
      <Card eyebrow="Transactions" title="Recent wallet activity">
        {ledger.length === 0 ? (
          <Empty>No transactions.</Empty>
        ) : (
          <div className="divide-y divide-white/[0.06]">
            {ledger.map((e, i) => (
              <div key={i} className="flex items-center justify-between py-2 text-sm">
                <div className="min-w-0">
                  <p className="truncate text-neutral-200">{e.reason || "—"}</p>
                  <p className="text-[11px] text-neutral-500">{e.created_at?.slice(0, 19).replace("T", " ")}</p>
                </div>
                <span className={(e.amount_cents ?? 0) >= 0 ? "font-display text-green" : "font-display text-brand"}>
                  {(e.amount_cents ?? 0) >= 0 ? "+" : ""}
                  {money(e.amount_cents ?? 0)}
                </span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-black/30 p-3">
      <p className="text-[10px] uppercase tracking-wider text-neutral-500">{label}</p>
      <p className={`font-display text-lg font-bold ${tone ?? "text-white"}`}>{value}</p>
    </div>
  );
}
