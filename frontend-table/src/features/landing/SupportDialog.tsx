"use client";

import { useState } from "react";

import { Button, Field, Input, Select } from "@/features/ui";
import { Modal, StatusLine } from "./Modal";
import { landingApi } from "./landingRpc";

const CATEGORIES = [
  { value: "general", label: "General question" },
  { value: "account", label: "Account & login" },
  { value: "payments", label: "Deposits & withdrawals" },
  { value: "fairness", label: "Fairness & verification" },
  { value: "clubs", label: "Clubs & tournaments" },
  { value: "bug", label: "Report a bug" },
];

export function SupportDialog({
  open,
  onClose,
  supportEmail,
}: {
  open: boolean;
  onClose: () => void;
  supportEmail?: string;
}) {
  const [email, setEmail] = useState("");
  const [category, setCategory] = useState("general");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ kind: "ok" | "err"; msg: string } | null>(null);

  const reset = () => {
    setSubject("");
    setBody("");
  };

  const submit = () =>
    void (async () => {
      setStatus(null);
      if (!email.trim() || !subject.trim() || !body.trim()) {
        setStatus({ kind: "err", msg: "Email, subject and message are all required." });
        return;
      }
      setBusy(true);
      try {
        const res = await landingApi.supportContact({
          email: email.trim(),
          subject: subject.trim(),
          body: body.trim(),
          category,
        });
        setStatus({ kind: "ok", msg: `Ticket #${res.id} opened. We'll reply by email.` });
        reset();
      } catch (e) {
        setStatus({ kind: "err", msg: e instanceof Error ? e.message : "Could not send message." });
      } finally {
        setBusy(false);
      }
    })();

  return (
    <Modal open={open} onClose={onClose} eyebrow="We're here" title="Contact support" wide>
      <p className="-mt-2 mb-4 text-sm text-neutral-400">
        Open a ticket and our team replies by email
        {supportEmail ? (
          <>
            {" "}
            — or write us directly at{" "}
            <a href={`mailto:${supportEmail}`} className="text-brand hover:underline">
              {supportEmail}
            </a>
          </>
        ) : null}
        .
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Your email">
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
          />
        </Field>
        <Field label="Category">
          <Select value={category} onChange={(e) => setCategory(e.target.value)}>
            {CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Field label="Subject" className="mt-4">
        <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="How can we help?" />
      </Field>
      <Field label="Message" className="mt-4">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={5}
          placeholder="Tell us what's going on…"
          className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-2.5 text-sm text-white outline-none transition placeholder:text-neutral-600 focus:border-cyan/40 focus:ring-2 focus:ring-cyan/10"
        />
      </Field>
      {status && (
        <div className="mt-4">
          <StatusLine kind={status.kind}>{status.msg}</StatusLine>
        </div>
      )}
      <Button onClick={submit} disabled={busy} className="mt-5 w-full">
        {busy ? "Sending…" : "Send message"}
      </Button>
    </Modal>
  );
}
