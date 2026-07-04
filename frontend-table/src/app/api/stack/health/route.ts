import { NextResponse } from "next/server";

type ServiceStatus = {
  id: string;
  name: string;
  url: string;
  ok: boolean;
  detail?: unknown;
  error?: string;
};

async function probe(url: string, init?: RequestInit): Promise<{ ok: boolean; detail?: unknown; error?: string }> {
  try {
    const res = await fetch(url, { ...init, cache: "no-store" });
    const contentType = res.headers.get("content-type") ?? "";
    let detail: unknown = res.status;
    if (contentType.includes("application/json")) {
      detail = await res.json();
    } else if (res.ok) {
      detail = res.status;
    }
    return { ok: res.ok, detail };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "unreachable" };
  }
}

export async function GET() {
  const nakamaHost = process.env.NAKAMA_HOST ?? "http://backend-core:7350";
  const engineUrl = process.env.ENGINE_MATH_URL ?? "http://engine-math:8080";
  const oddslingersUrl = process.env.ODDSLINGERS_URL ?? "http://oddslingers-nginx:80";

  const checks: ServiceStatus[] = [];

  const engine = await probe(`${engineUrl}/health`);
  checks.push({
    id: "engine-math",
    name: "rs_poker engine-math",
    url: engineUrl,
    ...engine,
  });

  const nakama = await probe(`${nakamaHost}/v2/healthcheck`);
  checks.push({
    id: "nakama",
    name: "Nakama backend-core",
    url: nakamaHost,
    ...nakama,
  });

  const oddslingers = await probe(oddslingersUrl);
  checks.push({
    id: "oddslingers",
    name: "OddSlingers (Django)",
    url: oddslingersUrl,
    ...oddslingers,
  });

  const allOk = checks.every((c) => c.ok);

  return NextResponse.json({
    ok: allOk,
    services: checks,
    live: {
      command_center: "http://localhost:3000",
      table: "http://localhost:3000/table",
      lobby: "http://localhost:3000/lobby",
      nakama_api: "http://localhost:7350",
      nakama_console: "http://localhost:7351",
      engine_math: "http://localhost:8080",
      oddslingers: process.env.NEXT_PUBLIC_ODDSLINGERS_URL ?? "http://localhost:8888",
    },
    at: new Date().toISOString(),
  });
}
