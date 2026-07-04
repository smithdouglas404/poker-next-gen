const DEFAULT_HOST = "http://localhost:7350";
const DEFAULT_KEY = "defaultkey";

function nakamaHost(): string {
  return process.env.NAKAMA_HOST ?? process.env.NEXT_PUBLIC_NAKAMA_HOST ?? DEFAULT_HOST;
}

function nakamaAuthHeader(): string {
  const key = process.env.NAKAMA_SERVER_KEY ?? DEFAULT_KEY;
  return `Basic ${Buffer.from(`:${key}`).toString("base64")}`;
}

/** Call a Nakama RPC through the server-side proxy (keeps keys off the client). */
export async function callNakamaRpc(rpcId: string, payload: unknown = ""): Promise<unknown> {
  const payloadStr =
    payload === "" || payload === undefined
      ? ""
      : typeof payload === "string"
        ? payload
        : JSON.stringify(payload);

  const response = await fetch(`${nakamaHost()}/v2/rpc/${rpcId}`, {
    method: "POST",
    headers: {
      Authorization: nakamaAuthHeader(),
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
