// Typed wrappers for the /profile/security surface. Every function maps 1:1 to
// an RPC registered in backend-core/main.go — no fabricated endpoints.
//
// 2FA (auth_2fa_setup / _verify / _disable) requires a caller session and is
// re-exported from profileRpc. Account-recovery RPCs are intentionally PUBLIC
// (a locked-out player has no auth token); callSessionRpc transparently mints a
// guest device session for them, matching features/landing/landingRpc.ts.

import { callSessionRpc } from "@/lib/nakama/sessionRpc";

import { profileApi, type TwoFactorSetup } from "./profileRpc";

async function call<T>(id: string, payload: Record<string, unknown> = {}): Promise<T> {
  return (await callSessionRpc(id, payload)) as T;
}

export type { TwoFactorSetup } from "./profileRpc";

export const securityApi = {
  // --- 2FA (session RPCs) ---
  twoFactorSetup: (): Promise<TwoFactorSetup> => profileApi.twoFactorSetup(),
  twoFactorVerify: (code: string) => profileApi.twoFactorVerify(code),
  twoFactorDisable: (code: string) => profileApi.twoFactorDisable(code),

  // --- Account recovery (public RPCs) ---
  // account_recovery_request_email — email a single-use recovery code. Always
  // reports success server-side (no account enumeration).
  recoveryRequestEmail: (email: string) =>
    call<{ ok: boolean }>("account_recovery_request_email", { email }),
  // account_recovery_verify_email — consume the emailed code + set a new password.
  recoveryVerifyEmail: (input: { email: string; code: string; new_password: string }) =>
    call<{ ok: boolean }>("account_recovery_verify_email", input),
  // account_recovery_backup_code — recover via a 2FA backup code (lost device).
  recoveryBackupCode: (input: { email: string; backup_code: string; new_password: string }) =>
    call<{ ok: boolean }>("account_recovery_backup_code", input),
};

// Offline demo fallback for the 2FA setup panel: when the backend is
// unreachable the screen must still look intentional (per DESIGN-SYSTEM). This
// is a locally-generated, clearly-labelled placeholder — never persisted, never
// treated as a real secret.
const DEMO_B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function demoSecret(): string {
  let s = "";
  for (let i = 0; i < 32; i++) s += DEMO_B32[Math.floor(Math.random() * DEMO_B32.length)];
  return s;
}

function demoBackupCode(): string {
  const hex = "0123456789abcdef";
  let a = "";
  let b = "";
  for (let i = 0; i < 4; i++) a += hex[Math.floor(Math.random() * 16)];
  for (let i = 0; i < 4; i++) b += hex[Math.floor(Math.random() * 16)];
  return `${a}-${b}`;
}

export function demoTwoFactorSetup(account = "player"): TwoFactorSetup {
  const secret = demoSecret();
  const otpauth_url = `otpauth://totp/PokerNextGen:${encodeURIComponent(
    account,
  )}?secret=${secret}&issuer=PokerNextGen&algorithm=SHA1&digits=6&period=30`;
  return {
    otpauth_url,
    secret,
    backup_codes: Array.from({ length: 10 }, demoBackupCode),
  };
}

// Demo-only linked wallets for the "Recover via Linked Crypto Wallet" panel.
// Live wallet linking is a separate flow; this pre-populates the recognizable
// providers from the master mock so the recovery option renders offline.
export interface LinkedWallet {
  id: string;
  name: string;
  short: string;
  balance: string;
  emoji: string;
}

export const DEMO_WALLETS: LinkedWallet[] = [
  { id: "metamask", name: "MetaMask", short: "0x7a3f…c091", balance: "5.4 ETH", emoji: "🦊" },
  { id: "coinbase", name: "Coinbase Wallet", short: "0x1d8b…4e77", balance: "2.1 ETH", emoji: "🔵" },
];
