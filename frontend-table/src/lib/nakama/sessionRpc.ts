import { Session } from "@heroiclabs/nakama-js";

import { ensureSession as ensureAuthSession } from "./auth";
import { createNakamaClient } from "./client";

export async function ensureNakamaSession(): Promise<Session> {
  return ensureAuthSession();
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
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem("png-nakama-session");
  if (!raw) return null;
  try {
    return (JSON.parse(raw) as { token: string }).token;
  } catch {
    return null;
  }
}
