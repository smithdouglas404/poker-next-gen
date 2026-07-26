import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Megaphone, Lock, Crown, Sparkles } from "lucide-react";
import { wsClient } from "@/lib/ws-client";

// ─── Taunt Definitions ─────────────────────────────────────────────────────

export interface Taunt {
  id: string;
  text: string;
  category: "free" | "premium";
  rarity: "common" | "uncommon" | "rare" | "epic" | "legendary";
  price?: number;
  visualEffect?: string;
}

export const FREE_TAUNTS: Taunt[] = [
  { id: "gg", text: "Good game!", category: "free", rarity: "common" },
  { id: "nice-hand", text: "Nice hand!", category: "free", rarity: "common" },
  { id: "gl", text: "Good luck!", category: "free", rarity: "common" },
  { id: "well-played", text: "Well played", category: "free", rarity: "common" },
  { id: "thats-poker", text: "That's poker, baby!", category: "free", rarity: "common" },
  { id: "nice-try", text: "Nice try!", category: "free", rarity: "common" },
  { id: "i-smell-bluff", text: "I smell a bluff...", category: "free", rarity: "common" },
  { id: "hmm", text: "Hmm... interesting", category: "free", rarity: "common" },
  { id: "patience", text: "Patience pays off", category: "free", rarity: "common" },
  { id: "bad-beat", text: "Brutal bad beat", category: "free", rarity: "common" },
  { id: "lets-go", text: "Let's gooo!", category: "free", rarity: "common" },
  { id: "fold-pre", text: "Should've folded pre", category: "free", rarity: "common" },
];

export const PREMIUM_TAUNTS: Taunt[] = [
  { id: "ship-it", text: "Ship it!", category: "premium", rarity: "uncommon", price: 500, visualEffect: "gold-cascade" },
  { id: "easy-money", text: "Easy money", category: "premium", rarity: "uncommon", price: 500, visualEffect: "dollar-float" },
  { id: "pay-me", text: "Pay me.", category: "premium", rarity: "rare", price: 1000, visualEffect: "chips-slide" },
  { id: "own-table", text: "I own this table", category: "premium", rarity: "rare", price: 1000, visualEffect: "crown" },
  { id: "read-you", text: "Read you like a book", category: "premium", rarity: "rare", price: 1000, visualEffect: "book-flip" },
  { id: "drawing-dead", text: "You're drawing dead", category: "premium", rarity: "epic", price: 2500, visualEffect: "skull" },
  { id: "run-it", text: "Run it twice? I don't need to", category: "premium", rarity: "epic", price: 2500, visualEffect: "dice-roll" },
  { id: "the-nuts", text: "The nuts, baby!", category: "premium", rarity: "epic", price: 2500, visualEffect: "nut-explosion" },
  { id: "call-clock", text: "Call the clock!", category: "premium", rarity: "uncommon", price: 750, visualEffect: "timer" },
  { id: "crying-call", text: "That's a crying call", category: "premium", rarity: "rare", price: 1000, visualEffect: "teardrop" },
  { id: "grandma", text: "My grandma plays better", category: "premium", rarity: "legendary", price: 5000, visualEffect: "grandma" },
  { id: "reload", text: "Time to reload", category: "premium", rarity: "uncommon", price: 500, visualEffect: "reload" },
  { id: "math", text: "I did the math", category: "premium", rarity: "rare", price: 1000, visualEffect: "calculator" },
  { id: "scared-money", text: "Scared money don't make money", category: "premium", rarity: "epic", price: 2500, visualEffect: "money-wings" },
  { id: "all-day", text: "I can do this all day", category: "premium", rarity: "legendary", price: 5000, visualEffect: "infinity" },
  { id: "respect", text: "Respect the raise", category: "premium", rarity: "rare", price: 1000, visualEffect: "bow" },
];

export const ALL_TAUNTS = [...FREE_TAUNTS, ...PREMIUM_TAUNTS];
export const TAUNT_MAP = new Map(ALL_TAUNTS.map(t => [t.id, t]));

const RARITY_COLORS: Record<string, string> = {
  common: "#9ca3af",
  uncommon: "#22c55e",
  rare: "#d4af37",
  epic: "#a855f7",
  legendary: "#f59e0b",
};

const RARITY_BORDER: Record<string, string> = {
  common: "rgba(156,163,175,0.15)",
  uncommon: "rgba(34,197,94,0.25)",
  rare: "rgba(212,175,55,0.30)",
  epic: "rgba(168,85,247,0.30)",
  legendary: "rgba(245,158,11,0.40)",
};

const RARITY_GLOW: Record<string, string> = {
  common: "none",
  uncommon: "0 0 8px rgba(34,197,94,0.15)",
  rare: "0 0 12px rgba(212,175,55,0.20)",
  epic: "0 0 15px rgba(168,85,247,0.25)",
  legendary: "0 0 20px rgba(245,158,11,0.35)",
};

// ─── Taunt Bubble Data (parallel to EmoteBubbleData) ────────────────────────

export interface TauntBubbleData {
  id: number;
  playerId: string;
  taunt: Taunt;
  timestamp: number;
}

let tauntListeners: ((bubble: TauntBubbleData) => void)[] = [];
let tauntCounter = 0;

// Voice preference for taunt audio. Default = "default" (confident voice).
// Can be set to an avatar ID for avatar-specific voice.
let currentTauntVoice = "default";

export function setTauntVoice(voice: string) {
  currentTauntVoice = voice || "default";
}

export function getTauntVoice(): string {
  return currentTauntVoice;
}

// Available taunt voices for the voice picker UI
export const TAUNT_VOICE_OPTIONS: { id: string; label: string; description: string }[] = [
  { id: "default", label: "Confident", description: "Deep, energetic, cocky — the default" },
  { id: "neon-viper", label: "Husky Trickster", description: "Raspy and sly" },
  { id: "chrome-siren", label: "Playful Siren", description: "Bright and teasing" },
  { id: "gold-phantom", label: "Captivating Phantom", description: "Warm and dramatic" },
  { id: "shadow-king", label: "Deep Shadow", description: "Dark and resonant" },
  { id: "red-wolf", label: "Fierce Wolf", description: "Intense and fierce" },
  { id: "ice-queen", label: "Ice Queen", description: "Cool and confident" },
  { id: "tech-monk", label: "Wise Monk", description: "Calm and measured" },
  { id: "cyber-punk", label: "Punk Energy", description: "Wild and electric" },
  { id: "steel-ghost", label: "Steel Broadcaster", description: "Steady and authoritative" },
  { id: "neon-fox", label: "Charming Fox", description: "Smooth and charming" },
  { id: "dark-ace", label: "Smooth Ace", description: "Cool and trustworthy" },
  { id: "bolt-runner", label: "Laid-Back Runner", description: "Casual and relaxed" },
];

// Play taunt audio from /sounds/taunts/{voice}/{id}.mp3
// Falls back to /sounds/taunts/{id}.mp3 for backward compat
function playTauntAudio(tauntId: string) {
  try {
    const voice = currentTauntVoice;
    const primary = `/sounds/taunts/${voice}/${tauntId}.mp3`;
    const fallback = `/sounds/taunts/${tauntId}.mp3`;

    const audio = new Audio(primary);
    audio.volume = 0.7;
    audio.play().catch(() => {
      // If avatar voice file doesn't exist, fall back to root
      const fb = new Audio(fallback);
      fb.volume = 0.7;
      fb.play().catch(() => {});
    });
  } catch {}
}

export function triggerTaunt(playerId: string, taunt: Taunt) {
  const bubble: TauntBubbleData = {
    id: tauntCounter++,
    playerId,
    taunt,
    timestamp: Date.now(),
  };
  tauntListeners.forEach(l => l(bubble));
  playTauntAudio(taunt.id);
}

// ─── TauntBubble — renders above player seat ────────────────────────────────

export function TauntBubble({ playerId }: { playerId: string }) {
  const [bubbles, setBubbles] = useState<TauntBubbleData[]>([]);

  useEffect(() => {
    const listener = (bubble: TauntBubbleData) => {
      if (bubble.playerId === playerId) {
        setBubbles(prev => [...prev, bubble]);
        setTimeout(() => {
          setBubbles(prev => prev.filter(b => b.id !== bubble.id));
        }, 3000);
      }
    };
    tauntListeners.push(listener);
    return () => { tauntListeners = tauntListeners.filter(l => l !== listener); };
  }, [playerId]);

  return (
    <AnimatePresence>
      {bubbles.map(b => {
        const isPremium = b.taunt.category === "premium";
        const color = RARITY_COLORS[b.taunt.rarity] || "#9ca3af";
        const borderColor = RARITY_BORDER[b.taunt.rarity] || "rgba(255,255,255,0.1)";
        const glow = RARITY_GLOW[b.taunt.rarity] || "none";

        return (
          <motion.div
            key={b.id}
            initial={{ opacity: 0, y: 10, scale: 0.5 }}
            animate={{ opacity: 1, y: -70, scale: 1 }}
            exit={{ opacity: 0, y: -100, scale: 0.5 }}
            transition={{ duration: 0.4, type: "spring" }}
            className="absolute -top-12 left-1/2 -translate-x-1/2 z-[65] pointer-events-none"
          >
            <div
              className="rounded-xl px-3 py-1.5 whitespace-nowrap max-w-[180px]"
              style={{
                background: isPremium
                  ? "linear-gradient(135deg, rgba(20,31,40,0.92), rgba(30,20,10,0.92))"
                  : "rgba(20,31,40,0.88)",
                border: `1px solid ${borderColor}`,
                boxShadow: isPremium ? glow : "0 0 10px rgba(0,0,0,0.3)",
                backdropFilter: "blur(12px)",
              }}
            >
              <div className="flex items-center gap-1.5">
                {isPremium && (
                  <Sparkles className="w-3 h-3 shrink-0" style={{ color }} />
                )}
                <span
                  className="text-[0.625rem] font-bold leading-tight"
                  style={{ color: isPremium ? color : "#e5e7eb" }}
                >
                  {b.taunt.text}
                </span>
              </div>
              {/* Speech bubble tail */}
              <div
                className="absolute left-1/2 -translate-x-1/2 -bottom-1.5 w-3 h-3 rotate-45"
                style={{
                  background: isPremium
                    ? "rgba(25,26,30,0.92)"
                    : "rgba(20,31,40,0.88)",
                  borderRight: `1px solid ${borderColor}`,
                  borderBottom: `1px solid ${borderColor}`,
                }}
              />
            </div>
          </motion.div>
        );
      })}
    </AnimatePresence>
  );
}

// ─── TauntPicker — UI to select and send taunts ────────────────────────────

interface TauntPickerProps {
  heroId: string;
  isMultiplayer?: boolean;
}

export function TauntPicker({ heroId, isMultiplayer }: TauntPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [cooldown, setCooldown] = useState(false);
  const [tab, setTab] = useState<"free" | "premium">("free");
  const [ownedTauntIds, setOwnedTauntIds] = useState<Set<string>>(new Set());
  const [loadingInventory, setLoadingInventory] = useState(false);

  // Load user inventory to check premium taunt ownership
  useEffect(() => {
    if (!isOpen) return;
    setLoadingInventory(true);
    fetch("/api/shop/inventory", { credentials: "include" })
      .then(r => r.ok ? r.json() : [])
      .then((inv: any[]) => {
        const ids = new Set<string>();
        inv.forEach((entry: any) => {
          if (entry.item?.category === "taunt") {
            // Match by item name → taunt id mapping
            const matchedTaunt = PREMIUM_TAUNTS.find(t =>
              entry.item.name === t.text || entry.item.description?.includes(t.id)
            );
            if (matchedTaunt) ids.add(matchedTaunt.id);
          }
        });
        setOwnedTauntIds(ids);
      })
      .catch(() => {})
      .finally(() => setLoadingInventory(false));
  }, [isOpen]);

  // Listen for taunts from other players
  useEffect(() => {
    if (!isMultiplayer) return;
    const unsub = wsClient.on("taunt", (msg: any) => {
      const taunt = TAUNT_MAP.get(msg.tauntId);
      if (taunt && msg.userId) {
        triggerTaunt(msg.userId, taunt);
      }
    });
    return unsub;
  }, [isMultiplayer]);

  const sendTaunt = useCallback((taunt: Taunt) => {
    if (cooldown) return;

    // Check ownership for premium
    if (taunt.category === "premium" && !ownedTauntIds.has(taunt.id)) return;

    // Trigger locally
    triggerTaunt(heroId, taunt);
    setCooldown(true);
    setIsOpen(false);
    setTimeout(() => setCooldown(false), 5000);

    if (isMultiplayer) {
      wsClient.send({ type: "taunt", tauntId: taunt.id });
    }
  }, [heroId, cooldown, isMultiplayer, ownedTauntIds]);

  const tauntsToShow = tab === "free" ? FREE_TAUNTS : PREMIUM_TAUNTS;

  return (
    <div className="fixed bottom-[140px] left-16 z-50">
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.9 }}
            className="mb-2 w-[240px]"
            style={{
              background: "rgba(10,16,28,0.95)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: "0.75rem",
              backdropFilter: "blur(20px)",
            }}
          >
            {/* Tabs */}
            <div className="flex border-b border-white/5">
              <button
                onClick={() => setTab("free")}
                className={`flex-1 py-2 text-[0.625rem] font-bold uppercase tracking-wider transition-colors ${
                  tab === "free"
                    ? "text-amber-400 border-b-2 border-amber-400"
                    : "text-gray-500 hover:text-gray-300"
                }`}
              >
                Free ({FREE_TAUNTS.length})
              </button>
              <button
                onClick={() => setTab("premium")}
                className={`flex-1 py-2 text-[0.625rem] font-bold uppercase tracking-wider transition-colors flex items-center justify-center gap-1 ${
                  tab === "premium"
                    ? "text-amber-400 border-b-2 border-amber-400"
                    : "text-gray-500 hover:text-gray-300"
                }`}
              >
                <Crown className="w-3 h-3" />
                Premium ({PREMIUM_TAUNTS.length})
              </button>
            </div>

            {/* Taunt list */}
            <div className="max-h-[280px] overflow-y-auto p-2 space-y-1 scrollbar-thin">
              {tauntsToShow.map(taunt => {
                const isPremium = taunt.category === "premium";
                const owned = !isPremium || ownedTauntIds.has(taunt.id);
                const color = RARITY_COLORS[taunt.rarity];

                return (
                  <motion.button
                    key={taunt.id}
                    whileHover={owned ? { scale: 1.02 } : undefined}
                    whileTap={owned ? { scale: 0.98 } : undefined}
                    onClick={() => owned && sendTaunt(taunt)}
                    disabled={!owned || cooldown}
                    className={`w-full text-left rounded-lg px-3 py-2 transition-colors ${
                      owned
                        ? "hover:bg-white/5 cursor-pointer"
                        : "opacity-50 cursor-not-allowed"
                    }`}
                    style={{
                      border: isPremium
                        ? `1px solid ${RARITY_BORDER[taunt.rarity]}`
                        : "1px solid transparent",
                    }}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        {!owned && <Lock className="w-3 h-3 text-gray-600 shrink-0" />}
                        {isPremium && owned && (
                          <Sparkles className="w-3 h-3 shrink-0" style={{ color }} />
                        )}
                        <span
                          className="text-xs font-medium truncate"
                          style={{ color: isPremium ? color : "#e5e7eb" }}
                        >
                          {taunt.text}
                        </span>
                      </div>
                      {isPremium && !owned && taunt.price && (
                        <span className="text-[0.5625rem] text-gray-500 font-mono shrink-0">
                          {taunt.price.toLocaleString()}
                        </span>
                      )}
                      {isPremium && owned && (
                        <span
                          className="text-[0.5rem] uppercase font-bold tracking-wider shrink-0"
                          style={{ color }}
                        >
                          {taunt.rarity}
                        </span>
                      )}
                    </div>
                  </motion.button>
                );
              })}
            </div>

            {/* Cooldown hint */}
            {cooldown && (
              <div className="px-3 py-1.5 border-t border-white/5">
                <span className="text-[0.5625rem] text-gray-600">Cooldown active...</span>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <motion.button
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={() => setIsOpen(!isOpen)}
        className={`glass rounded-xl p-3 transition-all ${isOpen ? "neon-border-amber" : ""} ${cooldown ? "opacity-50" : ""}`}
        disabled={cooldown}
      >
        <Megaphone className={`w-5 h-5 ${isOpen ? "text-amber-400" : "text-gray-500"}`} />
      </motion.button>
    </div>
  );
}
