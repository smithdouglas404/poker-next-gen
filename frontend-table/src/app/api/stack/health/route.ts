import { NextResponse } from "next/server";

type ServiceStatus = {
  id: string;
  name: string;
  url: string;
  ok: boolean;
  detail?: unknown;
  error?: string;
  hint?: string;
};

async function probe(url: string, init?: RequestInit): Promise<{ ok: boolean; detail?: unknown; error?: string }> {
  try {
    const res = await fetch(url, { ...init, cache: "no-store", signal: AbortSignal.timeout(5000) });
    const contentType = res.headers.get("content-type") ?? "";
    let detail: unknown = res.status;
    if (contentType.includes("application/json")) {
      detail = await res.json();
    } else if (res.ok) {
      detail = res.status;
    }
    return { ok: res.ok, detail, error: res.ok ? undefined : `HTTP ${res.status}` };
  } catch (error) {
    const message = error instanceof Error ? error.message : "unreachable";
    const refused =
      message.includes("ECONNREFUSED") ||
      message.includes("fetch failed") ||
      message.includes("Failed to fetch");
    return {
      ok: false,
      error: refused ? "not running (connection refused)" : message,
    };
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

function nakamaProbeUrls(): string[] {
  const bases = [
    process.env.NAKAMA_HOST ?? "http://backend-core:7350",
    "http://127.0.0.1:7350",
    "http://localhost:7350",
  ];
  const paths = ["/healthcheck", "/v2/healthcheck"];
  const urls: string[] = [];
  for (const base of bases) {
    const root = base.replace(/\/$/, "");
    for (const path of paths) {
      urls.push(`${root}${path}`);
    }
  }
  return urls;
}

function downHint(id: string, error?: string): string | undefined {
  const refused = error?.includes("refused") || error === "unreachable";
  if (!refused) return undefined;

  if (id === "nakama") {
    return "Start Nakama: ./scripts/live-up.sh (or docker compose up --build backend-core). Needs ports 7350–7351 and postgres :5432 free.";
  }
  if (id === "oddslingers") {
    return "Start OddSlingers: git submodule update --init oddslingers && ./scripts/live-up.sh. First build can take several minutes; needs port 8888 free.";
  }
  if (id === "engine-math") {
    return "Start engine-math: docker compose up --build engine-math (or cargo run --release --bin engine-math-server in engine-math/).";
  }
  return undefined;
}

export async function GET() {
  const engine = await probeFirst(
    [
      process.env.ENGINE_MATH_URL ?? "http://engine-math:8080",
      "http://127.0.0.1:8080",
      "http://localhost:8080",
    ].map((u) => `${u.replace(/\/$/, "")}/health`),
  );

  const nakama = await probeFirst(nakamaProbeUrls());

  const oddslingers = await probeFirst([
    process.env.ODDSLINGERS_URL ?? "http://oddslingers-nginx:80",
    "http://127.0.0.1:8888",
    "http://localhost:8888",
  ]);

  const checks: ServiceStatus[] = [
    { id: "engine-math", name: "rs_poker engine-math", ...engine },
    { id: "nakama", name: "Nakama backend-core", ...nakama },
    { id: "oddslingers", name: "OddSlingers (Django)", ...oddslingers },
  ].map((svc) => ({
    ...svc,
    hint: svc.ok ? undefined : downHint(svc.id, svc.error),
  }));

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
    boot: {
      full_stack: "./scripts/live-up.sh",
      verify: "./scripts/stack-status.sh",
      logs: "docker compose logs backend-core oddslingers-django --tail 50",
    },
    at: new Date().toISOString(),
  });
}
