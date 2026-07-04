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

type Runtime = "railway" | "compose" | "local";

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
      error: refused ? "service not reachable" : message,
    };
  }
}

async function probeFirst(urls: string[]): Promise<{ url: string; ok: boolean; detail?: unknown; error?: string }> {
  let last: { url: string; ok: boolean; detail?: unknown; error?: string } = {
    url: urls.find(Boolean) ?? "",
    ok: false,
    error: "unreachable",
  };
  for (const url of urls) {
    if (!url) continue;
    const result = await probe(url);
    last = { url, ...result };
    if (result.ok) return last;
  }
  return last;
}

function uniqueUrls(urls: Array<string | undefined>): string[] {
  return [...new Set(urls.filter((u): u is string => Boolean(u)))];
}

function nakamaProbeUrls(): string[] {
  const bases = uniqueUrls([
    process.env.NAKAMA_HOST,
    process.env.NEXT_PUBLIC_NAKAMA_HOST,
    "http://backend-core:7350",
    "http://127.0.0.1:7350",
    "http://localhost:7350",
  ].map((u) => u?.replace(/\/$/, "") ?? ""));
  const paths = ["/healthcheck", "/v2/healthcheck"];
  const urls: string[] = [];
  for (const base of bases) {
    for (const path of paths) {
      urls.push(`${base}${path}`);
    }
  }
  return urls;
}

function engineProbeUrls(): string[] {
  return uniqueUrls([
    process.env.ENGINE_MATH_URL,
    process.env.NEXT_PUBLIC_ENGINE_MATH_URL,
    "http://engine-math:8080",
    "http://127.0.0.1:8080",
    "http://localhost:8080",
  ].map((u) => `${u?.replace(/\/$/, "") ?? ""}/health`));
}

function detectRuntime(): Runtime {
  if (process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_PROJECT_ID) return "railway";
  if (process.env.RUNNING_IN_COMPOSE === "1") return "compose";
  const host = process.env.NAKAMA_HOST ?? "";
  if (host.includes("railway.internal")) return "railway";
  if (host.includes("backend-core") || host.includes("engine-math")) return "compose";
  return "local";
}

function publicUrl(domain?: string, fallback?: string): string {
  if (!domain) return fallback ?? "";
  if (domain.startsWith("http://") || domain.startsWith("https://")) return domain;
  return `https://${domain}`;
}

function downHint(id: string, error?: string, runtime?: Runtime): string | undefined {
  const refused = error?.includes("refused") || error?.includes("unreachable") || error?.includes("not reachable");
  if (!refused) return undefined;

  if (runtime === "railway") {
    const service =
      id === "nakama" ? "backend-core" : id === "engine-math" ? "engine-math" : "oddslingers";
    if (id === "oddslingers") {
      return "OddSlingers is optional and not deployed on Railway. Ignore unless you run it separately.";
    }
    return `Check Railway deploy for ${service}: railway logs --service ${service}. Redeploy via git push or railway up.`;
  }

  const where =
    runtime === "compose"
      ? "A sibling container is not running or not healthy yet."
      : "Service is not listening on the configured host.";

  if (id === "nakama") {
    return `${where} On Railway: redeploy backend-core. Locally: ./scripts/core-up.sh or see docs/DOCKER.md.`;
  }
  if (id === "oddslingers") {
    return `${where} OddSlingers is optional: ./scripts/oddslingers-up.sh (Docker only).`;
  }
  if (id === "engine-math") {
    return `${where} On Railway: redeploy engine-math. Locally: ./scripts/core-up.sh or see docs/DOCKER.md.`;
  }
  return undefined;
}

function runtimeNote(runtime: Runtime): string {
  if (runtime === "railway") {
    return "Running on Railway. Services talk over *.railway.internal; use Railway logs if a sibling is down.";
  }
  if (runtime === "compose") {
    return "Running inside Docker Compose. A service marked down means that container is not healthy yet.";
  }
  return "Running outside Compose; probes fall back to localhost. Deploy the full stack on Railway — see docs/RAILWAY.md.";
}

export async function GET() {
  const runtime = detectRuntime();
  const onRailway = runtime === "railway";

  const engine = await probeFirst(engineProbeUrls());
  const nakama = await probeFirst(nakamaProbeUrls());
  const oddslingers = await probeFirst(
    uniqueUrls([
      process.env.ODDSLINGERS_URL,
      process.env.NEXT_PUBLIC_ODDSLINGERS_URL,
      "http://oddslingers-nginx:80",
      "http://127.0.0.1:8888",
      "http://localhost:8888",
    ]),
  );

  const checks: ServiceStatus[] = [
    { id: "engine-math", name: "rs_poker engine-math", ...engine },
    { id: "nakama", name: "Nakama backend-core", ...nakama },
    { id: "oddslingers", name: "OddSlingers (Django)", ...oddslingers },
  ].map((svc) => ({
    ...svc,
    hint: svc.ok ? undefined : downHint(svc.id, svc.error, runtime),
  }));

  const coreOk = checks.filter((c) => c.id !== "oddslingers").every((c) => c.ok);
  const allOk = checks.every((c) => c.ok);

  const frontendBase = publicUrl(process.env.RAILWAY_PUBLIC_DOMAIN, "http://localhost:3000");
  const nakamaPublic = publicUrl(
    process.env.NEXT_PUBLIC_NAKAMA_HOST?.replace(/^https?:\/\//, ""),
    "http://localhost:7350",
  );
  const enginePublic = publicUrl(
    process.env.NEXT_PUBLIC_ENGINE_MATH_URL?.replace(/^https?:\/\//, ""),
    "http://localhost:8080",
  );

  return NextResponse.json({
    ok: coreOk,
    allOk,
    runtime: {
      mode: runtime,
      note: runtimeNote(runtime),
    },
    services: checks,
    live: {
      command_center: frontendBase,
      table: `${frontendBase.replace(/\/$/, "")}/table`,
      lobby: `${frontendBase.replace(/\/$/, "")}/lobby`,
      stack: `${frontendBase.replace(/\/$/, "")}/stack`,
      nakama_api: nakamaPublic,
      nakama_console: onRailway ? undefined : "http://localhost:7351",
      engine_math: `${enginePublic.replace(/\/$/, "")}/health`,
      oddslingers: process.env.NEXT_PUBLIC_ODDSLINGERS_URL ?? (onRailway ? undefined : "http://localhost:8888"),
    },
    boot: onRailway
      ? {
          docs: "docs/RAILWAY.md",
          logs_backend: "railway logs --service backend-core",
          logs_engine: "railway logs --service engine-math",
          logs_frontend: "railway logs --service frontend-table",
          redeploy: "git push (or railway up --service <name>)",
        }
      : {
          docs: runtime === "compose" ? "docs/DOCKER.md" : "docs/RAILWAY.md",
          core: "./scripts/core-up.sh",
          oddslingers: "./scripts/oddslingers-up.sh",
          doctor: "./scripts/doctor.sh",
          verify: "./scripts/stack-status.sh",
        },
    at: new Date().toISOString(),
  });
}
