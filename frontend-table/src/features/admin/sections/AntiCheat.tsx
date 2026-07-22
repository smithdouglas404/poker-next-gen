"use client";

import { useCallback, useEffect, useState } from "react";

import { Button, Field, Input, Select } from "@/features/ui";
import { cn } from "@/features/ui/tokens";

import { adminApi, relTime } from "../adminRpc";
import { Badge, Card, Empty, GoldHeading, Mono, Row, Table, Td, Th, statusTone } from "../primitives";
import type { AntibotScore, CollusionFlag, HitlItem, IPRule } from "../types";
import type { Notify } from "./shared";

type Tab = "antibot" | "collusion" | "hitl" | "ip";

const TABS: { id: Tab; label: string }[] = [
  { id: "antibot", label: "Bot Detection" },
  { id: "collusion", label: "Collusion" },
  { id: "hitl", label: "HITL Queue" },
  { id: "ip", label: "IP Rules" },
];

export function AntiCheat({ notify }: { notify: Notify }) {
  const [tab, setTab] = useState<Tab>("antibot");

  return (
    <div className="space-y-6">
      <div>
        <GoldHeading>Anti-Cheat & Integrity</GoldHeading>
        <p className="mt-1 text-sm text-neutral-500">
          Bot scoring, collusion review, human-in-the-loop decisions, and network access rules.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={cn(
              "rounded-full border px-4 py-1.5 text-xs font-semibold uppercase tracking-wider transition",
              tab === t.id
                ? "border-cyan/30 bg-cyan/[0.08] text-cyan"
                : "border-white/10 text-neutral-400 hover:bg-white/[0.03] hover:text-white",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "antibot" && <Antibot notify={notify} />}
      {tab === "collusion" && <Collusion notify={notify} />}
      {tab === "hitl" && <Hitl notify={notify} />}
      {tab === "ip" && <IPRules notify={notify} />}
    </div>
  );
}

function Antibot({ notify }: { notify: Notify }) {
  const [rows, setRows] = useState<AntibotScore[]>([]);
  const [flaggedOnly, setFlaggedOnly] = useState(true);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      if (flaggedOnly) {
        const res = await adminApi.antibotFlags();
        setRows(res.flagged ?? []);
      } else {
        const res = await adminApi.antibotScan();
        setRows(res.scores ?? []);
      }
    } catch (err) {
      notify(err instanceof Error ? err.message : "Failed to load bot scores", "err");
    } finally {
      setLoading(false);
    }
  }, [flaggedOnly, notify]);

  useEffect(() => {
    void load();
  }, [load]);

  const ban = (row: AntibotScore) =>
    void (async () => {
      setBusy(row.user_id);
      try {
        await adminApi.antibotBan(row.user_id, `bot score ${row.score.toFixed(2)}`);
        notify(`Banned ${row.user_id}`);
        await load();
      } catch (err) {
        notify(err instanceof Error ? err.message : "Ban failed", "err");
      } finally {
        setBusy(null);
      }
    })();

  return (
    <Card
      eyebrow="Behavioural scoring"
      title={flaggedOnly ? "Flagged accounts" : "All scored accounts"}
      actions={
        <>
          <Button
            size="sm"
            variant={flaggedOnly ? "gold" : "outline"}
            onClick={() => setFlaggedOnly((v) => !v)}
          >
            {flaggedOnly ? "Flagged only" : "All scores"}
          </Button>
          <Button size="sm" variant="outline" onClick={() => void load()} disabled={loading}>
            Rescan
          </Button>
        </>
      }
    >
      {rows.length === 0 ? (
        <Empty>{loading ? "Scanning…" : "No accounts in this band."}</Empty>
      ) : (
        <Table
          head={
            <>
              <Th>User</Th>
              <Th>Risk</Th>
              <Th>Score</Th>
              <Th>Sample</Th>
              <Th>Seen</Th>
              <Th className="text-right">Action</Th>
            </>
          }
        >
          {rows.map((r) => (
            <Row key={r.id || r.user_id}>
              <Td>
                <Mono>{r.user_id}</Mono>
              </Td>
              <Td>
                <Badge tone={statusTone(r.risk)}>{r.risk}</Badge>
              </Td>
              <Td className="font-display text-cyan">{r.score.toFixed(2)}</Td>
              <Td className="text-neutral-400">{r.sample_size}</Td>
              <Td className="text-neutral-500">{relTime(r.updated_at)}</Td>
              <Td className="text-right">
                {r.banned ? (
                  <Badge tone="red">banned</Badge>
                ) : (
                  <Button size="sm" variant="danger" onClick={() => ban(r)} disabled={busy === r.user_id}>
                    Ban bot
                  </Button>
                )}
              </Td>
            </Row>
          ))}
        </Table>
      )}
    </Card>
  );
}

function Collusion({ notify }: { notify: Notify }) {
  const [rows, setRows] = useState<CollusionFlag[]>([]);
  const [status, setStatus] = useState("pending");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminApi.collusionList(status);
      setRows(res.flags ?? []);
    } catch (err) {
      notify(err instanceof Error ? err.message : "Failed to load collusion flags", "err");
    } finally {
      setLoading(false);
    }
  }, [status, notify]);

  useEffect(() => {
    void load();
  }, [load]);

  const review = (flag: CollusionFlag, decision: "confirmed" | "dismissed") =>
    void (async () => {
      setBusy(flag.id);
      try {
        await adminApi.collusionReview(flag.id, decision, "");
        notify(`Flag ${decision}`);
        await load();
      } catch (err) {
        notify(err instanceof Error ? err.message : "Review failed", "err");
      } finally {
        setBusy(null);
      }
    })();

  return (
    <Card
      eyebrow="Pattern review"
      title="Collusion flags"
      actions={
        <Select value={status} onChange={(e) => setStatus(e.target.value)} className="w-40">
          <option value="pending">Pending</option>
          <option value="confirmed">Confirmed</option>
          <option value="dismissed">Dismissed</option>
          <option value="">All</option>
        </Select>
      }
    >
      {rows.length === 0 ? (
        <Empty>{loading ? "Loading…" : "No flags in this status."}</Empty>
      ) : (
        <Table
          head={
            <>
              <Th>Pair</Th>
              <Th>Reason</Th>
              <Th>Score</Th>
              <Th>Status</Th>
              <Th className="text-right">Review</Th>
            </>
          }
        >
          {rows.map((f) => (
            <Row key={f.id}>
              <Td>
                <Mono>{f.user_a}</Mono>
                <span className="mx-1 text-neutral-600">×</span>
                <Mono>{f.user_b}</Mono>
                {f.match_id && <p className="text-[11px] text-neutral-600">match {f.match_id}</p>}
              </Td>
              <Td className="max-w-[220px] text-neutral-300">{f.reason}</Td>
              <Td className="font-display text-red-300">{f.score.toFixed(2)}</Td>
              <Td>
                <Badge tone={statusTone(f.status)}>{f.status}</Badge>
              </Td>
              <Td className="text-right">
                {f.status === "pending" ? (
                  <div className="inline-flex gap-2">
                    <Button size="sm" variant="danger" onClick={() => review(f, "confirmed")} disabled={busy === f.id}>
                      Confirm
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => review(f, "dismissed")} disabled={busy === f.id}>
                      Dismiss
                    </Button>
                  </div>
                ) : (
                  <span className="text-xs text-neutral-600">{f.reviewed_by ? "reviewed" : "—"}</span>
                )}
              </Td>
            </Row>
          ))}
        </Table>
      )}
    </Card>
  );
}

function Hitl({ notify }: { notify: Notify }) {
  const [rows, setRows] = useState<HitlItem[]>([]);
  const [status, setStatus] = useState("pending");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminApi.hitlList(status);
      setRows(res.queue ?? []);
    } catch (err) {
      notify(err instanceof Error ? err.message : "Failed to load HITL queue", "err");
    } finally {
      setLoading(false);
    }
  }, [status, notify]);

  useEffect(() => {
    void load();
  }, [load]);

  const review = (item: HitlItem, decision: "approved" | "rejected") =>
    void (async () => {
      setBusy(item.id);
      try {
        await adminApi.hitlReview(item.id, decision, "");
        notify(`Item ${decision}`);
        await load();
      } catch (err) {
        notify(err instanceof Error ? err.message : "Review failed", "err");
      } finally {
        setBusy(null);
      }
    })();

  return (
    <Card
      eyebrow="Human-in-the-loop"
      title="Manual review queue"
      actions={
        <Select value={status} onChange={(e) => setStatus(e.target.value)} className="w-40">
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
          <option value="">All</option>
        </Select>
      }
    >
      {rows.length === 0 ? (
        <Empty>{loading ? "Loading…" : "Queue is clear."}</Empty>
      ) : (
        <Table
          head={
            <>
              <Th>Item</Th>
              <Th>Subject</Th>
              <Th>Status</Th>
              <Th>Created</Th>
              <Th className="text-right">Review</Th>
            </>
          }
        >
          {rows.map((i) => (
            <Row key={i.id}>
              <Td>
                <Badge tone="purple">{i.kind}</Badge>
                <p className="mt-1">
                  <Mono>{i.id}</Mono>
                </p>
              </Td>
              <Td>
                <Mono>{i.subject_user_id || "—"}</Mono>
              </Td>
              <Td>
                <Badge tone={statusTone(i.status)}>{i.status}</Badge>
              </Td>
              <Td className="text-neutral-500">{relTime(i.created_at)}</Td>
              <Td className="text-right">
                {i.status === "pending" ? (
                  <div className="inline-flex gap-2">
                    <Button size="sm" onClick={() => review(i, "approved")} disabled={busy === i.id}>
                      Approve
                    </Button>
                    <Button size="sm" variant="danger" onClick={() => review(i, "rejected")} disabled={busy === i.id}>
                      Reject
                    </Button>
                  </div>
                ) : (
                  <span className="text-xs text-neutral-600">{i.note || "reviewed"}</span>
                )}
              </Td>
            </Row>
          ))}
        </Table>
      )}
    </Card>
  );
}

function IPRules({ notify }: { notify: Notify }) {
  const [rows, setRows] = useState<IPRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [cidr, setCidr] = useState("");
  const [rule, setRule] = useState<"allow" | "deny">("deny");
  const [reason, setReason] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminApi.ipRuleList();
      setRows(res.rules ?? []);
    } catch (err) {
      notify(err instanceof Error ? err.message : "Failed to load IP rules", "err");
    } finally {
      setLoading(false);
    }
  }, [notify]);

  useEffect(() => {
    void load();
  }, [load]);

  const add = () =>
    void (async () => {
      if (cidr.trim() === "") return;
      setBusy("add");
      try {
        await adminApi.ipRuleAdd(cidr.trim(), rule, reason.trim());
        notify("Rule added");
        setCidr("");
        setReason("");
        await load();
      } catch (err) {
        notify(err instanceof Error ? err.message : "Add failed", "err");
      } finally {
        setBusy(null);
      }
    })();

  const remove = (id: string) =>
    void (async () => {
      setBusy(id);
      try {
        await adminApi.ipRuleDelete(id);
        notify("Rule removed");
        await load();
      } catch (err) {
        notify(err instanceof Error ? err.message : "Delete failed", "err");
      } finally {
        setBusy(null);
      }
    })();

  return (
    <div className="space-y-6">
      <Card eyebrow="Access control" title="Add rule">
        <div className="grid gap-3 lg:grid-cols-[1.4fr_0.7fr_1.2fr_auto] lg:items-end">
          <Field label="CIDR / IP">
            <Input value={cidr} onChange={(e) => setCidr(e.target.value)} placeholder="203.0.113.0/24" />
          </Field>
          <Field label="Rule">
            <Select value={rule} onChange={(e) => setRule(e.target.value as "allow" | "deny")}>
              <option value="deny">Deny</option>
              <option value="allow">Allow</option>
            </Select>
          </Field>
          <Field label="Reason">
            <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="optional" />
          </Field>
          <Button onClick={add} disabled={busy === "add" || cidr.trim() === ""}>
            Add
          </Button>
        </div>
      </Card>

      <Card eyebrow="Active" title={`Rules · ${rows.length}`}>
        {rows.length === 0 ? (
          <Empty>{loading ? "Loading…" : "No IP rules configured."}</Empty>
        ) : (
          <Table
            head={
              <>
                <Th>CIDR</Th>
                <Th>Rule</Th>
                <Th>Reason</Th>
                <Th>Added</Th>
                <Th className="text-right">Remove</Th>
              </>
            }
          >
            {rows.map((r) => (
              <Row key={r.id}>
                <Td>
                  <Mono>{r.cidr}</Mono>
                </Td>
                <Td>
                  <Badge tone={r.rule === "allow" ? "green" : "red"}>{r.rule}</Badge>
                </Td>
                <Td className="text-neutral-400">{r.reason || "—"}</Td>
                <Td className="text-neutral-500">{relTime(r.created_at)}</Td>
                <Td className="text-right">
                  <Button size="sm" variant="danger" onClick={() => remove(r.id)} disabled={busy === r.id}>
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
