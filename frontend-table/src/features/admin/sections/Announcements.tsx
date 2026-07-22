"use client";

import { useCallback, useEffect, useState } from "react";

import { Button, Field, Input, Select } from "@/features/ui";

import { adminApi, relTime } from "../adminRpc";
import { Badge, Card, Empty, GoldHeading, Row, Table, Td, Th, statusTone } from "../primitives";
import type { Announcement } from "../types";
import type { Notify } from "./shared";

export function Announcements({ notify }: { notify: Notify }) {
  const [rows, setRows] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [severity, setSeverity] = useState("info");
  const [audience, setAudience] = useState("all");
  const [duration, setDuration] = useState("24");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminApi.announcementList(true);
      setRows(res.announcements ?? []);
    } catch (err) {
      notify(err instanceof Error ? err.message : "Failed to load announcements", "err");
    } finally {
      setLoading(false);
    }
  }, [notify]);

  useEffect(() => {
    void load();
  }, [load]);

  const create = () =>
    void (async () => {
      if (title.trim() === "") {
        notify("Title required", "err");
        return;
      }
      setBusy("create");
      try {
        await adminApi.announcementCreate({
          title: title.trim(),
          body: body.trim(),
          severity,
          audience,
          duration_hours: Math.max(0, parseInt(duration, 10) || 0),
        });
        notify("Announcement published");
        setTitle("");
        setBody("");
        await load();
      } catch (err) {
        notify(err instanceof Error ? err.message : "Publish failed", "err");
      } finally {
        setBusy(null);
      }
    })();

  const remove = (id: string) =>
    void (async () => {
      setBusy(id);
      try {
        await adminApi.announcementDelete(id);
        notify("Removed");
        await load();
      } catch (err) {
        notify(err instanceof Error ? err.message : "Delete failed", "err");
      } finally {
        setBusy(null);
      }
    })();

  return (
    <div className="space-y-6">
      <div>
        <GoldHeading>Announcements</GoldHeading>
        <p className="mt-1 text-sm text-neutral-500">
          Publish a platform MOTD — it also pushes a breaking-news notification to open clients.
        </p>
      </div>

      <Card eyebrow="Compose" title="New announcement">
        <div className="space-y-3">
          <Field label="Title">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Scheduled maintenance" />
          </Field>
          <Field label="Body">
            <Input value={body} onChange={(e) => setBody(e.target.value)} placeholder="Details players will read" />
          </Field>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Severity">
              <Select value={severity} onChange={(e) => setSeverity(e.target.value)}>
                <option value="info">Info</option>
                <option value="warning">Warning</option>
                <option value="critical">Critical</option>
              </Select>
            </Field>
            <Field label="Audience">
              <Select value={audience} onChange={(e) => setAudience(e.target.value)}>
                <option value="all">All</option>
                <option value="members">Members</option>
              </Select>
            </Field>
            <Field label="Duration (hours)" hint="0 = no expiry">
              <Input value={duration} onChange={(e) => setDuration(e.target.value)} inputMode="numeric" />
            </Field>
          </div>
          <div className="flex justify-end">
            <Button onClick={create} disabled={busy === "create" || title.trim() === ""}>
              Publish
            </Button>
          </div>
        </div>
      </Card>

      <Card eyebrow="Live & scheduled" title={`Announcements · ${rows.length}`}>
        {rows.length === 0 ? (
          <Empty>{loading ? "Loading…" : "No announcements."}</Empty>
        ) : (
          <Table
            head={
              <>
                <Th>Title</Th>
                <Th>Severity</Th>
                <Th>Audience</Th>
                <Th>Starts</Th>
                <Th className="text-right">Remove</Th>
              </>
            }
          >
            {rows.map((a) => (
              <Row key={a.id}>
                <Td>
                  <p className="font-medium text-white">{a.title}</p>
                  {a.body && <p className="max-w-[320px] truncate text-xs text-neutral-500">{a.body}</p>}
                </Td>
                <Td>
                  <Badge tone={statusTone(a.severity)}>{a.severity || "info"}</Badge>
                </Td>
                <Td className="text-neutral-400">{a.audience || "all"}</Td>
                <Td className="text-neutral-500">{relTime(a.starts_at || a.created_at)}</Td>
                <Td className="text-right">
                  <Button size="sm" variant="danger" onClick={() => remove(a.id)} disabled={busy === a.id}>
                    Delete
                  </Button>
                </Td>
              </Row>
            ))}
          </Table>
        )}
      </Card>
    </div>
  );
}
