import { Client, Session, Socket } from "@heroiclabs/nakama-js";

const host = process.env.NEXT_PUBLIC_NAKAMA_HOST ?? "http://localhost:7350";
const serverKey = process.env.NAKAMA_SERVER_KEY ?? "defaultkey";

export function createNakamaClient(): Client {
  const url = new URL(host);
  return new Client(serverKey, url.hostname, url.port || "7350", url.protocol === "https:");
}

export async function authenticateDevice(client: Client, deviceId: string): Promise<Session> {
  return client.authenticateDevice(deviceId, true, undefined, { wallet_cents: "100000" });
}

export type { Client, Session, Socket };
