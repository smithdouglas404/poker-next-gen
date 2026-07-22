// Typed wrappers over callSessionRpc for the marketing landing surface.
// Every function maps 1:1 to an RPC registered in backend-core/main.go — no
// fabricated data. All of these are public (no-auth) RPCs; callSessionRpc
// transparently creates a guest device session for the caller.

import { callSessionRpc } from "@/lib/nakama/sessionRpc";

async function call<T>(id: string, payload: Record<string, unknown> = {}): Promise<T> {
  return (await callSessionRpc(id, payload)) as T;
}

export interface GlobalStats {
  hands: number;
  players: number;
  clubs: number;
  pot_cents: number;
  rake_cents: number;
  open_tables: number;
}

export interface PresenceStats {
  online: number;
  players_at_tables: number;
}

export interface SiteSettings {
  site_name: string;
  support_email: string;
  discord_url: string;
  twitter_url: string;
  deposits_enabled: boolean;
  subscriptions_live: boolean;
  kyc_enabled: boolean;
  character_gen: boolean;
}

export const landingApi = {
  // stats_global — lifetime network totals (hands, players, clubs, pot, rake).
  stats: () => call<GlobalStats>("stats_global", {}),
  // presence_online — currently connected players + those seated at live tables.
  presence: () => call<PresenceStats>("presence_online", {}),
  // site_settings_get — public branding + which features are live (env-driven).
  siteSettings: () => call<{ settings: SiteSettings }>("site_settings_get", {}),

  // support_contact — opens a support ticket from the landing contact form.
  supportContact: (input: {
    email: string;
    subject: string;
    body: string;
    category: string;
  }) => call<{ id: string; ok: boolean }>("support_contact", input),

  // account_recovery_request_email — send a recovery code to the account email.
  recoveryRequestEmail: (email: string) =>
    call<{ ok: boolean }>("account_recovery_request_email", { email }),
  // account_recovery_verify_email — consume the emailed code + set a new password.
  recoveryVerifyEmail: (input: { email: string; code: string; new_password: string }) =>
    call<{ ok: boolean }>("account_recovery_verify_email", input),
  // account_recovery_backup_code — recover via a 2FA backup code (lost authenticator).
  recoveryBackupCode: (input: { email: string; backup_code: string; new_password: string }) =>
    call<{ ok: boolean }>("account_recovery_backup_code", input),
};

/** Compact integer: 128700 → "128.7k". */
export function compact(n: number | undefined | null): string {
  const v = n ?? 0;
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${(v / 1_000).toFixed(1)}k`;
  return `${v}`;
}

/** Cents → compact dollar label: 4820000 → "$48.2k". */
export function money(cents: number | undefined | null): string {
  const dollars = (cents ?? 0) / 100;
  const abs = Math.abs(dollars);
  if (abs >= 1_000_000) return `$${(dollars / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `$${(dollars / 1_000).toFixed(1)}k`;
  return `$${dollars.toFixed(0)}`;
}
