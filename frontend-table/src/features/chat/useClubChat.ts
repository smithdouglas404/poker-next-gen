"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { joinClub, leaveClub, sendToClub, subscribe, type ClubChatMessage } from "./clubChannel";

export interface ClubChat {
  messages: ClubChatMessage[];
  /** The channel is joined and pushing. False means the rail is showing history only. */
  live: boolean;
  /** Server refused the join, or the socket is down. Rendered, never swallowed. */
  error: string | null;
  send: (text: string) => Promise<void>;
}

/**
 * Club chat for any surface that is not the felt.
 *
 * Replaces a 5s poll of `club_chat_list`. Two things make that worth doing here
 * and not on the table: the operator rails are open all day (measured ~13
 * requests/min per open page, idle or not), and a channel brings history
 * pagination, moderation and presence that the RPC pair never had.
 *
 * `error` is surfaced rather than swallowed. The polled version caught and
 * discarded every failure, which is precisely how a rail froze on stale
 * messages for minutes with nothing on screen to say so.
 */
export function useClubChat(clubId: string | null | undefined, enabled = true): ClubChat {
  const [messages, setMessages] = useState<ClubChatMessage[]>([]);
  const [live, setLive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const joinedFor = useRef<string | null>(null);

  useEffect(() => {
    if (!enabled || !clubId) {
      setMessages([]);
      setLive(false);
      return;
    }
    let cancelled = false;
    let unsubscribe: (() => void) | null = null;

    void (async () => {
      try {
        const { channelId, history } = await joinClub(clubId);
        if (cancelled) {
          void leaveClub(clubId);
          return;
        }
        joinedFor.current = clubId;
        setMessages(history);
        setError(null);
        setLive(true);
        unsubscribe = subscribe(channelId, (m) => {
          // The sender sees their own message echoed back by the server, so
          // there is no optimistic copy to reconcile — and therefore no way for
          // the rail to disagree with what everyone else sees.
          setMessages((prev) => (prev.some((p) => p.id === m.id) ? prev : [...prev, m]));
        });
      } catch (e) {
        if (cancelled) return;
        setLive(false);
        setError(e instanceof Error ? e.message : "Could not join club chat");
      }
    })();

    return () => {
      cancelled = true;
      unsubscribe?.();
      if (joinedFor.current === clubId) {
        joinedFor.current = null;
        void leaveClub(clubId);
      }
    };
  }, [clubId, enabled]);

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || !clubId) return;
      await sendToClub(clubId, trimmed);
    },
    [clubId],
  );

  return { messages, live, error, send };
}
