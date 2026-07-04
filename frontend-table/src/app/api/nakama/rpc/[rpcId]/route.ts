import { NextResponse } from "next/server";

import { callNakamaRpc } from "@/lib/nakama/rpc";

type RouteContext = { params: Promise<{ rpcId: string }> };

export async function POST(request: Request, context: RouteContext) {
  const { rpcId } = await context.params;
  try {
    const body = await request.json().catch(() => ({}));
    const authHeader = request.headers.get("authorization");
    const payload = body.payload ?? body;

    let data: unknown;
    if (authHeader?.startsWith("Bearer ")) {
      const host = process.env.NAKAMA_HOST ?? process.env.NEXT_PUBLIC_NAKAMA_HOST ?? "http://localhost:7350";
      const response = await fetch(`${host}/v2/rpc/${rpcId}`, {
        method: "POST",
        headers: {
          Authorization: authHeader,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(typeof payload === "string" ? payload : JSON.stringify(payload)),
        cache: "no-store",
      });
      const text = await response.text();
      if (!response.ok) {
        throw new Error(text);
      }
      const parsed = JSON.parse(text) as { payload?: string };
      data = parsed.payload ? JSON.parse(parsed.payload) : parsed;
    } else {
      data = await callNakamaRpc(rpcId, payload);
    }

    return NextResponse.json({ ok: true, data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "RPC failed";
    return NextResponse.json({ ok: false, error: message }, { status: 502 });
  }
}
