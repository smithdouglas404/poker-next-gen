"use client";

// Club-chip settlement — the owner's "who pays whom" sheet.
//
// Club chips are a LOAN the club extends; the global wallet is the player's own
// deposited money. So a club game does not balance itself when the last hand
// ends: every player who drew club chips is up or down against what they were
// advanced, and somebody has to pay somebody before the books close.
//
// Without this panel the three settlement RPCs are unreachable and the owner
// has no way to sign anything off — so it is not optional polish, it is the
// other half of the feature.
//
// Wired to table_settlement_list / table_settlement_confirm.

import { useCallback, useEffect, useState } from "react";

import { ownerApi, relTime } from "./ownerRpc";
import type { Settlement } from "./types";

const money = (cents: number) =>
  `$${(Math.abs(cents) / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function TableSettlements({ clubId, canManage }: { clubId?: string; canManage: boolean }) {
  const [rows, setRows] = useState<Settlement[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!clubId || !canManage) return;
    try {
      const r = await ownerApi.tableSettlementList(clubId);
      setRows(r.settlements ?? []);
    } catch {
      /* non-owner or offline */
    }
  }, [clubId, canManage]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const confirm = useCallback(
    async (s: Settlement) => {
      if (!clubId) return;
      setBusy(s.match_id);
      setMsg(null);
      try {
        await ownerApi.tableSettlementConfirm(clubId, s.match_id);
        setMsg("Books confirmed.");
        await reload();
      } catch (e) {
        // Most likely another operator signed off first — the backend reports
        // that as a conflict rather than silently re-stamping the row.
        setMsg(e instanceof Error ? e.message : "Could not confirm those books.");
        await reload();
      } finally {
        setBusy(null);
      }
    },
    [clubId, reload],
  );

  if (!canManage) return null;

  return (
    <div className="rounded-2xl border border-white/10 bg-surface p-5">
      <div className="flex items-baseline justify-between">
        <h3 className="font-display text-lg font-bold uppercase tracking-wider">Table settlements</h3>
        <span className="text-[11px] uppercase tracking-[0.2em] text-muted">
          {rows.length} to confirm
        </span>
      </div>
      <p className="mt-1 text-sm text-muted">
        Club chips are a loan. These games are finished but not signed off — check who owes what,
        then confirm the books balance.
      </p>

      {msg && <p className="mt-3 text-sm text-gold">{msg}</p>}

      {rows.length === 0 ? (
        <p className="mt-4 text-sm text-muted">Nothing waiting to be settled.</p>
      ) : (
        <ul className="mt-4 flex flex-col gap-3">
          {rows.map((s) => {
            // In a closed table the two sides are equal — chips lost by one
            // player were won by another. A gap means the table leaked, and the
            // owner must see that rather than one netted number hiding it.
            const balanced = s.total_owed_to_club === s.total_owed_to_players;
            return (
              <li key={s.id} className="rounded-xl border border-white/10 bg-surface-2 p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="font-mono text-sm text-foreground">{s.match_id}</p>
                  <span className="text-[11px] uppercase tracking-[0.15em] text-muted">
                    ended {relTime(s.created_at)}
                  </span>
                </div>

                {/* A real column grid, not wrapped prose. The figures are
                    tabular-nums and right-aligned so advanced/back/net stack
                    into scannable columns — an operator compares DOWN the
                    money, not across one player at a time. */}
                <div className="mt-3 overflow-x-auto">
                  <div className="min-w-[34rem]">
                    <div className="grid grid-cols-[1fr_7rem_7rem_11rem] gap-x-4 border-b border-white/10 pb-1.5 text-[11px] uppercase tracking-[0.15em] text-muted">
                      <span>Player</span>
                      <span className="text-right">Advanced</span>
                      <span className="text-right">Back</span>
                      <span className="text-right">Settlement</span>
                    </div>
                    {s.lines.map((l) => (
                      <div
                        key={l.user_id}
                        className="grid grid-cols-[1fr_7rem_7rem_11rem] items-baseline gap-x-4 border-b border-white/[0.04] py-2 text-sm last:border-0"
                      >
                        <span className="truncate text-foreground">
                          {l.username || l.user_id.slice(0, 8)}
                          <span className="ml-2 text-[11px] uppercase tracking-[0.15em] text-muted">
                            {l.is_member ? "member" : "guest"}
                          </span>
                        </span>
                        <span className="text-right tabular-nums text-muted">{money(l.loaned_minor)}</span>
                        <span className="text-right tabular-nums text-muted">{money(l.returned_minor)}</span>
                        <span className="text-right tabular-nums font-semibold">
                          {l.net_minor < 0 ? (
                            <span className="text-brand">owes club {money(l.net_minor)}</span>
                          ) : l.net_minor > 0 ? (
                            <span className="text-green">club owes {money(l.net_minor)}</span>
                          ) : (
                            <span className="text-muted">square</span>
                          )}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-3">
                  <p className="text-sm text-muted">
                    Owed to club <span className="font-semibold text-brand">{money(s.total_owed_to_club)}</span>
                    <span className="mx-2 text-white/20">|</span>
                    Owed to players <span className="font-semibold text-green">{money(s.total_owed_to_players)}</span>
                    {!balanced && (
                      <span className="ml-2 font-semibold uppercase tracking-[0.15em] text-brand">
                        ⚠ does not balance
                      </span>
                    )}
                  </p>
                  <button
                    type="button"
                    disabled={busy === s.match_id}
                    onClick={() => void confirm(s)}
                    className="rounded-lg bg-green px-3 py-1.5 text-sm font-bold text-black transition hover:brightness-110 disabled:opacity-50"
                  >
                    Confirm books balanced
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
