// Notification reads go straight through the Nakama client.
//
// `listNotifications` / `deleteNotifications` are built into
// @heroiclabs/nakama-js (client.d.ts), so the inbox needs no backend RPC of its
// own — the server side is just the sends already issued by
// club_announcement_create and announcement_create.

import { createNakamaClient } from "@/lib/nakama/client";
import { ensureNakamaSession } from "@/lib/nakama/sessionRpc";

/** Nakama notification codes this app issues. */
export const NOTIFICATION_CODE = {
  /** Platform-wide announcement (rpc/aiproc.go). */
  platformAnnouncement: 555,
  /** Club announcement (rpc/clubs_ext.go). Distinct so the two are tellable apart. */
  clubAnnouncement: 556,
  /**
   * Club invitation (rpc/clubs_ext.go). Its own code because it is ACTIONABLE —
   * the recipient accepts or declines — where the announcement codes are read-only.
   */
  clubInvite: 557,
} as const;

export interface AppNotification {
  id: string;
  subject: string;
  /** Parsed `content` payload; shape varies by code. */
  content: Record<string, unknown>;
  code: number;
  createTime?: string;
  /** Convenience accessors for the announcement codes. */
  body: string;
  severity: "info" | "warning" | "critical";
  clubName?: string;
}

function asSeverity(v: unknown): AppNotification["severity"] {
  return v === "warning" || v === "critical" ? v : "info";
}

function normalize(raw: {
  id?: string;
  subject?: string;
  content?: unknown;
  code?: number;
  create_time?: string;
}): AppNotification {
  // Nakama returns `content` as an object on the JS client, but be defensive —
  // a string payload must not throw and blank the whole inbox.
  let content: Record<string, unknown> = {};
  if (typeof raw.content === "string") {
    try {
      content = JSON.parse(raw.content) as Record<string, unknown>;
    } catch {
      content = {};
    }
  } else if (raw.content && typeof raw.content === "object") {
    content = raw.content as Record<string, unknown>;
  }
  return {
    id: raw.id ?? "",
    subject: raw.subject ?? "",
    content,
    code: raw.code ?? 0,
    createTime: raw.create_time,
    body: typeof content.body === "string" ? content.body : "",
    severity: asSeverity(content.severity),
    clubName: typeof content.club_name === "string" ? content.club_name : undefined,
  };
}

export async function listNotifications(limit = 25): Promise<AppNotification[]> {
  const client = createNakamaClient();
  const session = await ensureNakamaSession();
  const res = await client.listNotifications(session, limit);
  return (res.notifications ?? []).map(normalize);
}

export async function dismissNotifications(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const client = createNakamaClient();
  const session = await ensureNakamaSession();
  await client.deleteNotifications(session, ids);
}
