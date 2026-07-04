import { Session } from "@heroiclabs/nakama-js";

import { authenticateDevice, createNakamaClient } from "./client";

function deviceId(): string {
  if (typeof window === "undefined") return "ssr";
  const key = "png-device-id";
  let id = localStorage.getItem(key);
  if (!id) {
    id = `dev-${Math.random().toString(36).slice(2, 10)}`;
    localStorage.setItem(key, id);
  }
  return id;
}

let sessionCache: Session | null = null;

export async function ensureNakamaSession(): Promise<Session> {
  if (sessionCache && !sessionCache.isexpired(Date.now() / 1000)) {
    return sessionCache;
  }
  const client = createNakamaClient();
  sessionCache = await authenticateDevice(client, deviceId());
  return sessionCache;
}

export async function callSessionRpc(rpcId: string, payload: Record<string, unknown> = {}): Promise<unknown> {
  const client = createNakamaClient();
  const session = await ensureNakamaSession();
  const result = await client.rpc(session, rpcId, payload);
  const raw = result.payload as unknown;
  if (typeof raw === "string" && raw.length > 0) {
    try {
      return JSON.parse(raw);
    } catch {
      return raw;
    }
  }
  return raw ?? result;
}

export function getSessionToken(): string | null {
  return sessionCache?.token ?? null;
}
