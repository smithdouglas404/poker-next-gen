"use client";

// Player-facing support.
//
// The whole ticket system shipped — create, list, get, reply, and an admin
// Support queue that reads it — and no screen anywhere let a player open a
// ticket. Operators had an inbox with no way for mail to arrive.
//
// This is the missing half: file a ticket, see your tickets, read the thread,
// reply. Every control binds to an RPC that already existed.

import { useCallback, useEffect, useMemo, useState } from "react";

import { callSessionRpc } from "@/lib/nakama/sessionRpc";
import { Button, Field, Input, Select } from "@/features/ui";
import { BTN_GOLD, GLASS_PANEL, HEADING_LG, HEADING_SM, cn } from "@/features/ui/tokens";

interface TicketMessage {
  author: string;
  role: string;
  body: string;
  at: string;
}
interface Ticket {
  id: string;
  subject: string;
  category?: string;
  priority?: string;
  status: string;
  created_at: string;
  messages?: TicketMessage[];
}

const CATEGORIES = [
  { value: "account", label: "Account & login" },
  { value: "payments", label: "Deposits & withdrawals" },
  { value: "gameplay", label: "Gameplay or a hand" },
  { value: "club", label: "Clubs & tables" },
  { value: "report", label: "Report a player" },
  { value: "other", label: "Something else" },
];

const PRIORITIES = [
  { value: "normal", label: "Normal" },
  { value: "high", label: "Urgent — money or account access" },
];

function relTime(iso?: string): string {
  if (!iso) return "";
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "";
  const mins = Math.max(0, Math.round((Date.now() - t) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

function statusTone(status: string): string {
  switch (status) {
    case "open":
      return "text-gold";
    case "resolved":
    case "closed":
      return "text-green";
    default:
      return "text-neutral-400";
  }
}

export default function SupportPage() {
  const [tickets, setTickets] = useState<Ticket[] | null>(null);
  const [unreachable, setUnreachable] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [thread, setThread] = useState<Ticket | null>(null);

  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [category, setCategory] = useState("account");
  const [priority, setPriority] = useState("normal");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [reply, setReply] = useState("");

  const load = useCallback(async () => {
    try {
      const res = (await callSessionRpc("support_ticket_list", {})) as { tickets?: Ticket[] };
      setTickets(res?.tickets ?? []);
      setUnreachable(false);
    } catch {
      // "No tickets" and "couldn't reach support" mean opposite things to someone
      // waiting on a reply about their money.
      setTickets([]);
      setUnreachable(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const openThread = useCallback((id: string) => {
    setOpenId(id);
    setThread(null);
    void (async () => {
      try {
        const res = (await callSessionRpc("support_ticket_get", { id })) as { ticket?: Ticket };
        setThread(res?.ticket ?? null);
      } catch {
        setThread(null);
      }
    })();
  }, []);

  const submit = useCallback(() => {
    if (!subject.trim() || !body.trim()) return;
    void (async () => {
      setBusy(true);
      setError(null);
      try {
        await callSessionRpc("support_ticket_create", {
          subject: subject.trim(),
          body: body.trim(),
          category,
          priority,
        });
        setNotice("Ticket submitted. You'll get a reply here.");
        setSubject("");
        setBody("");
        await load();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not submit the ticket");
      } finally {
        setBusy(false);
      }
    })();
  }, [subject, body, category, priority, load]);

  const sendReply = useCallback(() => {
    if (!openId || !reply.trim()) return;
    void (async () => {
      setBusy(true);
      try {
        await callSessionRpc("support_ticket_reply", { id: openId, body: reply.trim() });
        setReply("");
        openThread(openId);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not send the reply");
      } finally {
        setBusy(false);
      }
    })();
  }, [openId, reply, openThread]);

  const openTickets = useMemo(
    () => (tickets ?? []).filter((t) => t.status !== "closed" && t.status !== "resolved"),
    [tickets],
  );
  const pastTickets = useMemo(
    () => (tickets ?? []).filter((t) => t.status === "closed" || t.status === "resolved"),
    [tickets],
  );

  return (
    <div className="min-h-screen bg-background font-body text-foreground">
      <header className="border-b border-white/[0.06] px-6 py-8">
        <div className="mx-auto max-w-5xl">
          <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-muted">Help</p>
          <h1 className={cn(HEADING_LG, "mt-1 text-3xl")}>Support</h1>
          <p className="mt-1 text-sm text-neutral-400">
            Open a ticket and follow the conversation here.
          </p>
        </div>
      </header>

      <main className="mx-auto grid max-w-5xl gap-8 px-6 py-10 lg:grid-cols-[1fr_1fr]">
        {/* New ticket */}
        <section className={cn(GLASS_PANEL, "p-5")}>
          <p className={cn(HEADING_SM, "text-gold/80")}>New Ticket</p>

          <div className="mt-4 space-y-4">
            <Field label="Subject">
              <Input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Short summary"
                maxLength={120}
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Category">
                <Select value={category} onChange={(e) => setCategory(e.target.value)}>
                  {CATEGORIES.map((c) => (
                    <option key={c.value} value={c.value} className="bg-[#262d38]">
                      {c.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Priority">
                <Select value={priority} onChange={(e) => setPriority(e.target.value)}>
                  {PRIORITIES.map((p) => (
                    <option key={p.value} value={p.value} className="bg-[#262d38]">
                      {p.label}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <Field label="What happened?" hint="Include table or hand details if it's about a game.">
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={6}
                className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-white/90 outline-none placeholder:text-white/25 focus:border-gold/50"
                placeholder="Describe the problem…"
              />
            </Field>

            {error && <p className="text-[12px] font-semibold text-brand">{error}</p>}
            {notice && <p className="text-[12px] font-semibold text-green">{notice}</p>}

            <button
              type="button"
              disabled={busy || !subject.trim() || !body.trim()}
              onClick={submit}
              className={cn(
                BTN_GOLD,
                "w-full rounded-xl px-5 py-3 text-sm uppercase tracking-wide disabled:cursor-not-allowed disabled:opacity-40",
              )}
            >
              {busy ? "Submitting…" : "Submit ticket"}
            </button>
          </div>
        </section>

        {/* Your tickets */}
        <section className="space-y-4">
          <div className={cn(GLASS_PANEL, "p-5")}>
            <p className={cn(HEADING_SM, "text-gold/80")}>Your Tickets</p>

            {unreachable && (
              <p className="mt-3 text-[12px] text-neutral-400">
                Couldn&apos;t reach support. Any tickets you&apos;ve opened aren&apos;t shown —
                this doesn&apos;t mean they were lost.
              </p>
            )}
            {tickets === null ? (
              <p className="mt-3 text-sm text-neutral-500">Loading…</p>
            ) : tickets.length === 0 && !unreachable ? (
              <p className="mt-3 text-sm text-neutral-500">You haven&apos;t opened any tickets.</p>
            ) : (
              <div className="mt-3 space-y-2">
                {[...openTickets, ...pastTickets].map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => openThread(t.id)}
                    className={cn(
                      "w-full rounded-xl border px-4 py-3 text-left transition",
                      openId === t.id
                        ? "border-gold/50 bg-gold/[0.06]"
                        : "border-white/10 bg-white/[0.02] hover:border-white/25",
                    )}
                  >
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="truncate text-sm font-semibold text-white">{t.subject}</span>
                      <span className={cn("shrink-0 text-[11px] uppercase tracking-wider", statusTone(t.status))}>
                        {t.status}
                      </span>
                    </div>
                    <p className="mt-0.5 text-[11px] text-neutral-500">{relTime(t.created_at)}</p>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Thread */}
          {openId && (
            <div className={cn(GLASS_PANEL, "p-5")}>
              <p className={cn(HEADING_SM, "text-gold/80")}>Conversation</p>
              {thread === null ? (
                <p className="mt-3 text-sm text-neutral-500">Loading the thread…</p>
              ) : (
                <>
                  <div className="mt-3 space-y-3">
                    {(thread.messages ?? []).map((m, i) => (
                      <div
                        key={`${m.at}-${i}`}
                        className={cn(
                          "rounded-xl border px-4 py-3",
                          m.role === "user"
                            ? "border-white/10 bg-white/[0.02]"
                            : "border-gold/25 bg-gold/[0.05]",
                        )}
                      >
                        <p className="text-[10px] uppercase tracking-[0.18em] text-neutral-500">
                          {m.role === "user" ? "You" : "Support"} · {relTime(m.at)}
                        </p>
                        <p className="mt-1 whitespace-pre-wrap text-[13px] leading-snug text-neutral-200">
                          {m.body}
                        </p>
                      </div>
                    ))}
                  </div>
                  {thread.status !== "closed" && (
                    <div className="mt-4 flex gap-2">
                      <Input
                        value={reply}
                        onChange={(e) => setReply(e.target.value)}
                        placeholder="Add a reply…"
                      />
                      <Button
                        size="sm"
                        variant="gold"
                        disabled={busy || !reply.trim()}
                        onClick={sendReply}
                      >
                        Send
                      </Button>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
