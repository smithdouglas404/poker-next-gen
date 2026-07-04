import { NextResponse } from "next/server";

import { callNakamaRpc } from "@/lib/nakama/rpc";

export async function POST() {
  try {
    const data = await callNakamaRpc("healthz");
    return NextResponse.json({ ok: true, data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Backend unreachable";
    return NextResponse.json({ ok: false, error: message }, { status: 502 });
  }
}
