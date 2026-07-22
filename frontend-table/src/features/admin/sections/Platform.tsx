"use client";

import { useCallback, useEffect, useState } from "react";

import { Button, Field, Input } from "@/features/ui";
import { cn } from "@/features/ui/tokens";

import { adminApi, relTime } from "../adminRpc";
import { Badge, Card, Empty, GoldHeading, Mono, Row, Table, Td, Th } from "../primitives";
import type { PlatformSetting, SystemLock } from "../types";
import type { Notify } from "./shared";

export function Platform({ notify }: { notify: Notify }) {
  const [lock, setLock] = useState<SystemLock | null>(null);
  const [lockMsg, setLockMsg] = useState("");
  const [settings, setSettings] = useState<PlatformSetting[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  // Setting editor
  const [key, setKey] = useState("");
  const [value, setValue] = useState("");

  // Ops
  const [clubId, setClubId] = useState("");
  const [clubReason, setClubReason] = useState("");
  const [matchId, setMatchId] = useState("");
  const [matchReason, setMatchReason] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [l, s] = await Promise.all([adminApi.systemLockGet(), adminApi.settingsGet()]);
      setLock(l);
      setLockMsg(l.message ?? "");
      setSettings(s.settings ?? []);
    } catch (err) {
      notify(err instanceof Error ? err.message : "Failed to load platform state", "err");
    } finally {
      setLoading(false);
    }
  }, [notify]);

  useEffect(() => {
    void load();
  }, [load]);

  const setLockState = (locked: boolean) =>
    void (async () => {
      setBusy("lock");
      try {
        const res = await adminApi.systemLockSet(locked, lockMsg.trim());
        setLock(res);
        notify(locked ? "Platform locked" : "Platform unlocked");
      } catch (err) {
        notify(err instanceof Error ? err.message : "Lock failed", "err");
      } finally {
        setBusy(null);
      }
    })();

  const saveSetting = () =>
    void (async () => {
      if (key.trim() === "") return;
      setBusy("setting");
      try {
        await adminApi.settingsSet(key.trim(), value);
        notify("Setting saved");
        setKey("");
        setValue("");
        await load();
      } catch (err) {
        notify(err instanceof Error ? err.message : "Save failed", "err");
      } finally {
        setBusy(null);
      }
    })();

  const disableClub = () =>
    void (async () => {
      if (clubId.trim() === "") return;
      setBusy("club");
      try {
        await adminApi.clubDisable(clubId.trim(), clubReason.trim());
        notify("Club disabled");
        setClubId("");
        setClubReason("");
      } catch (err) {
        notify(err instanceof Error ? err.message : "Disable failed", "err");
      } finally {
        setBusy(null);
      }
    })();

  const closeTable = () =>
    void (async () => {
      if (matchId.trim() === "") return;
      setBusy("table");
      try {
        await adminApi.tableClose(matchId.trim(), matchReason.trim());
        notify("Close signal sent");
        setMatchId("");
        setMatchReason("");
      } catch (err) {
        notify(err instanceof Error ? err.message : "Close failed", "err");
      } finally {
        setBusy(null);
      }
    })();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <GoldHeading>Platform Controls</GoldHeading>
          <p className="mt-1 text-sm text-neutral-500">
            Maintenance lock, key/value settings, and live club / table interventions.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
          {loading ? "Refreshing…" : "Refresh"}
        </Button>
      </div>

      <Card
        eyebrow="Maintenance"
        title="System lock"
        className={cn(lock?.locked && "border-red-500/30")}
        actions={<Badge tone={lock?.locked ? "red" : "green"}>{lock?.locked ? "locked" : "open"}</Badge>}
      >
        <Field label="Lock message" hint="Shown to players while locked.">
          <Input value={lockMsg} onChange={(e) => setLockMsg(e.target.value)} placeholder="Back at 03:00 UTC" />
        </Field>
        <div className="mt-3 flex gap-2">
          {lock?.locked ? (
            <Button onClick={() => setLockState(false)} disabled={busy === "lock"}>
              Unlock platform
            </Button>
          ) : (
            <Button variant="danger" onClick={() => setLockState(true)} disabled={busy === "lock"}>
              Lock platform
            </Button>
          )}
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card eyebrow="Intervention" title="Disable a club">
          <div className="space-y-3">
            <Field label="Club id">
              <Input value={clubId} onChange={(e) => setClubId(e.target.value)} placeholder="club_…" />
            </Field>
            <Field label="Reason">
              <Input value={clubReason} onChange={(e) => setClubReason(e.target.value)} placeholder="optional" />
            </Field>
            <Button variant="danger" onClick={disableClub} disabled={busy === "club" || clubId.trim() === ""}>
              Disable club
            </Button>
          </div>
        </Card>

        <Card eyebrow="Intervention" title="Close a live table">
          <div className="space-y-3">
            <Field label="Match id">
              <Input value={matchId} onChange={(e) => setMatchId(e.target.value)} placeholder="match id" />
            </Field>
            <Field label="Reason">
              <Input value={matchReason} onChange={(e) => setMatchReason(e.target.value)} placeholder="optional" />
            </Field>
            <Button variant="danger" onClick={closeTable} disabled={busy === "table" || matchId.trim() === ""}>
              Signal close
            </Button>
          </div>
        </Card>
      </div>

      <Card eyebrow="Configuration" title="Platform settings">
        <div className="grid gap-3 lg:grid-cols-[1fr_1.4fr_auto] lg:items-end">
          <Field label="Key">
            <Input value={key} onChange={(e) => setKey(e.target.value)} placeholder="feature.new_lobby" />
          </Field>
          <Field label="Value">
            <Input value={value} onChange={(e) => setValue(e.target.value)} placeholder="on" />
          </Field>
          <Button onClick={saveSetting} disabled={busy === "setting" || key.trim() === ""}>
            Save
          </Button>
        </div>

        <div className="mt-5">
          {settings.length === 0 ? (
            <Empty>{loading ? "Loading…" : "No platform settings yet."}</Empty>
          ) : (
            <Table
              head={
                <>
                  <Th>Key</Th>
                  <Th>Value</Th>
                  <Th>Updated</Th>
                  <Th className="text-right">Edit</Th>
                </>
              }
            >
              {settings.map((s) => (
                <Row key={s.key}>
                  <Td>
                    <Mono className="text-neutral-200">{s.key}</Mono>
                  </Td>
                  <Td className="text-white">{s.value || "—"}</Td>
                  <Td className="text-neutral-500">{relTime(s.updated_at)}</Td>
                  <Td className="text-right">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setKey(s.key);
                        setValue(s.value);
                      }}
                    >
                      Load
                    </Button>
                  </Td>
                </Row>
              ))}
            </Table>
          )}
        </div>
      </Card>
    </div>
  );
}
