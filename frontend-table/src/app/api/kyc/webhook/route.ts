import crypto from "crypto";

import { NextResponse } from "next/server";

import { callNakamaRpc } from "@/lib/nakama/rpc";

// Didit KYC webhook receiver. Verifies the HMAC-SHA256 X-Signature-Simple over
// "session_id|status|created_at" with DIDIT_WEBHOOK_SECRET, then applies the
// result server-to-server via the secret-protected kyc_apply RPC. Inactive until
// DIDIT_WEBHOOK_SECRET is set.
export async function POST(request: Request) {
  const secret = process.env.DIDIT_WEBHOOK_SECRET ?? "";
  if (!secret) {
    return NextResponse.json({ ok: false, error: "kyc not configured" }, { status: 503 });
  }

  const raw = await request.text();
  const signature = (request.headers.get("x-signature-simple") ?? "").toLowerCase();

  let body: Record<string, unknown> = {};
  try {
    body = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "bad payload" }, { status: 400 });
  }

  const sessionId = String(body.session_id ?? "");
  const status = String(body.status ?? "");
  const createdAt = String(body.created_at ?? "");
  const vendorData = String(body.vendor_data ?? "");

  const expected = crypto
    .createHmac("sha256", secret)
    .update(`${sessionId}|${status}|${createdAt}`)
    .digest("hex");

  const valid =
    signature.length === expected.length &&
    crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  if (!valid) {
    return NextResponse.json({ ok: false, error: "bad signature" }, { status: 401 });
  }

  if (!vendorData) {
    return NextResponse.json({ ok: true, note: "no vendor_data" });
  }

  try {
    await callNakamaRpc("kyc_apply", {
      session_id: sessionId,
      user_id: vendorData,
      status,
      secret: process.env.KYC_APPLY_SECRET || secret,
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "apply failed" },
      { status: 502 },
    );
  }

  return NextResponse.json({ ok: true });
}
