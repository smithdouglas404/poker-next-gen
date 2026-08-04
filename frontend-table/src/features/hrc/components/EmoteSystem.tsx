import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MessageCircle } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useGame } from "@/features/game/GameProvider";
import { DEMO_SNAPSHOT } from "@/features/table3d/demoSnapshot";

export interface Emote {
  id: string;
  emoji: string;
  label: string;
  color: string;
  imageUrl?: string;
}

export const EMOTES: Emote[] = [
  { id: "gg", emoji: "\ud83c\udfae", label: "GG", color: "#d4af37", imageUrl: "/emotes/emote_gg.webp" },
  { id: "nice", emoji: "\ud83d\udc4f", label: "Nice Hand", color: "#ffd700", imageUrl: "/emotes/emote_nice.webp" },
  { id: "bluff", emoji: "\ud83e\udd14", label: "Bluff?", color: "#d4af37", imageUrl: "/emotes/emote_bluff.webp" },
  { id: "allin", emoji: "\ud83d\ude80", label: "All In!", color: "#ff3366", imageUrl: "/emotes/emote_allin.webp" },
  { id: "gl", emoji: "\ud83c\udf40", label: "Good Luck", color: "#22c55e", imageUrl: "/emotes/emote_gl.webp" },
  { id: "think", emoji: "\ud83e\udde0", label: "Hmm...", color: "#b44dff", imageUrl: "/emotes/emote_think.webp" },
  { id: "wow", emoji: "\ud83d\ude32", label: "Wow!", color: "#f59e0b", imageUrl: "/emotes/emote_wow.webp" },
  { id: "cry", emoji: "\ud83d\ude2d", label: "Bad Beat", color: "#6b7280", imageUrl: "/emotes/emote_cry.webp" },
];

export const EMOTE_MAP = new Map(EMOTES.map(e => [e.id, e]));

interface EmoteBubbleData {
  id: number;
  playerId: string;
  emote: Emote;
  timestamp: number;
}

// Global emote state
let emoteListeners: ((bubble: EmoteBubbleData) => void)[] = [];
let emoteCounter = 0;

export function triggerEmote(playerId: string, emote: Emote) {
  const bubble: EmoteBubbleData = {
    id: emoteCounter++,
    playerId,
    emote,
    timestamp: Date.now(),
  };
  emoteListeners.forEach(l => l(bubble));
}

// Floating emote bubble that appears above a player
export function EmoteBubble({ playerId }: { playerId: string }) {
  const [bubbles, setBubbles] = useState<EmoteBubbleData[]>([]);

  useEffect(() => {
    const listener = (bubble: EmoteBubbleData) => {
      if (bubble.playerId === playerId) {
        setBubbles(prev => [...prev, bubble]);
        setTimeout(() => {
          setBubbles(prev => prev.filter(b => b.id !== bubble.id));
        }, 2500);
      }
    };
    emoteListeners.push(listener);
    return () => { emoteListeners = emoteListeners.filter(l => l !== listener); };
  }, [playerId]);

  return (
    <AnimatePresence>
      {bubbles.map(b => (
        <motion.div
          key={b.id}
          initial={{ opacity: 0, y: 10, scale: 0.5 }}
          animate={{ opacity: 1, y: -50, scale: 1 }}
          exit={{ opacity: 0, y: -80, scale: 0.5 }}
          transition={{ duration: 0.4, type: "spring" }}
          className="absolute -top-12 left-1/2 -translate-x-1/2 z-[60] pointer-events-none"
        >
          <div
            className="glass rounded-xl px-3 py-2 flex flex-col items-center gap-1 whitespace-nowrap"
            style={{
              border: `1px solid ${b.emote.color}40`,
              boxShadow: `0 0 20px ${b.emote.color}30`,
            }}
          >
            {b.emote.imageUrl
              ? <motion.img
                  src={b.emote.imageUrl}
                  alt={b.emote.label}
                  className="w-12 h-12 rounded-md object-cover"
                  initial={{ rotate: -10, scale: 0.8 }}
                  animate={{ rotate: [0, 5, -5, 0], scale: [1, 1.1, 1] }}
                  transition={{ duration: 0.6, ease: "easeInOut" }}
                />
              : <span className="text-3xl">{b.emote.emoji}</span>
            }
            <span className="text-[0.625rem] font-bold" style={{ color: b.emote.color }}>{b.emote.label}</span>
          </div>
        </motion.div>
      ))}
    </AnimatePresence>
  );
}

// Emote picker tray — sends a real reaction over the live match's chat
// channel (GameProvider.sendEmote, ::emote:<id>:: marker, same transport
// taunts use). The bubble for OUR OWN emote appears from the server's
// broadcast echo, same as every other player's — no local optimistic
// trigger, so there's exactly one bubble per emote, never two.
export function EmotePicker() {
  const { sendEmote, matchId } = useGame();
  const demo = useSearchParams().get("demo") === "1";
  const [isOpen, setIsOpen] = useState(false);
  const [cooldown, setCooldown] = useState(false);

  // Substitute the DATA (the match id), never the guard — ?demo=1 has a table
  // (DEMO_SNAPSHOT), so the `if (!tableId)` below is identical on both pages
  // and a demo screenshot actually shows where this control sits. Same pattern
  // as ChatStatsPanel/HandHistoryPanel; see check:table's demo-is-data-only.
  const tableId = demo ? DEMO_SNAPSHOT.match_id : matchId;

  const onSend = useCallback(
    (emote: Emote) => {
      if (cooldown) return;
      // No socket behind ?demo=1 — open/close and cool down, send nothing.
      if (!demo) void sendEmote(emote.id);
      setCooldown(true);
      setIsOpen(false);
      setTimeout(() => setCooldown(false), 3000);
    },
    [sendEmote, cooldown, demo],
  );

  if (!tableId) return null;

  // `relative` anchors the popup; no fixed width. This used to be
  // `w-full max-w-xs`, sized for the stacked left-hand panel column — which is
  // no longer mounted (SHOW_LEFT_PANEL_COLUMN). It now sits in
  // HeroControlsDock's horizontal row, where a 320px block would dwarf EXTEND /
  // ADD CHIPS / SIT OUT / EXIT beside it.
  return (
    <div className="pointer-events-auto relative">
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.9 }}
            // ABSOLUTE, not in flow. With `mb-2` alone the tray occupied real
            // layout space inside HeroControlsDock's flex row: it made the
            // picker two rows tall, dropped the "Emotes" button below EXTEND /
            // ADD CHIPS / SIT OUT / EXIT, and shoved the whole action bar
            // ~170px up the felt. Measured in ?demo=1 at 1600x1000. Anchored
            // to the `relative` wrapper, it now floats above the row and
            // changes nothing else on screen.
            className="glass absolute bottom-full left-1/2 z-50 mb-2 grid w-max -translate-x-1/2 grid-cols-4 gap-1.5 rounded-xl p-2"
            style={{ border: "1px solid rgba(255,255,255,0.08)", background: "#262d38" }}
          >
            {EMOTES.map(emote => (
              <motion.button
                key={emote.id}
                whileHover={{ scale: 1.15 }}
                whileTap={{ scale: 0.9 }}
                onClick={() => onSend(emote)}
                disabled={cooldown}
                className="flex flex-col items-center gap-0.5 rounded-lg p-2 transition-colors hover:bg-white/5 disabled:opacity-50"
                title={emote.label}
              >
                {emote.imageUrl
                  ? <img src={emote.imageUrl} alt={emote.label} className="h-10 w-10 rounded-md object-cover" />
                  : <span className="text-xl">{emote.emoji}</span>
                }
                <span className="text-[0.5rem] text-gray-500 font-bold">{emote.label}</span>
              </motion.button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      <motion.button
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        // Matches the dock's other controls: GLASS_PANEL + px-3 py-1.5 text-xs
        // on #262d38, so the row reads as one set of buttons.
        className={`flex items-center gap-2 rounded-2xl border px-3 py-1.5 text-xs backdrop-blur-md transition ${isOpen ? "border-gold/50 text-gold" : "border-white/12 text-neutral-300 hover:border-white/25"} ${cooldown ? "opacity-50" : ""}`}
        style={{ background: "#262d38" }}
        disabled={cooldown}
      >
        <MessageCircle className="h-4 w-4" />
        Emotes
      </motion.button>
    </div>
  );
}
