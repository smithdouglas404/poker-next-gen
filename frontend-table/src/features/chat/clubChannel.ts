"use client";

// Club + global chat over Nakama's realtime channels.
//
// DELIBERATELY NOT THE TABLE. The felt's chat stays on the match socket
// (GameProvider, OpChatSend/OpChat) and must not be moved here: it is tied to
// match state and seat numbers, and taunts and emotes ride the same channel as
// printable markers. This module is for every chat that is NOT a hand of poker.
//
// Authorisation lives on the server, in two hooks, and it took both:
// `RegisterBeforeRt("ChannelJoin")` gates the join, and
// `RegisterBeforeListChannelMessages` gates the history — measured, a stranger
// refused the join could still read the whole history back, because the channel
// id is derivable from the club id and the REST list call never joins. Writing
// to a channel you have not joined is refused by Nakama itself.
//
// One socket, shared. `socket.onchannelmessage` is a single assignable property,
// not an event emitter, so two components each setting it would silently
// clobber each other — this module owns the handler and fans out.

import type { Session, Socket } from "@heroiclabs/nakama-js";

import { createNakamaClient } from "@/lib/nakama/client";
import { callSessionRpc, ensureNakamaSession } from "@/lib/nakama/sessionRpc";

/** Nakama channel type 1 = ROOM (addressed by name). */
const CHANNEL_ROOM = 1;

export interface ClubChatMessage {
  id: string;
  club_id: string;
  user_id: string;
  username: string;
  text: string;
  created_at: string;
}

type Listener = (m: ClubChatMessage) => void;

let socketPromise: Promise<Socket> | null = null;
/** channelId -> subscribers */
const listeners = new Map<string, Set<Listener>>();
/** clubId -> { channelId, refs } — so two panels on one club share a join. */
const joins = new Map<string, { channelId: string; refs: number }>();

/** channelId -> clubId, so a pushed message can be attributed without a lookup. */
const channelToClub = new Map<string, string>();

/**
 * `content` arrives as a JSON STRING over the socket and as a parsed OBJECT
 * from the REST history endpoint. Handling only one of them silently drops half
 * the messages, and the half it drops depends on how they got here.
 */
function decode(
  raw: {
    message_id?: string;
    sender_id?: string;
    username?: string;
    content?: string | object;
    create_time?: string;
    channel_id?: string;
  },
  clubId?: string,
): ClubChatMessage | null {
  let text = "";
  try {
    const c = (typeof raw.content === "string" ? JSON.parse(raw.content) : raw.content ?? {}) as {
      text?: string;
    };
    text = c.text ?? "";
  } catch {
    return null;
  }
  if (!text) return null;
  return {
    id: raw.message_id ?? `${raw.sender_id}-${raw.create_time}`,
    club_id: clubId ?? channelToClub.get(raw.channel_id ?? "") ?? "",
    user_id: raw.sender_id ?? "",
    username: raw.username || "Member",
    text,
    created_at: raw.create_time ?? new Date().toISOString(),
  };
}

async function getSocket(): Promise<Socket> {
  if (socketPromise) return socketPromise;
  socketPromise = (async () => {
    const client = createNakamaClient();
    const session: Session = await ensureNakamaSession();
    const socket = client.createSocket(client.useSSL, false);
    await socket.connect(session, true);
    socket.onchannelmessage = (m) => {
      const subs = listeners.get(m.channel_id ?? "");
      if (!subs || subs.size === 0) return;
      const msg = decode(m);
      if (msg) subs.forEach((fn) => fn(msg));
    };
    return socket;
  })().catch((e) => {
    // Let the next caller retry instead of caching a dead connection.
    socketPromise = null;
    throw e;
  });
  return socketPromise;
}

/**
 * Join a club's channel and return its id plus the backlog.
 *
 * History is the CHANNEL's history merged with whatever is still in
 * `poker_club_chat`. Messages written before the move live only in the old
 * table, and dropping them on cutover would silently delete a club's
 * conversation — so the legacy list is read once and merged by timestamp. New
 * messages are written to the channel only; nothing dual-writes.
 */
export async function joinClub(clubId: string): Promise<{ channelId: string; history: ClubChatMessage[] }> {
  const socket = await getSocket();
  const existing = joins.get(clubId);
  const channel = existing
    ? { id: existing.channelId }
    : await socket.joinChat(clubId, CHANNEL_ROOM, true, false);
  joins.set(clubId, { channelId: channel.id, refs: (existing?.refs ?? 0) + 1 });
  channelToClub.set(channel.id, clubId);

  const session = await ensureNakamaSession();
  const client = createNakamaClient();

  const [live, legacy] = await Promise.allSettled([
    client.listChannelMessages(session, channel.id, 50, false),
    callSessionRpc("club_chat_list", { club_id: clubId, limit: 50 }) as Promise<{
      messages?: ClubChatMessage[];
    }>,
  ]);

  const fromChannel =
    live.status === "fulfilled"
      ? (live.value.messages ?? [])
          .map((m) => decode(m, clubId))
          .filter((m): m is ClubChatMessage => m !== null)
      : [];
  const fromLegacy = legacy.status === "fulfilled" ? (legacy.value.messages ?? []) : [];

  const history = [...fromChannel, ...fromLegacy]
    .filter((m, i, all) => all.findIndex((x) => x.id === m.id) === i)
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

  return { channelId: channel.id, history };
}

export function subscribe(channelId: string, fn: Listener): () => void {
  const set = listeners.get(channelId) ?? new Set<Listener>();
  set.add(fn);
  listeners.set(channelId, set);
  return () => {
    set.delete(fn);
    if (set.size === 0) listeners.delete(channelId);
  };
}

/** Release one reference; the channel is left only when nobody is watching. */
export async function leaveClub(clubId: string): Promise<void> {
  const j = joins.get(clubId);
  if (!j) return;
  j.refs -= 1;
  if (j.refs > 0) return;
  joins.delete(clubId);
  channelToClub.delete(j.channelId);
  try {
    const socket = await getSocket();
    await socket.leaveChat(j.channelId);
  } catch {
    /* the socket may already be gone */
  }
}

export async function sendToClub(clubId: string, text: string): Promise<void> {
  const j = joins.get(clubId);
  if (!j) throw new Error("not joined to this club's chat");
  const socket = await getSocket();
  await socket.writeChatMessage(j.channelId, { text });
}
