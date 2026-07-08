import { NextResponse } from "next/server";

/**
 * Server-side proxy to the openproject-mcp service management API. Keeps the
 * admin bearer token out of the browser. The service base URL and token come
 * from server env only.
 *
 *   OPENPROJECT_MCP_SERVICE_URL   e.g. http://openproject-mcp.railway.internal:8090
 *   OPENPROJECT_MCP_ADMIN_TOKEN   shared bearer token
 */
type RouteContext = { params: Promise<{ path: string[] }> };

function serviceBase(): string {
  return (
    process.env.OPENPROJECT_MCP_SERVICE_URL ??
    process.env.NEXT_PUBLIC_OPENPROJECT_MCP_SERVICE_URL ??
    "http://localhost:8090"
  ).replace(/\/$/, "");
}

async function forward(request: Request, context: RouteContext, method: string): Promise<NextResponse> {
  const { path } = await context.params;
  const token = process.env.OPENPROJECT_MCP_ADMIN_TOKEN;
  if (!token) {
    return NextResponse.json(
      { ok: false, error: "OPENPROJECT_MCP_ADMIN_TOKEN is not configured on the server" },
      { status: 503 },
    );
  }

  const url = `${serviceBase()}/api/${path.join("/")}`;
  const init: RequestInit = {
    method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(120_000),
  };
  if (method === "PUT" || method === "POST") {
    const body = await request.text();
    if (body) init.body = body;
  }

  try {
    const res = await fetch(url, init);
    const text = await res.text();
    const data = text ? JSON.parse(text) : {};
    return NextResponse.json(data, { status: res.status });
  } catch (error) {
    const message = error instanceof Error ? error.message : "request failed";
    return NextResponse.json({ ok: false, error: `openproject-mcp unreachable: ${message}` }, { status: 502 });
  }
}

export function GET(request: Request, context: RouteContext) {
  return forward(request, context, "GET");
}

export function PUT(request: Request, context: RouteContext) {
  return forward(request, context, "PUT");
}

export function POST(request: Request, context: RouteContext) {
  return forward(request, context, "POST");
}
