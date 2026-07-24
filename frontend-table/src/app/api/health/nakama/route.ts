import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    host: process.env.NEXT_PUBLIC_NAKAMA_HOST,
    serverKey: process.env.NEXT_PUBLIC_NAKAMA_SERVER_KEY,
    timestamp: new Date().toISOString(),
  });
}
