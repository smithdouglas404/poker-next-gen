import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MessageCircle } from "lucide-react";
import { useGame } from "@/features/game/GameProvider";

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
  const [isOpen, setIsOpen] = useState(false);
  const [cooldown, setCooldown] = useState(false);

  const onSend = useCallback(
    (emote: Emote) => {
      if (cooldown) return;
      void sendEmote(emote.id);
      setCooldown(true);
      setIsOpen(false);
      setTimeout(() => setCooldown(false), 3000);
    },
    [sendEmote, cooldown],
  );

  if (!matchId) return null;

  return (
    <div className="pointer-events-auto relative w-full max-w-xs">
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.9 }}
            className="glass mb-2 grid grid-cols-4 gap-1.5 rounded-xl p-2"
            style={{ border: "1px solid rgba(255,255,255,0.08)" }}
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
        className={`glass flex w-full items-center gap-2 rounded-2xl border border-white/10 bg-black/60 px-3 py-2 text-[11px] text-neutral-200 backdrop-blur-md transition ${isOpen ? "border-amber-400/50 text-amber-100" : "hover:border-amber-400/50 hover:bg-amber-400/10 hover:text-amber-100"} ${cooldown ? "opacity-50" : ""}`}
        disabled={cooldown}
      >
        <MessageCircle className="h-4 w-4" />
        Emotes
      </motion.button>
    </div>
  );
}
