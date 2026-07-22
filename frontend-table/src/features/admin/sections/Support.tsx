"use client";

import { useCallback, useEffect, useState } from "react";

import { Button, Input, Select } from "@/features/ui";
import { GLASS_PANEL, cn } from "@/features/ui/tokens";

import { adminApi, relTime } from "../adminRpc";
import { Badge, Card, Empty, GoldHeading, Mono, statusTone } from "../primitives";
import type { SupportTicket } from "../types";
import type { Notify } from "./shared";

export function Support({ notify }: { notify: Notify }) {
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);
  const [reply, setReply] = useState("");
  const [replyStatus, setReplyStatus] = useState("pending");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminApi.supportList(status);
      setTickets(res.tickets ?? []);
    } catch (err) {
      notify(err instanceof Error ? err.message : "Failed to load tickets", "err");
    } finally {
      setLoading(false);
    }
  }, [status, notify]);

  useEffect(() => {
    void load();
  }, [load]);

  const respond = (id: string) =>
    void (async () => {
      if (reply.trim() === "") return;
      setBusy(true);
      try {
        await adminApi.supportRespond(id, reply.trim(), replyStatus);
        notify("Reply sent");
        setReply("");
        await load();
      } catch (err) {
        notify(err instanceof Error ? err.message : "Reply failed", "err");
      } finally {
        setBusy(false);
      }
    })();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <GoldHeading>Support Tickets</GoldHeading>
          <p className="mt-1 text-sm text-neutral-500">Respond to player tickets and set their status.</p>
        </div>
        <Select value={status} onChange={(e) => setStatus(e.target.value)} className="w-40">
          <option value="">All</option>
          <option value="open">Open</option>
          <option value="pending">Pending</option>
          <option value="resolved">Resolved</option>
        </Select>
      </div>

      <Card eyebrow="Inbox" title={`Tickets · ${tickets.length}`}>
        {tickets.length === 0 ? (
          <Empty>{loading ? "Loading…" : "No tickets."}</Empty>
        ) : (
          <div className="space-y-3">
            {tickets.map((t) => {
              const open = openId === t.id;
              const last = t.messages[t.messages.length - 1];
              return (
                <div key={t.id} className={cn(GLASS_PANEL, "overflow-hidden")}>
                  <button
                    type="button"
                    onClick={() => {
                      setOpenId(open ? null : t.id);
                      setReply("");
                      setReplyStatus(t.status || "pending");
                    }}
                    className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition hover:bg-white/[0.02]"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="truncate font-medium text-white">{t.subject}</span>
                        {t.priority && <Badge tone={statusTone(t.priority)}>{t.priority}</Badge>}
                      </div>
                      <p className="mt-0.5 truncate text-xs text-neutral-500">
                        {t.email || <Mono>{t.user_id}</Mono>} · {t.category || "general"} ·{" "}
                        {relTime(t.updated_at)}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <Badge tone={statusTone(t.status)}>{t.status || "open"}</Badge>
                      <span className="text-neutral-500">{open ? "▲" : "▼"}</span>
                    </div>
                  </button>

                  {open && (
                    <div className="border-t border-white/[0.06] px-4 py-4">
                      <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
                        {t.messages.map((m, i) => (
                          <div
                            key={i}
                            className={cn(
                              "rounded-xl border px-3 py-2 text-sm",
                              m.role === "admin"
                                ? "border-cyan/20 bg-cyan/[0.05] text-cyan/90"
                                : "border-white/[0.06] bg-white/[0.02] text-neutral-200",
                            )}
                          >
                            <div className="mb-0.5 flex items-center justify-between">
                              <span className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500">
                                {m.role}
                              </span>
                              <span className="text-[10px] text-neutral-600">{relTime(m.at)}</span>
                            </div>
                            {m.body}
                          </div>
                        ))}
                        {t.messages.length === 0 && last === undefined && (
                          <p className="text-xs text-neutral-600">No messages.</p>
                        )}
                      </div>

                      <div className="mt-3 space-y-2 border-t border-white/[0.06] pt-3">
                        <Input
                          value={reply}
                          onChange={(e) => setReply(e.target.value)}
                          placeholder="Type an admin response…"
                          onKeyDown={(e) => {
                            if (e.key === "Enter") respond(t.id);
                          }}
                        />
                        <div className="flex items-center justify-end gap-2">
                          <Select
                            value={replyStatus}
                            onChange={(e) => setReplyStatus(e.target.value)}
                            className="w-36"
                          >
                            <option value="pending">Set pending</option>
                            <option value="open">Set open</option>
                            <option value="resolved">Set resolved</option>
                          </Select>
                          <Button onClick={() => respond(t.id)} disabled={busy || reply.trim() === ""}>
                            Send reply
                          </Button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
