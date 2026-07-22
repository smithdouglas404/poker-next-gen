"use client";

import { useCallback, useState } from "react";

import { BTN_GOLD, GLASS_PANEL, cn } from "@/features/ui/tokens";

import { DEMO_WALLETS, securityApi } from "./securityRpc";

type Notify = (msg: string, kind?: "ok" | "err") => void;

const GOLD_BTN =
  "shrink-0 rounded-lg px-4 py-2.5 text-xs font-bold uppercase tracking-wide disabled:opacity-40";

const FIELD =
  "w-full rounded-lg border border-gold/25 bg-black/40 px-3.5 py-2.5 text-sm text-white placeholder:text-neutral-600 outline-none transition focus:border-gold/60 focus:ring-2 focus:ring-gold/15";

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/20 p-4">
      <p className="font-display text-sm font-semibold uppercase tracking-wide text-gold">{title}</p>
      <div className="mt-3">{children}</div>
    </div>
  );
}

export function AccountRecoveryCenter({ notify }: { notify: Notify }) {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [backupCode, setBackupCode] = useState("");
  const [busy, setBusy] = useState<null | "wallet" | "email" | "verify" | "backup" | "link">(null);

  const requestEmail = useCallback(
    async (addr: string, tag: "wallet" | "email" | "link") => {
      const value = addr.trim().toLowerCase();
      if (!value) {
        notify("Enter the email on your account first.", "err");
        return;
      }
      setBusy(tag);
      try {
        await securityApi.recoveryRequestEmail(value);
        // Server response is uniform (no account enumeration): always "sent".
        notify(`If an account exists for ${value}, a recovery link is on its way.`);
        setEmail(value);
        setSent(true);
      } catch (e) {
        notify(e instanceof Error ? e.message : "Could not send recovery link", "err");
      } finally {
        setBusy(null);
      }
    },
    [notify],
  );

  const verifyEmail = useCallback(async () => {
    if (!email || code.trim().length < 4 || newPassword.length < 8) {
      notify("Enter the emailed code and a new password (8+ chars).", "err");
      return;
    }
    setBusy("verify");
    try {
      await securityApi.recoveryVerifyEmail({
        email: email.trim().toLowerCase(),
        code: code.trim(),
        new_password: newPassword,
      });
      notify("Password reset — you can sign in with your new password.");
      setSent(false);
      setCode("");
      setNewPassword("");
    } catch (e) {
      notify(e instanceof Error ? e.message : "Invalid or expired code", "err");
    } finally {
      setBusy(null);
    }
  }, [email, code, newPassword, notify]);

  const submitBackup = useCallback(async () => {
    if (!email.trim() || !backupCode.trim() || newPassword.length < 8) {
      notify("Enter your email, a backup code, and a new password (8+ chars).", "err");
      return;
    }
    setBusy("backup");
    try {
      await securityApi.recoveryBackupCode({
        email: email.trim().toLowerCase(),
        backup_code: backupCode.trim(),
        new_password: newPassword,
      });
      notify("Recovered via backup code — 2FA was reset, re-enrol from Security.");
      setBackupCode("");
      setNewPassword("");
    } catch (e) {
      notify(e instanceof Error ? e.message : "Invalid backup code", "err");
    } finally {
      setBusy(null);
    }
  }, [email, backupCode, newPassword, notify]);

  return (
    <div className={cn(GLASS_PANEL, "mx-auto w-full max-w-2xl p-6 sm:p-8")}>
      <h2 className="font-display text-center text-2xl font-bold uppercase tracking-wide text-gold">
        Account Recovery Center
      </h2>
      <p className="mt-2 text-center text-sm text-neutral-400">
        Comprehensive account recovery and security. Regain access with a linked wallet, an email
        link, or your one-time backup codes.
      </p>

      <div className="mt-6 space-y-4">
        {/* Recover via Linked Crypto Wallet */}
        <Section title="Recover via Linked Crypto Wallet">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              {DEMO_WALLETS.map((w) => (
                <span
                  key={w.id}
                  title={`${w.name} · ${w.short} · ${w.balance}`}
                  className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-black/40 text-lg"
                >
                  {w.emoji}
                </span>
              ))}
              <span className="text-xs text-neutral-500">
                {DEMO_WALLETS.map((w) => w.name).join(" · ")}
              </span>
            </div>
            <button
              type="button"
              onClick={() => void requestEmail(`${DEMO_WALLETS[0].id}@wallet.recover`, "wallet")}
              disabled={busy !== null}
              className={cn(BTN_GOLD, GOLD_BTN, "ml-auto")}
            >
              {busy === "wallet" ? "Verifying…" : "Verify Wallet"}
            </button>
          </div>
          <p className="mt-2 text-[11px] text-neutral-600">
            Verifying a linked wallet sends a recovery link to the email on file for that account.
          </p>
        </Section>

        {/* Email Recovery */}
        <Section title="Email Recovery">
          <div className="flex flex-col gap-2.5 sm:flex-row">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Enter your email address"
              className={FIELD}
            />
            <button
              type="button"
              onClick={() => void requestEmail(email, "email")}
              disabled={busy !== null}
              className={cn(BTN_GOLD, GOLD_BTN)}
            >
              {busy === "email" ? "Sending…" : "Send Email Link"}
            </button>
          </div>

          {sent && (
            <div className="mt-3 space-y-2.5 rounded-lg border border-gold/20 bg-black/30 p-3">
              <p className="text-[11px] uppercase tracking-[0.2em] text-gold/80">
                Enter the code from your email
              </p>
              <div className="flex flex-col gap-2.5 sm:flex-row">
                <input
                  value={code}
                  onChange={(e) => setCode(e.target.value.trim())}
                  placeholder="Recovery code"
                  className={FIELD}
                />
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="New password (8+ chars)"
                  autoComplete="new-password"
                  className={FIELD}
                />
              </div>
              <button
                type="button"
                onClick={() => void verifyEmail()}
                disabled={busy !== null}
                className={cn(BTN_GOLD, GOLD_BTN, "w-full sm:w-auto")}
              >
                {busy === "verify" ? "Resetting…" : "Verify & Reset Password"}
              </button>
            </div>
          )}
        </Section>

        {/* Use Backup Codes */}
        <Section title="Use Backup Codes">
          <div className="space-y-2.5">
            <div className="flex flex-col gap-2.5 sm:flex-row">
              <input
                value={backupCode}
                onChange={(e) => setBackupCode(e.target.value.trim())}
                placeholder="Backup Code"
                className={FIELD}
              />
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="New password (8+ chars)"
                autoComplete="new-password"
                className={FIELD}
              />
              <button
                type="button"
                onClick={() => void submitBackup()}
                disabled={busy !== null}
                className={cn(BTN_GOLD, GOLD_BTN)}
              >
                {busy === "backup" ? "Working…" : "Use Backup Code"}
              </button>
            </div>
            <p className="text-[11px] text-neutral-600">
              Uses the email above. Recovering with a backup code resets 2FA — you will need to
              re-enrol your authenticator afterwards.
            </p>
          </div>
        </Section>
      </div>

      {/* Primary send-recovery CTA */}
      <button
        type="button"
        onClick={() => void requestEmail(email, "link")}
        disabled={busy !== null}
        className={cn(
          BTN_GOLD,
          "mt-6 w-full rounded-xl py-3.5 text-base uppercase tracking-wide disabled:opacity-40",
        )}
      >
        {busy === "link" ? "Sending…" : "Send Recovery Link"}
      </button>
    </div>
  );
}
