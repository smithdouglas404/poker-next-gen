"use client";

import { useEffect, useRef, useState } from "react";

import { useGame } from "@/features/game/GameProvider";

export function ChatPanel() {
  const { chatMessages, sendChat, profile, matchId } = useGame();
  const [draft, setDraft] = useState("");
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [chatMessages]);

  const submit = () => {
    const text = draft.trim();
    if (!text) return;
    void sendChat(text);
    setDraft("");
  };

  return (
    <aside className="pointer-events-auto flex max-h-72 w-full max-w-xs flex-col rounded-2xl border border-white/10 bg-black/60 backdrop-blur-md">
      <div className="border-b border-white/10 px-4 py-3">
        <p className="text-xs uppercase tracking-[0.25em] text-amber-300/80">Table Chat</p>
      </div>
      <ul ref={listRef} className="flex-1 overflow-y-auto px-3 py-2 text-xs">
        {chatMessages.length === 0 && (
          <li className="text-neutral-500">No messages yet — say hello.</li>
        )}
        {chatMessages.map((msg, i) => {
          if (msg.kind === "dealer") {
            return (
              <li key={i} className="mb-1.5 px-1 italic text-amber-200/70">
                {msg.text}
              </li>
            );
          }
          const isHero = msg.user_id !== "" && msg.user_id === profile.userId;
          return (
            <li
              key={i}
              className={`mb-1.5 flex flex-col ${isHero ? "items-end text-right" : "items-start"}`}
            >
              <span
                className={`text-[10px] font-semibold uppercase tracking-wide ${
                  isHero ? "text-emerald-300" : "text-sky-300"
                }`}
              >
                {msg.username}
              </span>
              <span
                className={`max-w-[85%] rounded-lg px-2 py-1 ${
                  isHero ? "bg-emerald-950/40 text-emerald-100" : "bg-white/5 text-neutral-100"
                }`}
              >
                {msg.text}
              </span>
            </li>
          );
        })}
      </ul>
      <div className="flex items-center gap-2 border-t border-white/10 px-3 py-2">
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              submit();
            }
          }}
          placeholder={matchId ? "Type a message…" : "Join a table to chat"}
          disabled={!matchId}
          maxLength={280}
          className="flex-1 rounded-lg border border-white/10 bg-black/50 px-2 py-1.5 text-xs text-white placeholder:text-neutral-600 focus:border-amber-400/50 focus:outline-none disabled:opacity-50"
        />
        <button
          type="button"
          onClick={submit}
          disabled={!matchId || draft.trim() === ""}
          className="rounded-lg bg-amber-500/80 px-3 py-1.5 text-xs font-semibold text-black transition hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Send
        </button>
      </div>
    </aside>
  );
}
