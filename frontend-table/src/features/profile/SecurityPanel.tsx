"use client";

import { useCallback, useEffect, useState } from "react";

import { Button, Field, Input } from "@/features/ui";
import { GLASS_PANEL, HEADING_SM, cn } from "@/features/ui/tokens";

import { profileApi, relTime, type ApiKey, type TwoFactorSetup } from "./profileRpc";

type TwoFactorStage = "idle" | "provisioned" | "enabled" | "disabling";

function TwoFactor({ notify }: { notify: (msg: string, kind?: "ok" | "err") => void }) {
  const [stage, setStage] = useState<TwoFactorStage>("idle");
  const [setup, setSetup] = useState<TwoFactorSetup | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  const begin = useCallback(async () => {
    setBusy(true);
    try {
      const s = await profileApi.twoFactorSetup();
      setSetup(s);
      setStage("provisioned");
    } catch (e) {
      notify(e instanceof Error ? e.message : "Could not start 2FA setup", "err");
    } finally {
      setBusy(false);
    }
  }, [notify]);

  const verify = useCallback(async () => {
    if (code.trim().length !== 6) return;
    setBusy(true);
    try {
      await profileApi.twoFactorVerify(code.trim());
      notify("Two-factor authentication is now active.");
      setStage("enabled");
      setCode("");
    } catch (e) {
      notify(e instanceof Error ? e.message : "Invalid code", "err");
    } finally {
      setBusy(false);
    }
  }, [code, notify]);

  const disable = useCallback(async () => {
    if (code.trim().length < 6) return;
    setBusy(true);
    try {
      await profileApi.twoFactorDisable(code.trim());
      notify("Two-factor authentication disabled.");
      setStage("idle");
      setSetup(null);
      setCode("");
    } catch (e) {
      notify(e instanceof Error ? e.message : "Invalid code", "err");
    } finally {
      setBusy(false);
    }
  }, [code, notify]);

  return (
    <div className={cn(GLASS_PANEL, "p-6")}>
      <div className="flex items-center justify-between">
        <div>
          <p className={cn(HEADING_SM, "text-gold/80")}>Two-Factor Auth</p>
          <h3 className="font-display mt-1 text-lg font-bold uppercase tracking-wide text-foreground">
            Authenticator (TOTP)
          </h3>
        </div>
        <span
          className={cn(
            "rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-widest",
            stage === "enabled"
              ? "border-emerald-500/40 text-emerald-300"
              : "border-neutral-600 text-neutral-400",
          )}
        >
          {stage === "enabled" ? "Active" : "Off"}
        </span>
      </div>

      {stage === "idle" && (
        <>
          <p className="mt-3 text-sm text-neutral-400">
            Add a second layer to your account with an authenticator app (Google Authenticator, Authy,
            1Password).
          </p>
          <Button className="mt-4" onClick={() => void begin()} disabled={busy}>
            {busy ? "Provisioning…" : "Set up 2FA"}
          </Button>
        </>
      )}

      {stage === "provisioned" && setup && (
        <div className="mt-4 space-y-4">
          <div className="rounded-xl border border-white/10 bg-black/40 p-4">
            <p className="text-[11px] uppercase tracking-[0.2em] text-neutral-500">Manual entry secret</p>
            <p className="mt-1 select-all break-all font-mono text-sm text-gold">{setup.secret}</p>
            <p className="mt-3 text-[11px] uppercase tracking-[0.2em] text-neutral-500">otpauth URL</p>
            <p className="mt-1 select-all break-all font-mono text-[11px] text-neutral-400">
              {setup.otpauth_url}
            </p>
          </div>
          {setup.backup_codes.length > 0 && (
            <div className="rounded-xl border border-amber-500/25 bg-amber-950/15 p-4">
              <p className="text-[11px] uppercase tracking-[0.2em] text-amber-300/80">
                Backup codes — save these now
              </p>
              <div className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 font-mono text-sm text-amber-100 sm:grid-cols-5">
                {setup.backup_codes.map((c) => (
                  <span key={c} className="select-all">
                    {c}
                  </span>
                ))}
              </div>
            </div>
          )}
          <Field label="Enter the 6-digit code from your app">
            <Input
              value={code}
              inputMode="numeric"
              maxLength={6}
              placeholder="000000"
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              onKeyDown={(e) => {
                if (e.key === "Enter") void verify();
              }}
            />
          </Field>
          <Button onClick={() => void verify()} disabled={busy || code.trim().length !== 6}>
            {busy ? "Verifying…" : "Activate 2FA"}
          </Button>
        </div>
      )}

      {stage === "enabled" && (
        <div className="mt-4 space-y-3">
          <p className="text-sm text-neutral-400">
            2FA is active. Enter a current authenticator code (or a backup code) to turn it off.
          </p>
          <Field label="Authenticator or backup code">
            <Input
              value={code}
              maxLength={12}
              placeholder="000000"
              onChange={(e) => setCode(e.target.value.trim())}
              onKeyDown={(e) => {
                if (e.key === "Enter") void disable();
              }}
            />
          </Field>
          <Button variant="danger" onClick={() => void disable()} disabled={busy || code.trim().length < 6}>
            {busy ? "Disabling…" : "Disable 2FA"}
          </Button>
        </div>
      )}
    </div>
  );
}

function ChangePassword({ notify }: { notify: (msg: string, kind?: "ok" | "err") => void }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = useCallback(async () => {
    if (next.length < 8) {
      notify("New password must be at least 8 characters.", "err");
      return;
    }
    if (next !== confirm) {
      notify("New passwords do not match.", "err");
      return;
    }
    setBusy(true);
    try {
      await profileApi.changePassword(current, next);
      notify("Password updated.");
      setCurrent("");
      setNext("");
      setConfirm("");
    } catch (e) {
      notify(e instanceof Error ? e.message : "Could not update password", "err");
    } finally {
      setBusy(false);
    }
  }, [current, next, confirm, notify]);

  return (
    <div className={cn(GLASS_PANEL, "p-6")}>
      <p className={cn(HEADING_SM, "text-gold/80")}>Credentials</p>
      <h3 className="font-display mt-1 text-lg font-bold uppercase tracking-wide text-foreground">
        Change Password
      </h3>
      <div className="mt-4 space-y-3">
        <Field label="Current password">
          <Input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="New password" hint="At least 8 characters">
            <Input type="password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" />
          </Field>
          <Field label="Confirm new password">
            <Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" />
          </Field>
        </div>
        <Button onClick={() => void submit()} disabled={busy || current === "" || next === ""}>
          {busy ? "Saving…" : "Update password"}
        </Button>
      </div>
    </div>
  );
}

function ApiKeys({ notify }: { notify: (msg: string, kind?: "ok" | "err") => void }) {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [label, setLabel] = useState("");
  const [freshKey, setFreshKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await profileApi.apiKeyList();
      setKeys(res.api_keys ?? []);
    } catch (e) {
      notify(e instanceof Error ? e.message : "Failed to load API keys", "err");
    } finally {
      setLoading(false);
    }
  }, [notify]);

  useEffect(() => {
    void load();
  }, [load]);

  const create = useCallback(async () => {
    setBusy(true);
    try {
      const created = await profileApi.apiKeyCreate(label.trim() || "API key");
      setFreshKey(created.key);
      setLabel("");
      notify("API key created — copy it now, it won't be shown again.");
      await load();
    } catch (e) {
      notify(e instanceof Error ? e.message : "Could not create key", "err");
    } finally {
      setBusy(false);
    }
  }, [label, notify, load]);

  const revoke = useCallback(
    async (id: string) => {
      try {
        await profileApi.apiKeyRevoke(id);
        notify("API key revoked.");
        await load();
      } catch (e) {
        notify(e instanceof Error ? e.message : "Could not revoke key", "err");
      }
    },
    [notify, load],
  );

  return (
    <div className={cn(GLASS_PANEL, "p-6")}>
      <p className={cn(HEADING_SM, "text-gold/80")}>Developer Access</p>
      <h3 className="font-display mt-1 text-lg font-bold uppercase tracking-wide text-foreground">API Keys</h3>

      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
        <Field label="Label" className="flex-1">
          <Input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="e.g. HUD integration"
            onKeyDown={(e) => {
              if (e.key === "Enter") void create();
            }}
          />
        </Field>
        <Button onClick={() => void create()} disabled={busy}>
          {busy ? "Creating…" : "Create key"}
        </Button>
      </div>

      {freshKey && (
        <div className="mt-4 rounded-xl border border-gold/30 bg-gold/[0.05] p-4">
          <p className="text-[11px] uppercase tracking-[0.2em] text-gold/80">New key — shown once</p>
          <p className="mt-1 select-all break-all font-mono text-sm text-gold">{freshKey}</p>
        </div>
      )}

      <div className="mt-5 space-y-2">
        {loading && <p className="py-4 text-center text-sm text-neutral-500">Loading keys…</p>}
        {!loading && keys.length === 0 && (
          <p className="rounded-xl border border-white/10 bg-black/30 py-6 text-center text-sm text-neutral-400">
            No API keys yet.
          </p>
        )}
        {keys.map((k) => (
          <div
            key={k.id}
            className={cn(
              "flex items-center gap-3 rounded-xl border px-4 py-3",
              k.revoked ? "border-white/[0.05] bg-black/20 opacity-50" : "border-white/10 bg-black/30",
            )}
          >
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-foreground">{k.label}</p>
              <p className="font-mono text-xs text-neutral-500">
                {k.prefix}…{" · "}created {relTime(k.created_at)}
                {k.last_used_at ? ` · used ${relTime(k.last_used_at)}` : " · never used"}
              </p>
            </div>
            {k.revoked ? (
              <span className="text-[10px] uppercase tracking-widest text-red-400">Revoked</span>
            ) : (
              <Button variant="danger" size="sm" onClick={() => void revoke(k.id)}>
                Revoke
              </Button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export function SecurityPanel({ notify }: { notify: (msg: string, kind?: "ok" | "err") => void }) {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <TwoFactor notify={notify} />
      <ChangePassword notify={notify} />
      <div className="lg:col-span-2">
        <ApiKeys notify={notify} />
      </div>
    </div>
  );
}
