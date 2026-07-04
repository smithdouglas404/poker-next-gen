import { NextResponse } from "next/server";

import { callNakamaRpc } from "@/lib/nakama/rpc";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const data = await callNakamaRpc("table_create", {
      name: body.name ?? "Hold'em Table",
      small_blind: body.small_blind ?? 100,
      big_blind: body.big_blind ?? 200,
      buy_in: body.buy_in ?? 100000,
    });
    return NextResponse.json({ ok: true, data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Create table failed";
    return NextResponse.json({ ok: false, error: message }, { status: 502 });
  }
}
