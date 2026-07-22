"use client";

import { useState } from "react";

import { Button, Field, Input } from "@/features/ui";
import { cn } from "@/features/ui/tokens";
import { Modal, StatusLine } from "./Modal";
import { landingApi } from "./landingRpc";

type Method = "email" | "backup";

export function RecoveryDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [method, setMethod] = useState<Method>("email");
  const [sent, setSent] = useState(false);
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [backupCode, setBackupCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ kind: "ok" | "err"; msg: string } | null>(null);

  const requestEmail = () =>
    void (async () => {
      setStatus(null);
      if (!email.trim()) {
        setStatus({ kind: "err", msg: "Enter the email on your account." });
        return;
      }
      setBusy(true);
      try {
        await landingApi.recoveryRequestEmail(email.trim());
        setSent(true);
        setStatus({
          kind: "ok",
          msg: "If that email matches an account, a recovery code is on its way. Enter it below.",
        });
      } catch (e) {
        setStatus({ kind: "err", msg: e instanceof Error ? e.message : "Request failed." });
      } finally {
        setBusy(false);
      }
    })();

  const verifyEmail = () =>
    void (async () => {
      setStatus(null);
      if (!code.trim() || newPassword.length < 8) {
        setStatus({ kind: "err", msg: "Enter the code and a new password (min 8 characters)." });
        return;
      }
      setBusy(true);
      try {
        await landingApi.recoveryVerifyEmail({
          email: email.trim(),
          code: code.trim(),
          new_password: newPassword,
        });
        setStatus({ kind: "ok", msg: "Password reset. You can now sign in." });
      } catch (e) {
        setStatus({ kind: "err", msg: e instanceof Error ? e.message : "Invalid or expired code." });
      } finally {
        setBusy(false);
      }
    })();

  const useBackup = () =>
    void (async () => {
      setStatus(null);
      if (!email.trim() || !backupCode.trim() || newPassword.length < 8) {
        setStatus({ kind: "err", msg: "Email, backup code and a new password (min 8) are required." });
        return;
      }
      setBusy(true);
      try {
        await landingApi.recoveryBackupCode({
          email: email.trim(),
          backup_code: backupCode.trim(),
          new_password: newPassword,
        });
        setStatus({
          kind: "ok",
          msg: "Recovered. Two-factor was reset — re-enrol it after signing in.",
        });
      } catch (e) {
        setStatus({ kind: "err", msg: e instanceof Error ? e.message : "Invalid backup code." });
      } finally {
        setBusy(false);
      }
    })();

  const tab = (m: Method, label: string) => (
    <button
      type="button"
      onClick={() => {
        setMethod(m);
        setStatus(null);
      }}
      className={cn(
        "flex-1 rounded-lg px-3 py-2 text-xs font-semibold uppercase tracking-wide transition",
        method === m
          ? "bg-white/[0.06] text-white ring-1 ring-cyan/40"
          : "text-neutral-400 hover:text-white",
      )}
    >
      {label}
    </button>
  );

  return (
    <Modal open={open} onClose={onClose} eyebrow="Account recovery" title="Recover access">
      <div className="mb-5 flex gap-1 rounded-xl border border-white/10 bg-black/30 p-1">
        {tab("email", "Email code")}
        {tab("backup", "Backup code")}
      </div>

      {method === "email" ? (
        <div className="space-y-4">
          <Field label="Account email">
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
            />
          </Field>
          {!sent ? (
            <Button onClick={requestEmail} disabled={busy} className="w-full">
              {busy ? "Sending…" : "Send recovery code"}
            </Button>
          ) : (
            <>
              <Field label="Recovery code">
                <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="6-digit code" />
              </Field>
              <Field label="New password" hint="Minimum 8 characters.">
                <Input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="••••••••"
                />
              </Field>
              <div className="flex gap-2">
                <Button variant="outline" onClick={requestEmail} disabled={busy} className="flex-1">
                  Resend
                </Button>
                <Button onClick={verifyEmail} disabled={busy} className="flex-1">
                  {busy ? "Verifying…" : "Reset password"}
                </Button>
              </div>
            </>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-xs text-neutral-500">
            Lost your authenticator? Use one of your saved two-factor backup codes. This resets your
            password and disables 2FA so you can re-enrol.
          </p>
          <Field label="Account email">
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
            />
          </Field>
          <Field label="Backup code">
            <Input
              value={backupCode}
              onChange={(e) => setBackupCode(e.target.value)}
              placeholder="xxxx-xxxx"
            />
          </Field>
          <Field label="New password" hint="Minimum 8 characters.">
            <Input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="••••••••"
            />
          </Field>
          <Button onClick={useBackup} disabled={busy} className="w-full">
            {busy ? "Recovering…" : "Recover with backup code"}
          </Button>
        </div>
      )}

      {status && (
        <div className="mt-4">
          <StatusLine kind={status.kind}>{status.msg}</StatusLine>
        </div>
      )}
    </Modal>
  );
}
