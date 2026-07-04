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
      error: refused ? "container not reachable" : message,
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

function downHint(id: string, error?: string, inCompose?: boolean): string | undefined {
  const refused = error?.includes("refused") || error?.includes("unreachable");
  if (!refused) return undefined;

  const where = inCompose
    ? "This container is up, but the sibling service is not running or not healthy yet."
    : "Service is not listening on localhost.";

  if (id === "nakama") {
    return `${where} Start Nakama: docker compose up -d backend-core (or ./scripts/core-up.sh from your Mac terminal). If unhealthy: docker compose logs backend-core --tail 50`;
  }
  if (id === "oddslingers") {
    return `${where} OddSlingers is optional: ./scripts/oddslingers-up.sh`;
  }
  if (id === "engine-math") {
    return `${where} Start engine-math: docker compose up -d engine-math`;
  }
  return undefined;
}

function detectInCompose(): boolean {
  if (process.env.RUNNING_IN_COMPOSE === "1") return true;
  const host = process.env.NAKAMA_HOST ?? "";
  return host.includes("backend-core") || host.includes("engine-math");
}

export async function GET() {
  const inCompose = detectInCompose();

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
    hint: svc.ok ? undefined : downHint(svc.id, svc.error, inCompose),
  }));

  const coreOk = checks.filter((c) => c.id !== "oddslingers").every((c) => c.ok);
  const allOk = checks.every((c) => c.ok);

  return NextResponse.json({
    ok: coreOk,
    allOk,
    runtime: {
      in_compose: inCompose,
      note: inCompose
        ? "You are inside Docker Compose. A service marked down means that container is not running or not healthy — not that Docker is missing."
        : "Running outside Compose; probes fall back to localhost.",
    },
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
      core: "./scripts/core-up.sh",
      oddslingers: "./scripts/oddslingers-up.sh",
      doctor: "./scripts/doctor.sh",
      verify: "./scripts/stack-status.sh",
    },
    at: new Date().toISOString(),
  });
}
