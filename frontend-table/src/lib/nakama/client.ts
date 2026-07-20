import { Client, Session, Socket } from "@heroiclabs/nakama-js";

// Railway env vars are often set as a bare domain (no scheme). `new URL()`
// throws on those, which crashed the Next.js build at prerender. Normalize to a
// URL with a scheme (assume https for a bare public domain).
function normalizeHost(raw: string | undefined): string {
  const value = (raw ?? "http://localhost:7350").trim();
  if (/^https?:\/\//i.test(value)) return value;
  return `https://${value}`;
}

const host = normalizeHost(process.env.NEXT_PUBLIC_NAKAMA_HOST);
// NEXT_PUBLIC_* is the only form exposed to the browser; fall back to the
// server-only var (undefined client-side) and finally Nakama's default.
const serverKey =
  process.env.NEXT_PUBLIC_NAKAMA_SERVER_KEY ?? process.env.NAKAMA_SERVER_KEY ?? "defaultkey";

export function createNakamaClient(): Client {
  const url = new URL(host);
  const useSSL = url.protocol === "https:";
  // A Railway public HTTPS domain has no explicit port and is served on 443 —
  // NOT Nakama's raw 7350. Defaulting to 7350 here made every browser RPC and
  // the match WebSocket connect to a dead port.
  const port = url.port || (useSSL ? "443" : "7350");
  return new Client(serverKey, url.hostname, port, useSSL);
}

export async function authenticateDevice(client: Client, deviceId: string): Promise<Session> {
  return client.authenticateDevice(deviceId, true, undefined, { wallet_cents: "100000" });
}

export type { Client, Session, Socket };
