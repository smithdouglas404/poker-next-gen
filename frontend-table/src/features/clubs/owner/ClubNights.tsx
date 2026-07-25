"use client";

// Recurring "club night" scheduler (P9) — owner tool. Save a table template
// (blinds, buy-in, seats, variant) with an intended weekday/time, then launch it
// on demand ("Launch now" spins up a real table via club_night_launch_now and
// returns a shareable code). Auto-firing at the scheduled time is a follow-up;
// this is the honest stored-schedule + manual-launch MVP.

import { useCallback, useEffect, useState } from "react";

import { ownerApi } from "./ownerRpc";
import type { ClubSchedule } from "./types";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const usd = (c: number) => `$${(c / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;

export function ClubNights({ clubId, canManage }: { clubId?: string; canManage: boolean }) {
  const [rows, setRows] = useState<ClubSchedule[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  // Create form (dollars in the UI, cents on the wire).
  const [name, setName] = useState("");
  const [sb, setSb] = useState(1);
  const [bb, setBb] = useState(2);
  const [buyIn, setBuyIn] = useState(200);
  const [seats, setSeats] = useState(6);
  const [variant, setVariant] = useState("holdem");
  const [weekday, setWeekday] = useState(5);
  const [time, setTime] = useState("20:00");
  const [creating, setCreating] = useState(false);

  const reload = useCallback(async () => {
    if (!clubId || !canManage) return;
    try {
      const r = await ownerApi.clubScheduleList(clubId);
      setRows(r.schedules ?? []);
    } catch {
      /* non-owner or offline */
    }
  }, [clubId, canManage]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const create = useCallback(async () => {
    if (!clubId || !name.trim()) {
      setMsg("Give the club night a name.");
      return;
    }
    setCreating(true);
    setMsg(null);
    try {
      await ownerApi.clubScheduleCreate({
        club_id: clubId,
        name: name.trim(),
        small_blind: Math.round(sb * 100),
        big_blind: Math.round(bb * 100),
        buy_in: Math.round(buyIn * 100),
        max_seats: seats,
        variant,
        weekday,
        time_of_day: time,
        enabled: true,
      });
      setName("");
      setMsg("Club night saved.");
      await reload();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Could not save.");
    } finally {
      setCreating(false);
    }
  }, [clubId, name, sb, bb, buyIn, seats, variant, weekday, time, reload]);

  const launch = useCallback(async (id: string) => {
    setBusy(id);
    setMsg(null);
    try {
      const r = await ownerApi.clubNightLaunchNow(id);
      setMsg(r.code ? `Table live — join code ${r.code}` : "Table launched.");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Launch failed.");
    } finally {
      setBusy(null);
    }
  }, []);

  if (!canManage) return null;

  const inputCls =
    "w-full rounded-lg border border-white/10 bg-black/40 px-2 py-1.5 text-sm text-white outline-none focus:border-gold/50";

  return (
    <section className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-5">
      <div className="flex items-center justify-between">
        <h3 className="font-display text-lg font-bold uppercase tracking-wide text-white">Club Nights</h3>
        <span className="text-[11px] uppercase tracking-wider text-white/40">{rows.length} saved</span>
      </div>
      <p className="mt-1 text-xs text-white/50">
        Save a recurring table template and launch it on demand. (Auto-start at the scheduled time is
        coming; for now hit “Launch now” when it’s time.)
      </p>
      {msg && <p className="mt-2 text-xs text-gold">{msg}</p>}

      {/* Create form */}
      <div className="mt-4 grid gap-2 rounded-xl border border-white/[0.06] bg-black/20 p-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="text-[11px] text-white/50 lg:col-span-2">
          Name
          <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="Friday Night High Rollers" />
        </label>
        <label className="text-[11px] text-white/50">
          Day
          <select className={inputCls} value={weekday} onChange={(e) => setWeekday(Number(e.target.value))}>
            {DAYS.map((d, i) => (
              <option key={d} value={i}>
                {d}
              </option>
            ))}
          </select>
        </label>
        <label className="text-[11px] text-white/50">
          Time
          <input className={inputCls} type="time" value={time} onChange={(e) => setTime(e.target.value)} />
        </label>
        <label className="text-[11px] text-white/50">
          Small blind ($)
          <input className={inputCls} type="number" value={sb} onChange={(e) => setSb(Number(e.target.value))} />
        </label>
        <label className="text-[11px] text-white/50">
          Big blind ($)
          <input className={inputCls} type="number" value={bb} onChange={(e) => setBb(Number(e.target.value))} />
        </label>
        <label className="text-[11px] text-white/50">
          Buy-in ($)
          <input className={inputCls} type="number" value={buyIn} onChange={(e) => setBuyIn(Number(e.target.value))} />
        </label>
        <label className="text-[11px] text-white/50">
          Seats
          <input className={inputCls} type="number" min={2} max={9} value={seats} onChange={(e) => setSeats(Number(e.target.value))} />
        </label>
        <label className="text-[11px] text-white/50">
          Variant
          <select className={inputCls} value={variant} onChange={(e) => setVariant(e.target.value)}>
            <option value="holdem">Hold&apos;em</option>
            <option value="plo">PLO</option>
          </select>
        </label>
        <button
          type="button"
          onClick={() => void create()}
          disabled={creating}
          className="self-end rounded-lg bg-gold/90 px-3 py-2 text-sm font-bold text-black hover:bg-gold disabled:opacity-40"
        >
          {creating ? "Saving…" : "Save club night"}
        </button>
      </div>

      {/* List */}
      <div className="mt-4 space-y-2">
        {rows.length === 0 ? (
          <p className="rounded-xl border border-white/[0.06] bg-black/20 px-4 py-6 text-center text-sm text-white/40">
            No club nights saved yet.
          </p>
        ) : (
          rows.map((s) => (
            <div
              key={s.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/[0.06] bg-black/25 px-4 py-3"
            >
              <div className="min-w-0">
                <p className="truncate font-semibold text-white">{s.name}</p>
                <p className="text-[11px] text-white/50">
                  {DAYS[s.weekday] ?? "—"} {s.time_of_day} · {usd(s.small_blind)}/{usd(s.big_blind)} ·{" "}
                  {usd(s.buy_in)} buy-in · {s.max_seats}-max · {s.variant === "plo" ? "PLO" : "Hold'em"}
                </p>
              </div>
              <button
                type="button"
                disabled={busy === s.id}
                onClick={() => void launch(s.id)}
                className="rounded-lg border border-green/40 bg-green/10 px-3 py-1.5 text-xs font-bold text-[#bff5d3] hover:bg-green/20 disabled:opacity-40"
              >
                {busy === s.id ? "…" : "Launch now"}
              </button>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
