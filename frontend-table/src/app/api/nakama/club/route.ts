import { NextResponse } from "next/server";

import { callNakamaRpc } from "@/lib/nakama/rpc";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const data = await callNakamaRpc("club_create", body);
    return NextResponse.json({ ok: true, data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Club creation failed";
    return NextResponse.json({ ok: false, error: message }, { status: 502 });
  }
}
