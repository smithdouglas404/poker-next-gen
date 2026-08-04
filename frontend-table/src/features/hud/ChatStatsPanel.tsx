"use client";

// Bottom-left floating chat panel — mirrors HandHistoryPanel's top-left
// collapsible pill pattern so the left rail is populated on both corners
// (the legacy sidebar ChatPanel got hidden behind `{!demo && (...)}` in
// TableHud.tsx when the top-left was cleared for HandHistoryPanel, leaving
// the bottom-left empty). Real mode reuses the same `useGame()` chat state
// ChatPanel.tsx already binds to — no new RPCs, just a different shell.

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";

import { useGame } from "@/features/game/GameProvider";
import { DEMO_SNAPSHOT } from "@/features/table3d/demoSnapshot";

// ?demo=1 has no live socket, so chatMessages never arrives — this mirrors
// HandHistoryPanel's DEMO_GROUPS approach so the panel has something
// real-looking to show in headless verification.
const DEMO_MESSAGES = [
  { username: "Shadow King", text: "nice hand", isHero: false, dealer: false },
  { username: "Red Wolf", text: "gg", isHero: false, dealer: false },
  { username: "You", text: "thanks", isHero: true, dealer: false },
];

export function ChatStatsPanel() {
  const { chatMessages, sendChat, profile, matchId } = useGame();
  const demo = useSearchParams().get("demo") === "1";
  const [open, setOpen] = useState(true);
  const [draft, setDraft] = useState("");
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [chatMessages]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // Substitute the DATA (the match id), not the visibility rule. In ?demo=1
  // there IS a table — DEMO_SNAPSHOT, whose match_id is "demo-match" — so the
  // guard below is byte-identical on both pages. This used to read
  // `if (!matchId && !demo) return null`, a VISIBILITY branch: chat appeared in
  // the preview and vanished on /table, which is why the owner asked where his
  // chat had gone. See check:table's demo-is-data-only rule.
  const tableId = demo ? DEMO_SNAPSHOT.match_id : matchId;
  if (!tableId) return null;

  const submit = () => {
    const text = draft.trim();
    if (!text || demo) return;
    void sendChat(text);
    setDraft("");
  };

  const displayMessages = demo
    ? DEMO_MESSAGES
    : chatMessages.map((msg) => ({
        username: msg.kind === "dealer" ? "" : msg.username,
        text: msg.text,
        isHero: msg.kind !== "dealer" && msg.user_id !== "" && msg.user_id === profile.userId,
        dealer: msg.kind === "dealer",
      }));

  return (
    <div style={{ position: "absolute", left: 20, bottom: 20, pointerEvents: "auto" }}>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, x: -12, height: 0 }}
            animate={{ opacity: 1, x: 0, height: "auto" }}
            exit={{ opacity: 0, x: -12, height: 0 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            style={{
              position: "absolute", bottom: 30, left: 0,
              width: 220, maxHeight: 230, borderRadius: 10,
              background: "rgba(15,23,42,0.72)", backdropFilter: "blur(10px)",
              border: "1px solid #2AC6D0", overflow: "hidden",
              display: "flex", flexDirection: "column",
            }}
          >
            <ul
              ref={listRef}
              style={{ flex: 1, overflowY: "auto", maxHeight: 170, margin: 0, listStyle: "none", padding: "8px 8px 4px" }}
            >
              {displayMessages.length === 0 && (
                <li style={{ fontSize: 11, color: "#94A3B8" }}>No messages yet — say hello.</li>
              )}
              {displayMessages.map((m, i) => (
                <li key={i} style={{ marginBottom: 6, fontSize: 11 }}>
                  {m.dealer ? (
                    <span style={{ color: "#f5c518", fontStyle: "italic" }}>{m.text}</span>
                  ) : (
                    <>
                      <div
                        style={{
                          fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em",
                          color: m.isHero ? "#22c55e" : "#4DEEEA",
                        }}
                      >
                        {m.username}
                      </div>
                      <div style={{ color: "#fff", lineHeight: 1.3 }}>{m.text}</div>
                    </>
                  )}
                </li>
              ))}
            </ul>
            <div style={{ display: "flex", gap: 6, borderTop: "1px solid rgba(42,198,208,0.25)", padding: 6 }}>
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
                placeholder={demo ? "Chat (live only)" : "Message…"}
                disabled={demo || !matchId}
                maxLength={280}
                style={{
                  flex: 1, borderRadius: 6, border: "1px solid rgba(255,255,255,0.1)",
                  background: "rgba(0,0,0,0.4)", color: "#fff", fontSize: 11, padding: "4px 6px",
                }}
              />
              <button
                type="button"
                onClick={submit}
                disabled={demo || !matchId || draft.trim() === ""}
                style={{
                  borderRadius: 6, background: "#e01e2b", color: "#fff", fontSize: 10,
                  fontWeight: 700, padding: "0 10px", border: "none", cursor: "pointer",
                  opacity: demo || !matchId || draft.trim() === "" ? 0.4 : 1,
                }}
              >
                Send
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        style={{
          display: "flex", alignItems: "center", gap: 5, height: 24, padding: "0 9px",
          borderRadius: 999, border: "1px solid #2AC6D0", background: "rgba(15,23,42,0.72)",
          backdropFilter: "blur(10px)", color: "#4DEEEA", fontSize: 10, fontWeight: 700,
          letterSpacing: "0.16em", textTransform: "uppercase", cursor: "pointer",
        }}
      >
        <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#1CB5C9",
          boxShadow: "0 0 8px rgba(28,181,201,0.9)" }} />
        Chat
        <span style={{ opacity: 0.7 }}>{open ? "›" : "‹"}</span>
      </button>
    </div>
  );
}
