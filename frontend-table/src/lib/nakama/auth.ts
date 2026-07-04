import { Session } from "@heroiclabs/nakama-js";

import { createNakamaClient } from "./client";

const SESSION_KEY = "png-nakama-session";

export type AuthMethod = "device" | "email" | "google";

export interface AuthCredentials {
  email?: string;
  password?: string;
  username?: string;
  googleToken?: string;
}

function persistSession(session: Session) {
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
  localStorage.setItem("png-auth-method", session.username?.includes("@") ? "email" : "google");
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
  localStorage.removeItem("png-auth-method");
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
    persistSession(session);
    return session;
  }

  if (method === "google") {
    if (!creds.googleToken) {
      throw new Error("Google token required");
    }
    const session = await client.authenticateGoogle(creds.googleToken, create);
    persistSession(session);
    return session;
  }

  const session = await client.authenticateDevice(deviceId(), true, undefined, {
    auth_method: "device",
  });
  persistSession(session);
  return session;
}

export async function ensureSession(): Promise<Session> {
  const existing = loadPersistedSession();
  if (existing && !existing.isexpired(Date.now() / 1000)) {
    return existing;
  }
  return authenticate("device", {}, true);
}
