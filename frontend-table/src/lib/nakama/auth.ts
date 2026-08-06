import { Session } from "@heroiclabs/nakama-js";

import { createNakamaClient } from "./client";

const SESSION_KEY = "png-nakama-session";
const METHOD_KEY = "png-auth-method";

/**
 * Renew this many seconds BEFORE the access token actually dies.
 *
 * Nakama's `token_expiry_sec` is unset in both `stack-up.mjs` and
 * `.railway/railway.ts`, so both take the short default. Without a margin a
 * request that passes the expiry check can still arrive after the token has
 * lapsed and come back 403.
 */
const EXPIRY_SKEW_SEC = 30;

export type AuthMethod = "device" | "email" | "google" | "clerk";

/**
 * The stored session expired and could not be renewed, and the identity behind
 * it was a REAL one — so the only honest outcome is "sign in again".
 *
 * This exists because the alternative shipped: `ensureSession()` used to answer
 * an expired session by calling `authenticate("device")`, silently replacing the
 * signed-in club owner with a brand-new anonymous account. Measured in a live
 * browser: the persisted `user_id` changed mid-session from the owner to a
 * stranger, after which every club RPC returned 403 and the screens that swallow
 * errors simply froze on stale data. A caller that cannot tell "your session
 * ended" from "you are someone else now" cannot render either one correctly.
 */
export class SessionExpiredError extends Error {
  constructor() {
    super("Your session expired. Please sign in again.");
    this.name = "SessionExpiredError";
  }
}

export interface AuthCredentials {
  email?: string;
  password?: string;
  username?: string;
  googleToken?: string;
}

/**
 * The method is RECORDED, not guessed. It used to be inferred from whether the
 * username contained an "@", which labelled every device and Clerk session
 * "google" — so nothing downstream could tell an anonymous device account from a
 * signed-in member, which is exactly the distinction the renewal path needs.
 */
function persistSession(session: Session, method: AuthMethod) {
  if (typeof window === "undefined") return;
  localStorage.setItem(
    SESSION_KEY,
    JSON.stringify({
      token: session.token,
      refresh_token: session.refresh_token,
      user_id: session.user_id,
      username: session.username,
    }),
  );
  localStorage.setItem(METHOD_KEY, method);
}

function storedMethod(): AuthMethod | null {
  if (typeof window === "undefined") return null;
  const v = localStorage.getItem(METHOD_KEY);
  return v === "device" || v === "email" || v === "google" || v === "clerk" ? v : null;
}

export function loadPersistedSession(): Session | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  try {
    const data = JSON.parse(raw) as {
      token: string;
      refresh_token: string;
      user_id?: string;
      username?: string;
    };
    return Session.restore(data.token, data.refresh_token);
  } catch {
    return null;
  }
}

export function clearAuth() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(SESSION_KEY);
  localStorage.removeItem(METHOD_KEY);
}

function deviceId(): string {
  const key = "png-device-id";
  let id = localStorage.getItem(key);
  if (!id) {
    id = `dev-${Math.random().toString(36).slice(2, 10)}`;
    localStorage.setItem(key, id);
  }
  return id;
}

export async function authenticate(
  method: AuthMethod,
  creds: AuthCredentials = {},
  create = false,
): Promise<Session> {
  const client = createNakamaClient();

  if (method === "email") {
    if (!creds.email || !creds.password) {
      throw new Error("Email and password required");
    }
    const session = await client.authenticateEmail(
      creds.email,
      creds.password,
      create,
      creds.username ?? creds.email.split("@")[0],
    );
    persistSession(session, "email");
    return session;
  }

  if (method === "google") {
    if (!creds.googleToken) {
      throw new Error("Google token required");
    }
    const session = await client.authenticateGoogle(creds.googleToken, create);
    persistSession(session, "google");
    return session;
  }

  const session = await client.authenticateDevice(deviceId(), true, undefined, {
    auth_method: "device",
  });
  persistSession(session, "device");
  return session;
}

/** Collapses concurrent renewals. Dozens of components call `ensureSession()`
 *  on mount; without this they would each fire their own refresh and race to
 *  persist different tokens. */
let renewal: Promise<Session> | null = null;

export async function ensureSession(): Promise<Session> {
  const existing = loadPersistedSession();
  const now = Date.now() / 1000;
  if (existing && !existing.isexpired(now + EXPIRY_SKEW_SEC)) return existing;

  renewal ??= renew(existing, now).finally(() => {
    renewal = null;
  });
  return renewal;
}

/**
 * Renew an expired session, in the only order that preserves WHO the caller is.
 *
 * 1. Spend the refresh token. It was persisted all along and never used — that
 *    omission is the whole bug. A refresh keeps the same user_id, so a member
 *    stays a member across the token's short lifetime.
 * 2. If the refresh is gone or rejected, an anonymous device account is the
 *    right answer ONLY for a caller who was already anonymous. For anyone else
 *    it is an identity swap wearing the costume of a successful call, so the
 *    stored credentials are cleared and the caller is told to sign in again.
 */
async function renew(existing: Session | null, now: number): Promise<Session> {
  if (existing?.refresh_token && !existing.isrefreshexpired(now)) {
    try {
      const refreshed = await createNakamaClient().sessionRefresh(existing);
      persistSession(refreshed, storedMethod() ?? "device");
      return refreshed;
    } catch {
      // Refresh token rejected or revoked — fall through to the identity check.
    }
  }

  const method = storedMethod();
  if (method && method !== "device") {
    clearAuth();
    throw new SessionExpiredError();
  }
  return authenticate("device", {}, true);
}

// authenticateClerk trades a Clerk session JWT for a Nakama session. The token
// is passed in vars["clerk_jwt"]; the backend's RegisterBeforeAuthenticateCustom
// hook verifies its signature against Clerk's JWKS and rewrites the account id to
// a stable "clerk:<sub>". The placeholder id satisfies Nakama's 6–128 char rule
// before the hook overrides it. This is the glue that turns a Clerk (Google/etc.)
// login into a real, server-verified game session.
export async function authenticateClerk(clerkJwt: string): Promise<Session> {
  const client = createNakamaClient();
  const session = await client.authenticateCustom("clerkbridge", true, undefined, {
    clerk_jwt: clerkJwt,
  });
  persistSession(session, "clerk");
  return session;
}
