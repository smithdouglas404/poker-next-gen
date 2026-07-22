"use client";

import { useCallback, useEffect, useState } from "react";

import { Button, Field, Input, Select } from "@/features/ui";
import { GLASS_PANEL, cn } from "@/features/ui/tokens";

import { clubApi, money } from "../clubRpc";
import { CardHeader, EmptyState } from "../components";
import type { ClubEvent } from "../types";

export function Games({
  clubId,
  isConfigurer,
  toast,
}: {
  clubId: string;
  isConfigurer: boolean;
  toast: (msg: string, kind?: "ok" | "err") => void;
}) {
  const [events, setEvents] = useState<ClubEvent[]>([]);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    name: "",
    scheduled_at: "",
    small_blind: 2,
    big_blind: 4,
    variant: "NLH",
    format: "6-max",
  });

  const load = useCallback(async () => {
    try {
      const e = await clubApi.events(clubId);
      setEvents(e.events ?? []);
    } catch {
      setEvents([]);
    }
  }, [clubId]);

  useEffect(() => {
    void load();
  }, [load]);

  const create = () =>
    void (async () => {
      if (form.name.trim() === "" || form.scheduled_at === "") {
        toast("Name and time are required.", "err");
        return;
      }
      setBusy(true);
      try {
        await clubApi.createEvent({
          club_id: clubId,
          name: form.name.trim(),
          scheduled_at: new Date(form.scheduled_at).toISOString(),
          small_blind: Math.round(form.small_blind * 100),
          big_blind: Math.round(form.big_blind * 100),
          variant: form.variant,
          format: form.format,
        });
        toast("Private game scheduled.");
        setForm((f) => ({ ...f, name: "", scheduled_at: "" }));
        await load();
      } catch (e) {
        toast(e instanceof Error ? e.message : "Could not schedule", "err");
      } finally {
        setBusy(false);
      }
    })();

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
      <div className={cn(GLASS_PANEL, "p-5")}>
        <CardHeader>Upcoming Private Games</CardHeader>
        {events.length === 0 ? (
          <EmptyState>No games on the calendar. Schedule one to get started.</EmptyState>
        ) : (
          <div className="space-y-3">
            {events.map((ev) => {
              const when = new Date(ev.scheduled_at);
              return (
                <div
                  key={ev.id}
                  className="flex items-center justify-between rounded-xl border border-white/[0.07] bg-white/[0.025] px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-white">{ev.name}</p>
                    <p className="text-[12px] text-white/55">
                      {money(ev.small_blind)}/{money(ev.big_blind)} {ev.variant || "NLH"}
                      {ev.format ? ` · ${ev.format}` : ""}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-[13px] font-semibold text-green">
                      {when.toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                    </p>
                    <p className="text-[11px] text-white/45">
                      {when.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {isConfigurer ? (
        <div className={cn(GLASS_PANEL, "h-fit p-5")}>
          <CardHeader>Schedule a Game</CardHeader>
          <div className="space-y-3">
            <Field label="Game name">
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Friday Night High Stakes"
              />
            </Field>
            <Field label="Date & time">
              <Input
                type="datetime-local"
                value={form.scheduled_at}
                onChange={(e) => setForm({ ...form, scheduled_at: e.target.value })}
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Small blind ($)">
                <Input
                  type="number"
                  min={0}
                  step={0.5}
                  value={form.small_blind}
                  onChange={(e) => setForm({ ...form, small_blind: Number(e.target.value) })}
                />
              </Field>
              <Field label="Big blind ($)">
                <Input
                  type="number"
                  min={0}
                  step={0.5}
                  value={form.big_blind}
                  onChange={(e) => setForm({ ...form, big_blind: Number(e.target.value) })}
                />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Variant">
                <Select value={form.variant} onChange={(e) => setForm({ ...form, variant: e.target.value })}>
                  <option value="NLH">No-Limit Hold&apos;em</option>
                  <option value="PLO">Pot-Limit Omaha</option>
                  <option value="PLO5">5-Card PLO</option>
                </Select>
              </Field>
              <Field label="Format">
                <Select value={form.format} onChange={(e) => setForm({ ...form, format: e.target.value })}>
                  <option value="6-max">6-max</option>
                  <option value="9-max">9-max</option>
                  <option value="heads-up">Heads-up</option>
                  <option value="sng">Sit &amp; Go</option>
                </Select>
              </Field>
            </div>
            <Button onClick={create} disabled={busy} className="w-full">
              {busy ? "Scheduling…" : "Schedule Game"}
            </Button>
          </div>
        </div>
      ) : (
        <div className={cn(GLASS_PANEL, "h-fit p-5 text-sm text-neutral-500")}>
          Only club owners and managers can schedule private games.
        </div>
      )}
    </div>
  );
}
