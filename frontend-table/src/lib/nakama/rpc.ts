const DEFAULT_HOST = "http://localhost:7350";
// Server-to-server RPC over HTTP authenticates with Nakama's runtime HTTP key
// (via ?http_key=), NOT the client server_key over Basic auth. Using the
// server_key here produced "HTTP key invalid" and broke every proxied RPC
// (health check, table creation, clubs). Default matches Nakama's built-in.
const DEFAULT_HTTP_KEY = "defaulthttpkey";

function nakamaHost(): string {
  return process.env.NAKAMA_HOST ?? process.env.NEXT_PUBLIC_NAKAMA_HOST ?? DEFAULT_HOST;
}

function nakamaHttpKey(): string {
  return process.env.NAKAMA_HTTP_KEY ?? DEFAULT_HTTP_KEY;
}

/** Call a Nakama RPC through the server-side proxy (keeps keys off the client). */
export async function callNakamaRpc(rpcId: string, payload: unknown = ""): Promise<unknown> {
  const payloadStr =
    payload === "" || payload === undefined
      ? ""
      : typeof payload === "string"
        ? payload
        : JSON.stringify(payload);

  const url = `${nakamaHost()}/v2/rpc/${encodeURIComponent(rpcId)}?http_key=${encodeURIComponent(nakamaHttpKey())}`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payloadStr),
    cache: "no-store",
  });

  const text = await response.text();
  let parsed: unknown = text;

  try {
    parsed = JSON.parse(text);
  } catch {
    // keep raw text
  }

  if (!response.ok) {
    throw new Error(typeof parsed === "string" ? parsed : JSON.stringify(parsed));
  }

  if (parsed && typeof parsed === "object" && "payload" in parsed) {
    const wrapped = parsed as { payload?: string };
    if (typeof wrapped.payload === "string") {
      try {
        return JSON.parse(wrapped.payload);
      } catch {
        return wrapped.payload;
      }
    }
  }

  return parsed;
}

// deploy trigger
