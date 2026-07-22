"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { BTN_GOLD, GLASS_PANEL, cn } from "@/features/ui/tokens";

import { QrCode } from "./QrCode";
import { demoTwoFactorSetup, securityApi, type TwoFactorSetup } from "./securityRpc";

type Stage = "loading" | "provisioned" | "enabled";
type Notify = (msg: string, kind?: "ok" | "err") => void;

/** Six single-character boxes with auto-advance + paste, matching the mock. */
function CodeBoxes({
  value,
  onChange,
  onComplete,
}: {
  value: string;
  onChange: (v: string) => void;
  onComplete: () => void;
}) {
  const refs = useRef<Array<HTMLInputElement | null>>([]);
  const digits = value.padEnd(6, " ").slice(0, 6).split("");

  const setAt = (i: number, ch: string) => {
    const next = value.split("");
    next[i] = ch;
    const joined = next.join("").replace(/\s/g, "").slice(0, 6);
    onChange(joined);
    if (ch && i < 5) refs.current[i + 1]?.focus();
    if (joined.length === 6) onComplete();
  };

  return (
    <div className="grid grid-cols-4 gap-2.5 sm:grid-cols-4">
      {Array.from({ length: 6 }).map((_, i) => (
        <input
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          inputMode="numeric"
          maxLength={1}
          value={digits[i]?.trim() ?? ""}
          aria-label={`Digit ${i + 1}`}
          onChange={(e) => {
            const ch = e.target.value.replace(/\D/g, "").slice(-1);
            setAt(i, ch);
          }}
          onKeyDown={(e) => {
            if (e.key === "Backspace" && !digits[i]?.trim() && i > 0) {
              refs.current[i - 1]?.focus();
            }
          }}
          onPaste={(e) => {
            e.preventDefault();
            const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
            if (pasted) {
              onChange(pasted);
              if (pasted.length === 6) onComplete();
              else refs.current[Math.min(pasted.length, 5)]?.focus();
            }
          }}
          className={cn(
            "aspect-square w-full rounded-lg border bg-black/40 text-center font-display text-2xl font-bold text-gold",
            "outline-none transition",
            digits[i]?.trim()
              ? "border-gold/60 shadow-[0_0_16px_-4px_rgba(245,197,24,0.5)]"
              : "border-gold/25",
            "focus:border-gold focus:ring-2 focus:ring-gold/20",
          )}
        />
      ))}
    </div>
  );
}

export function TwoFactorSetup({
  notify,
  onClose,
  account,
}: {
  notify: Notify;
  onClose?: () => void;
  account?: string;
}) {
  const [stage, setStage] = useState<Stage>("loading");
  const [setup, setSetup] = useState<TwoFactorSetup | null>(null);
  const [demo, setDemo] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  const provision = useCallback(async () => {
    setStage("loading");
    try {
      const s = await securityApi.twoFactorSetup();
      setSetup(s);
      setDemo(false);
      setStage("provisioned");
    } catch {
      // Offline / backend unreachable: demo-populate so the screen still reads.
      setSetup(demoTwoFactorSetup(account));
      setDemo(true);
      setStage("provisioned");
    }
  }, [account]);

  useEffect(() => {
    void provision();
  }, [provision]);

  const activate = useCallback(async () => {
    if (code.length !== 6) return;
    setBusy(true);
    try {
      await securityApi.twoFactorVerify(code);
      notify("Two-factor authentication is now active.");
      setStage("enabled");
      setCode("");
    } catch (e) {
      notify(e instanceof Error ? e.message : "Invalid code — check your authenticator.", "err");
    } finally {
      setBusy(false);
    }
  }, [code, notify]);

  const disable = useCallback(async () => {
    if (code.length < 6) return;
    setBusy(true);
    try {
      await securityApi.twoFactorDisable(code);
      notify("Two-factor authentication disabled.");
      setCode("");
      await provision();
    } catch (e) {
      notify(e instanceof Error ? e.message : "Invalid code", "err");
    } finally {
      setBusy(false);
    }
  }, [code, notify, provision]);

  return (
    <div className={cn(GLASS_PANEL, "mx-auto w-full max-w-2xl p-6 sm:p-8")}>
      {/* Header row: scan glyph · title · phone-lock glyph */}
      <div className="flex items-center justify-between">
        <div
          className="flex h-11 w-11 items-center justify-center rounded-xl border border-gold/30 text-gold"
          aria-hidden
        >
          {/* scan-corners glyph */}
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 8V5a2 2 0 0 1 2-2h3M16 3h3a2 2 0 0 1 2 2v3M21 16v3a2 2 0 0 1-2 2h-3M8 21H5a2 2 0 0 1-2-2v-3" />
            <rect x="8" y="8" width="8" height="8" rx="1" />
          </svg>
        </div>
        <h2 className="font-display text-center text-2xl font-bold uppercase tracking-wide text-gold">
          2FA Setup Authentication
        </h2>
        <div
          className="flex h-11 w-11 items-center justify-center rounded-xl border border-gold/30 text-gold"
          aria-hidden
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="6" y="2" width="12" height="20" rx="2" />
            <path d="M10 7h4M11 18h2" />
          </svg>
        </div>
      </div>

      {stage === "enabled" ? (
        <div className="mt-8 space-y-5 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-green/40 bg-green/10 text-green">
            <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M20 6 9 17l-5-5" />
            </svg>
          </div>
          <div>
            <p className="font-display text-lg font-bold uppercase tracking-wide text-foreground">
              2FA is active
            </p>
            <p className="mt-1 text-sm text-neutral-400">
              Enter a current authenticator or backup code to turn it off.
            </p>
          </div>
          <div className="mx-auto max-w-xs">
            <input
              value={code}
              maxLength={12}
              placeholder="Authenticator or backup code"
              onChange={(e) => setCode(e.target.value.trim())}
              className="w-full rounded-lg border border-white/10 bg-black/40 px-4 py-2.5 text-center text-sm text-white outline-none focus:border-brand/50"
            />
          </div>
          <button
            type="button"
            onClick={() => void disable()}
            disabled={busy || code.length < 6}
            className="mx-auto block rounded-xl border border-brand/40 bg-brand/10 px-5 py-2.5 text-sm font-semibold uppercase tracking-wide text-[#ff9ba1] transition hover:bg-brand/20 disabled:opacity-40"
          >
            {busy ? "Disabling…" : "Disable 2FA"}
          </button>
        </div>
      ) : (
        <>
          {demo && (
            <p className="mt-4 rounded-lg border border-amber-500/25 bg-amber-950/15 px-3 py-1.5 text-center text-[11px] uppercase tracking-widest text-amber-300/80">
              Offline preview — demo secret
            </p>
          )}

          <div className="mt-6 grid gap-8 md:grid-cols-2">
            {/* Step 1 — QR */}
            <div>
              <p className="font-display text-base font-semibold text-gold">Step 1: Scan QR Code</p>
              <div className="mt-3 flex justify-center rounded-xl border border-gold/20 bg-white p-3">
                {setup ? (
                  <QrCode value={setup.otpauth_url} size={188} />
                ) : (
                  <div className="h-[188px] w-[188px] animate-pulse rounded bg-neutral-200" />
                )}
              </div>
              {setup && (
                <div className="mt-3 rounded-lg border border-white/10 bg-black/40 p-3">
                  <p className="text-[10px] uppercase tracking-[0.2em] text-neutral-500">
                    Manual entry secret
                  </p>
                  <p className="mt-1 select-all break-all font-mono text-xs text-gold">
                    {setup.secret}
                  </p>
                </div>
              )}
            </div>

            {/* Step 2 — verification */}
            <div>
              <p className="font-display text-base font-semibold text-gold">
                Step 2: Enter Verification Code
              </p>
              <div className="mt-3">
                <CodeBoxes value={code} onChange={setCode} onComplete={() => void activate()} />
              </div>
              <div className="mt-4 flex items-center gap-2 text-xs text-neutral-500">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="6" y="2" width="12" height="20" rx="2" />
                  <path d="M11 18h2" />
                </svg>
                Open your authenticator app and enter the 6-digit code it shows.
              </div>
            </div>
          </div>

          {/* Backup codes */}
          {setup && setup.backup_codes.length > 0 && (
            <div className="mt-6 rounded-xl border border-amber-500/25 bg-amber-950/15 p-4">
              <p className="text-center text-[11px] uppercase tracking-[0.2em] text-amber-300/80">
                Backup Codes — save these now
              </p>
              <div className="mt-2 grid grid-cols-2 justify-items-center gap-x-6 gap-y-1 font-mono text-sm text-amber-100 sm:grid-cols-5">
                {setup.backup_codes.map((c) => (
                  <span key={c} className="select-all">
                    {c}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Activate */}
          <button
            type="button"
            onClick={() => void activate()}
            disabled={busy || code.length !== 6}
            className={cn(
              BTN_GOLD,
              "mt-6 w-full rounded-xl py-3.5 text-base uppercase tracking-wide disabled:opacity-40",
            )}
          >
            {busy ? "Activating…" : "Activate 2FA"}
          </button>

          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="mx-auto mt-3 block text-sm text-neutral-400 underline underline-offset-4 hover:text-foreground"
            >
              Cancel
            </button>
          )}
        </>
      )}
    </div>
  );
}
