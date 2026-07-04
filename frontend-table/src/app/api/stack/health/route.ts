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

async function probeFirst(urls: string[]): Promise<{ url: string; ok: boolean; detail?: unknown; error?: string }> {
  let last = { url: urls[0], ok: false, error: "unreachable" };
  for (const url of urls) {
    const result = await probe(url);
    last = { url, ...result };
    if (result.ok) return last;
  }
  return last;
}

export async function GET() {
  const engine = await probeFirst(
    [
      process.env.ENGINE_MATH_URL ?? "http://engine-math:8080",
      "http://127.0.0.1:8080",
      "http://localhost:8080",
    ].map((u) => `${u.replace(/\/$/, "")}/health`),
  );

  const nakama = await probeFirst([
    `${process.env.NAKAMA_HOST ?? "http://backend-core:7350"}/v2/healthcheck`,
    "http://127.0.0.1:7350/v2/healthcheck",
    "http://localhost:7350/v2/healthcheck",
  ]);

  const oddslingers = await probeFirst([
    process.env.ODDSLINGERS_URL ?? "http://oddslingers-nginx:80",
    "http://127.0.0.1:8888",
    "http://localhost:8888",
  ]);

  const checks: ServiceStatus[] = [
    { id: "engine-math", name: "rs_poker engine-math", ...engine },
    { id: "nakama", name: "Nakama backend-core", ...nakama },
    { id: "oddslingers", name: "OddSlingers (Django)", ...oddslingers },
  ];

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
