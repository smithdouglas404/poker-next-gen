import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { Player } from "@/lib/poker-types";
import { EmoteBubble } from "./EmoteSystem";
import { TauntBubble } from "./TauntSystem";
import { useSoundEngine } from "@/lib/sound-context";
import { useGameUI } from "@/lib/game-ui-context";
import { useEffect, useRef, useState, useCallback } from "react";
import { triggerChipFlight } from "./ChipAnimation";
import { AvatarStatusRing } from "./AvatarStatusRing";
import { TimerRing } from "./TimerRing";
import { VideoThumbnail } from "./VideoOverlay";
import { useTimerCountdown } from "@/hooks/useTimerCountdown";
import { useAnimatedCounter } from "@/hooks/useAnimatedCounter";
import { StickyNote } from "lucide-react";
import { AVATAR_OPTIONS, type AvatarOption } from "./AvatarSelect";
import type { OpponentHudStats } from "@/lib/useOpponentStats";

// ─── Player Note Popover ────────────────────────────────────────────────────
const NOTE_COLORS = ["gray", "red", "yellow", "green", "blue", "purple"] as const;

function PlayerNoteIcon({ playerId }: { playerId: string }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [color, setColor] = useState<string>("gray");
  const [hasNote, setHasNote] = useState(false);
  const [saving, setSaving] = useState(false);
  const popRef = useRef<HTMLDivElement>(null);

  // Load note on mount
  useEffect(() => {
    fetch(`/api/player-notes/${playerId}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data) {
          setNote(data.note);
          setColor(data.color || "gray");
          setHasNote(true);
        }
      })
      .catch(() => {});
  }, [playerId]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (popRef.current && !popRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const handleSave = async () => {
    if (!note.trim()) {
      // Delete note
      await fetch(`/api/player-notes/${playerId}`, { method: "DELETE" }).catch(() => {});
      setHasNote(false);
      setOpen(false);
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/player-notes/${playerId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: note.trim(), color }),
      });
      if (res.ok) {
        setHasNote(true);
        setOpen(false);
      }
    } catch {}
    setSaving(false);
  };

  const noteColor = color === "red" ? "#ef4444" : color === "yellow" ? "#eab308" : color === "green" ? "#22c55e"
    : color === "blue" ? "#3b82f6" : color === "purple" ? "#a855f7" : "#9ca3af";

  return (
    <div className="relative" ref={popRef}>
      <button
        onClick={(e) => { e.stopPropagation(); setOpen(!open); }}
        className="p-0.5 rounded hover:bg-white/10 transition-colors"
        title="Player note"
      >
        <StickyNote className="w-3 h-3" style={{ color: hasNote ? noteColor : "rgba(255,255,255,0.25)" }} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: -4 }}
            className="absolute z-50 bottom-full mb-1 left-1/2 -translate-x-1/2 w-48 rounded-lg p-2 space-y-1.5"
            style={{
              background: "rgba(8,12,24,0.95)",
              border: "1px solid rgba(255,255,255,0.12)",
              boxShadow: "0 4px 20px rgba(0,0,0,0.6)",
              backdropFilter: "blur(12px)",
            }}
            onClick={e => e.stopPropagation()}
          >
            <textarea
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="Add note..."
              maxLength={500}
              rows={2}
              className="w-full text-[0.625rem] text-white placeholder-gray-600 rounded px-2 py-1 resize-none outline-none"
              style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}
              autoFocus
            />
            <div className="flex items-center gap-1">
              {NOTE_COLORS.map(c => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  className={`w-4 h-4 rounded-full border-2 transition-all ${color === c ? "border-white scale-110" : "border-transparent"}`}
                  style={{
                    background: c === "red" ? "#ef4444" : c === "yellow" ? "#eab308" : c === "green" ? "#22c55e"
                      : c === "blue" ? "#3b82f6" : c === "purple" ? "#a855f7" : "#6b7280",
                  }}
                />
              ))}
              <button
                onClick={handleSave}
                disabled={saving}
                className="ml-auto px-2 py-0.5 rounded text-[0.5625rem] font-bold uppercase bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 transition-colors disabled:opacity-50"
              >
                {saving ? "..." : "Save"}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}


// ─── Winner Particle Burst System ────────────────────────────────────────────
interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  alpha: number;
  life: number;
  maxLife: number;
}

const WINNER_PARTICLE_COLORS = ["#ffd700", "#f5e6a3", "#e8c566", "#fff8dc", "#d4a843"];

function useWinnerParticles(isWinner: boolean) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particlesRef = useRef<Particle[]>([]);
  const animFrameRef = useRef<number>(0);
  const prevWinner = useRef(false);

  useEffect(() => {
    // Only fire when isWinner transitions from false to true
    if (isWinner && !prevWinner.current) {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      // Spawn 40-60 particles from the center of the canvas
      const count = 40 + Math.floor(Math.random() * 21);
      const cx = canvas.width / 2;
      const cy = canvas.height / 2;
      const particles: Particle[] = [];

      for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 1.5 + Math.random() * 3;
        const life = 1.5 + Math.random() * 0.7; // 1.5-2.2 seconds
        particles.push({
          x: cx,
          y: cy,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - 1.5, // slight upward bias
          size: 2 + Math.random() * 3,
          color: WINNER_PARTICLE_COLORS[Math.floor(Math.random() * WINNER_PARTICLE_COLORS.length)],
          alpha: 1,
          life,
          maxLife: life,
        });
      }
      particlesRef.current = particles;

      let lastTime = performance.now();

      const animate = (now: number) => {
        const dt = Math.min((now - lastTime) / 1000, 0.05); // delta in seconds, capped
        lastTime = now;

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        const alive: Particle[] = [];
        for (const p of particlesRef.current) {
          p.life -= dt;
          if (p.life <= 0) continue;

          // Gravity
          p.vy += 2.5 * dt;
          p.x += p.vx * 60 * dt;
          p.y += p.vy * 60 * dt;

          // Fade out based on remaining life
          p.alpha = Math.max(0, p.life / p.maxLife);

          ctx.globalAlpha = p.alpha;
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          ctx.fill();

          alive.push(p);
        }
        ctx.globalAlpha = 1;
        particlesRef.current = alive;

        if (alive.length > 0) {
          animFrameRef.current = requestAnimationFrame(animate);
        }
      };

      animFrameRef.current = requestAnimationFrame(animate);
    }

    prevWinner.current = isWinner;

    return () => {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
    };
  }, [isWinner]);

  return canvasRef;
}

// ─── Player Chip Stack Visualization ──────────────────────────────────────────
interface StackChip {
  color: string;
  border: string;
  stripe: string;
  inner: string;
}

const CHIP_DENOMS: { threshold: number; chip: StackChip }[] = [
  { threshold: 1000, chip: { color: "#ffd700", border: "#b8860b", stripe: "#ffffff", inner: "#f59e0b" } },
  { threshold: 500,  chip: { color: "#111827", border: "#374151", stripe: "#f8fafc", inner: "#1f2937" } },
  { threshold: 100,  chip: { color: "#dc2626", border: "#991b1b", stripe: "#fecaca", inner: "#b91c1c" } },
  { threshold: 25,   chip: { color: "#16a34a", border: "#166534", stripe: "#bbf7d0", inner: "#15803d" } },
  { threshold: 5,    chip: { color: "#2563eb", border: "#1e40af", stripe: "#bfdbfe", inner: "#1d4ed8" } },
  { threshold: 1,    chip: { color: "#f5f5f4", border: "#a8a29e", stripe: "#d6d3d1", inner: "#e7e5e4" } },
];

function getPlayerChipStacks(chips: number): { chip: StackChip; count: number }[] {
  const stacks: { chip: StackChip; count: number }[] = [];
  let remaining = chips;
  for (const { threshold, chip } of CHIP_DENOMS) {
    if (remaining >= threshold) {
      const count = Math.min(8, Math.floor(remaining / threshold));
      stacks.push({ chip, count });
      remaining -= count * threshold;
    }
    if (stacks.length >= 3) break;
  }
  if (stacks.length === 0 && chips > 0) {
    stacks.push({ chip: CHIP_DENOMS[CHIP_DENOMS.length - 1].chip, count: 1 });
  }
  return stacks;
}

function MiniChip({ chip, yOffset }: { chip: StackChip; yOffset: number }) {
  return (
    <svg
      width="22" height="22" viewBox="0 0 22 22" fill="none"
      style={{
        position: "absolute",
        bottom: yOffset,
        left: 0,
        filter: "drop-shadow(0 1px 1px rgba(0,0,0,0.5))",
      }}
    >
      <circle cx="11" cy="11" r="10" fill={chip.color} stroke={chip.border} strokeWidth="1" />
      {[0, 60, 120, 180, 240, 300].map(angle => {
        const rad = (angle * Math.PI) / 180;
        const x1 = 11 + Math.cos(rad) * 8;
        const y1 = 11 + Math.sin(rad) * 8;
        const x2 = 11 + Math.cos(rad) * 10;
        const y2 = 11 + Math.sin(rad) * 10;
        return (
          <line key={angle} x1={x1} y1={y1} x2={x2} y2={y2}
            stroke={chip.stripe} strokeWidth="2" strokeLinecap="round" opacity="0.5"
          />
        );
      })}
      <circle cx="11" cy="11" r="6" fill="none" stroke={chip.stripe} strokeWidth="0.6" opacity="0.25" />
      <circle cx="11" cy="11" r="3" fill={chip.inner} opacity="0.3" />
      <ellipse cx="9" cy="7" rx="4" ry="3" fill="white" opacity="0.08" />
    </svg>
  );
}

function getBetChipDenom(amount: number): StackChip {
  if (amount >= 500) return CHIP_DENOMS[0].chip; // gold
  if (amount >= 100) return CHIP_DENOMS[1].chip; // black
  if (amount >= 25)  return CHIP_DENOMS[2].chip; // red
  if (amount >= 5)   return CHIP_DENOMS[3].chip; // green
  return CHIP_DENOMS[4].chip; // blue
}

function BetChipStack({ amount }: { amount: number }) {
  const chipCount = Math.min(6, Math.max(1, Math.ceil(amount / 50)));
  const chip = getBetChipDenom(amount);
  return (
    <div
      className="relative"
      style={{
        width: 24,
        height: 24 + chipCount * 3,
        perspective: "100px",
        transform: "rotateX(50deg)",
        transformOrigin: "bottom center",
      }}
    >
      {Array.from({ length: chipCount }).map((_, i) => (
        <svg
          key={i}
          width="24" height="24" viewBox="0 0 22 22" fill="none"
          style={{
            position: "absolute",
            bottom: i * 3,
            left: 0,
            filter: "drop-shadow(0 1px 1px rgba(0,0,0,0.5))",
          }}
        >
          <circle cx="11" cy="11" r="10" fill={chip.color} stroke={chip.border} strokeWidth="1" />
          {[0, 60, 120, 180, 240, 300].map(angle => {
            const rad = (angle * Math.PI) / 180;
            return (
              <line key={angle}
                x1={11 + Math.cos(rad) * 8} y1={11 + Math.sin(rad) * 8}
                x2={11 + Math.cos(rad) * 10} y2={11 + Math.sin(rad) * 10}
                stroke={chip.stripe} strokeWidth="2" strokeLinecap="round" opacity="0.5"
              />
            );
          })}
          <circle cx="11" cy="11" r="6" fill="none" stroke={chip.stripe} strokeWidth="0.6" opacity="0.25" />
          <circle cx="11" cy="11" r="3" fill={chip.inner} opacity="0.3" />
        </svg>
      ))}
    </div>
  );
}

function PlayerChipStack({ chips, side }: { chips: number; side: "left" | "right" }) {
  const stacks = getPlayerChipStacks(chips);
  if (stacks.length === 0) return null;
  return (
    <div
      className="flex pointer-events-none"
      style={{
        justifyContent: side === "left" ? "flex-end" : "flex-start",
        gap: 2,
        perspective: "100px",
        transform: `scale(var(--seat-scale, 1)) rotateX(45deg)`,
        transformOrigin: "bottom center",
        marginTop: -4,
      }}
    >
      {stacks.map((stack, si) => (
        <div key={si} className="relative" style={{ width: 22, height: 22 + stack.count * 3 }}>
          {Array.from({ length: stack.count }).map((_, ci) => (
            <MiniChip key={ci} chip={stack.chip} yOffset={ci * 3} />
          ))}
        </div>
      ))}
    </div>
  );
}

// Seat glow color palette — GGPoker-style: gold hero, warm/muted tones for opponents
const SEAT_COLORS = [
  "#d4af37", // gold (hero)
  "#5eead4", // teal
  "#94a3b8", // slate
  "#25a065", // emerald
  "#e0c97f", // warm gold
  "#a1a1aa", // gray
  "#6bb8c9", // muted cyan
  "#34d399", // green
  "#8faab8", // steel blue
];

function getSeatColor(seatIndex: number, isHero: boolean): string {
  if (isHero) return "#d4af37";
  return SEAT_COLORS[seatIndex % SEAT_COLORS.length];
}

// Action badge styling map — standardized opacities: bg /30, border /50, glow 0.20
const ACTION_BADGE_STYLES: Record<string, { bg: string; text: string; border: string; glow?: string }> = {
  folded:  { bg: "bg-red-500/30",    text: "text-red-400",    border: "border-red-500/50",   glow: "rgba(239,68,68,0.20)" },
  called:  { bg: "bg-green-500/30",  text: "text-green-400",  border: "border-green-500/50", glow: "rgba(34,197,94,0.20)" },
  checked: { bg: "bg-gray-500/30",   text: "text-gray-300",   border: "border-gray-500/50",  glow: "rgba(156,163,175,0.20)" },
  raised:  { bg: "bg-amber-500/30",   text: "text-amber-400",   border: "border-amber-500/50",  glow: "rgba(212,175,55,0.20)" },
  "all-in":{ bg: "bg-rose-500/30",  text: "text-rose-400",  border: "border-rose-500/50", glow: "rgba(244,63,94,0.20)" },
};


interface SeatProps {
  player: Player;
  position: { x: number; y: number };
  isHero?: boolean;
  isWinner?: boolean;
  seatIndex?: number;
  /** Perspective scale: 1.0 = full size (near you), 0.5 = half size (far away) */
  perspectiveScale?: number;
  /** Hide face-down cards (used in 3D mode where cards are rendered in the 3D scene) */
  hideCards?: boolean;
  hudStats?: OpponentHudStats;
  avatarTier?: AvatarOption["tier"];
  winStreak?: number;
  /** Whether to show video thumbnail for this player */
  showVideo?: boolean;
  /** Number of cards to visually show (0, 1, or 2) during dealing animation */
  dealCardCount?: number;
  /** Server turn deadline for timer (multiplayer) */
  turnDeadline?: number;
  /** Server turn timer duration in seconds */
  turnTimerDuration?: number;
  /** Callback when player name/avatar is clicked */
  onPlayerClick?: (player: Player) => void;
}

export function Seat({ player, position, isHero = false, isWinner = false, seatIndex = 0, perspectiveScale = 1, hideCards = false, hudStats, avatarTier, winStreak = 0, showVideo = false, dealCardCount, turnDeadline, turnTimerDuration = 30, onPlayerClick }: SeatProps) {
  const { compactMode } = useGameUI();
  const winnerCanvasRef = useWinnerParticles(isWinner && !compactMode);

  // Look up full-body avatar image if available
  const avatarOption = player.avatar ? AVATAR_OPTIONS.find(a => a.image === player.avatar) : undefined;
  const fullBodyImage = avatarOption?.fullBodyImage;

  const isTurn = player.status === "thinking";
  const isFolded = player.status === "folded";
  const sound = useSoundEngine();
  // Start at 0 so the first bet (blind posting) also triggers the animation
  const prevBetRef = useRef(0);
  const timerTickRef = useRef<ReturnType<typeof setInterval>>(undefined);
  const seatRef = useRef<HTMLDivElement>(null);

  // Animated chip count — smooth count-up/down when chips change
  const { value: animatedChips, animating: chipsAnimating, delta: chipsDelta } = useAnimatedCounter(player.chips, 400);

  // Smooth timer countdown
  const timer = useTimerCountdown(
    turnDeadline,
    turnTimerDuration,
    player.timeBankSeconds ?? 30,
    isTurn,
    player.timeLeft,
  );

  // Avatar expression reactions
  const prevStatusRef = useRef(player.status);
  const [reactionStyle, setReactionStyle] = useState<React.CSSProperties | undefined>(undefined);

  useEffect(() => {
    const prev = prevStatusRef.current;
    const curr = player.status;
    prevStatusRef.current = curr;
    if (prev === curr) return;

    if (curr === "raised" && player.currentBet > 0) {
      setReactionStyle({ transform: "scale(1.08) translateY(-4px)", transition: "transform 0.3s ease-out" });
      const t = setTimeout(() => setReactionStyle(undefined), 600);
      return () => clearTimeout(t);
    } else if (curr === "folded") {
      setReactionStyle({ animation: "avatarShake 0.4s ease-in-out" });
      const t = setTimeout(() => setReactionStyle(undefined), 400);
      return () => clearTimeout(t);
    } else if (curr === "all-in") {
      setReactionStyle({ filter: "brightness(1.2)", boxShadow: "0 0 20px rgba(245,158,11,0.4)" });
      return () => setReactionStyle(undefined);
    } else {
      setReactionStyle(undefined);
    }
  }, [player.status, player.currentBet]);

  // Winner glow reaction
  useEffect(() => {
    if (isWinner) {
      setReactionStyle({ filter: "brightness(1.3) saturate(1.5)", boxShadow: "0 0 20px rgba(255,215,0,0.5)", transition: "all 0.5s ease" });
      const t = setTimeout(() => setReactionStyle(undefined), 2000);
      return () => clearTimeout(t);
    }
  }, [isWinner]);

  // Each seat gets a unique neon glow color
  const glowColor = getSeatColor(seatIndex, isHero);

  const statusLabel: Record<string, string> = {
    folded: "FOLD",
    checked: "CHECK",
    called: "CALL",
    raised: "RAISE",
    "all-in": "ALL-IN",
  };

  // Format chip count as $X,XXX
  const formatChips = (amount: number) => `$${amount.toLocaleString()}`;

  // Play chip sound and trigger chip flight when bet increases
  useEffect(() => {
    if (player.currentBet > prevBetRef.current && player.currentBet > 0) {
      sound.playChipClinkAt(position.x, perspectiveScale);
      if (seatRef.current) {
        const rect = seatRef.current.getBoundingClientRect();
        const fromX = rect.left + rect.width / 2;
        const fromY = rect.top + rect.height / 2;
        // Target the pot container ref (exposed by ImageTable) for accurate targeting
        const potRef = (window as any).__potRef?.current as HTMLDivElement | null;
        let toX: number, toY: number;
        if (potRef) {
          const potRect = potRef.getBoundingClientRect();
          toX = potRect.left + potRect.width / 2;
          toY = potRect.top + potRect.height / 2;
        } else {
          // Fallback to center of viewport
          toX = window.innerWidth / 2;
          toY = window.innerHeight * 0.38;
        }
        triggerChipFlight(fromX, fromY, toX, toY, player.currentBet - prevBetRef.current);
      }
    }
    prevBetRef.current = player.currentBet;
  }, [player.currentBet, sound]);

  // Timer tick sound — only plays when running low (≤50%), rate intensifies as time runs out
  // >50%: silent, 25-50%: every 2s, 10-25%: every 1s, <10%: every 500ms
  useEffect(() => {
    if (!isTurn || !isHero || timer.percent > 50) {
      if (timerTickRef.current) clearInterval(timerTickRef.current);
      timerTickRef.current = undefined;
      return;
    }

    const getInterval = () => {
      const pct = timer.percent;
      if (pct > 25) return 2000;
      if (pct > 10) return 1000;
      return 500;
    };

    let currentInterval = getInterval();
    const tick = () => {
      const urgency = 1 - timer.percent / 100;
      sound.playTimerTick(urgency);
      const newInterval = getInterval();
      if (newInterval !== currentInterval) {
        currentInterval = newInterval;
        if (timerTickRef.current) clearInterval(timerTickRef.current);
        timerTickRef.current = setInterval(tick, currentInterval);
      }
    };

    // Play first tick immediately when crossing the 50% threshold
    sound.playTimerTick(1 - timer.percent / 100);
    timerTickRef.current = setInterval(tick, currentInterval);

    return () => {
      if (timerTickRef.current) clearInterval(timerTickRef.current);
      timerTickRef.current = undefined;
    };
  }, [isTurn, isHero, timer.percent > 50, timer.percent > 25, timer.percent > 10, sound]);

  // Parallax depth effect for hero avatar only
  const [mouseOffset, setMouseOffset] = useState({ x: 0, y: 0 });
  const avatarRef = useRef<HTMLDivElement>(null);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!avatarRef.current) return;
    const rect = avatarRef.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const dx = (e.clientX - centerX) / window.innerWidth;
    const dy = (e.clientY - centerY) / window.innerHeight;
    setMouseOffset({
      x: Math.max(-3, Math.min(3, dx * 6)),
      y: Math.max(-3, Math.min(3, dy * 6)),
    });
  }, []);

  useEffect(() => {
    if (!isHero || isFolded || compactMode) {
      setMouseOffset({ x: 0, y: 0 });
      return;
    }
    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, [isHero, isFolded, handleMouseMove, compactMode]);

  const parallaxStyle = isHero && !isFolded
    ? {
        transform: `perspective(200px) translate(${mouseOffset.x}px, ${mouseOffset.y}px) rotateY(${mouseOffset.x * 1.67}deg) rotateX(${-mouseOffset.y * 1.67}deg)`,
        transition: "transform 0.15s ease-out",
      }
    : undefined;

  // Compute bet chip offset — push the bet badge toward the table center
  const betOffsetX = (50 - position.x) * 0.4; // positive = toward center
  const betOffsetY = (50 - position.y) * 0.35;

  // Chip stack side — place chips on the side closest to the table edge (away from center)
  const chipStackSide: "left" | "right" = position.x < 50 ? "left" : "right";

  // Build hex-to-rgba helper for glowColor
  const hexToRgba = (hex: string, alpha: number) => {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r},${g},${b},${alpha})`;
  };

  return (
    <div
      ref={seatRef}
      className="absolute flex flex-col items-center pointer-events-none seat-root"
      style={{
        left: `${position.x}%`,
        top: `${position.y}%`,
        transform: "translate(-50%, -50%)",
        transformOrigin: "center center",
        zIndex: isHero ? 40 : position.y < 50 ? 10 : 30,
        // Drive all child sizing via this CSS variable — portrait-card reads it
        ["--seat-scale" as string]: perspectiveScale,
        fontSize: `calc(1rem * ${perspectiveScale})`,
      }}
    >
      <div
        className={cn(
          "relative flex flex-col items-center",
          isFolded && "opacity-50 grayscale",
          (player.isSittingOut || player.status === "sitting-out") && !isFolded && "opacity-50"
        )}
      >
        {/* Taunt bubble (above emotes) */}
        <TauntBubble playerId={player.id} />
        {/* Emote bubble */}
        <EmoteBubble playerId={player.id} />

        {/* Winner particle burst canvas */}
        <canvas
          ref={winnerCanvasRef}
          width={200}
          height={200}
          className="absolute pointer-events-none"
          style={{
            left: "50%",
            top: "50%",
            transform: "translate(-50%, -50%)",
            width: Math.round(200 * perspectiveScale),
            height: Math.round(200 * perspectiveScale),
            zIndex: 50,
          }}
        />

        {/* ── Action status badge (positioned ABOVE avatar) ── */}
        <AnimatePresence>
          {statusLabel[player.status] && player.status !== "waiting" && player.status !== "thinking" && (
            <motion.div
              initial={{ opacity: 0, y: 8, scale: 0.7 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -6, scale: 0.7 }}
              transition={{ type: "spring", stiffness: 300, damping: 20 }}
              className={cn(
                "mb-1.5 px-3 py-1 rounded-lg font-black uppercase tracking-wider z-30 border backdrop-blur-md",
                ACTION_BADGE_STYLES[player.status]?.bg || "bg-black/40",
                ACTION_BADGE_STYLES[player.status]?.text || "text-gray-300",
                ACTION_BADGE_STYLES[player.status]?.border || "border-white/10",
              )}
              style={{
                fontSize: "0.6875em",
                boxShadow: ACTION_BADGE_STYLES[player.status]?.glow
                  ? `0 0 14px ${ACTION_BADGE_STYLES[player.status].glow}`
                  : undefined,
              }}
            >
              {statusLabel[player.status]}
              {/* Show bet amount next to CALL/RAISE */}
              {(player.status === "called" || player.status === "raised") && player.currentBet > 0 && (
                <span className="ml-1.5 font-mono" style={{ fontSize: "0.9em" }}>{formatChips(player.currentBet)}</span>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Stitch-poker-style full-body portrait card ── */}
        <div ref={avatarRef} className="relative z-10">
          {showVideo && <VideoThumbnail userId={player.id} isLocal={isHero} size={Math.round(48 * perspectiveScale)} />}
          {avatarTier && avatarTier !== "common" && (
            <AvatarStatusRing
              tier={avatarTier}
              winStreak={winStreak}
              vpipPercent={hudStats ? Math.round((hudStats.vpipCount / Math.max(1, hudStats.handsPlayed)) * 100) : undefined}
              size={Math.round(160 * perspectiveScale)}
              isActive={isTurn}
            />
          )}

          <div className="relative" style={{ ...parallaxStyle, ...reactionStyle }}>
            {/* Winner ring wraps entire card */}
            <div
              className={cn("relative rounded-xl", isWinner && "ring-2 ring-[#d4af37]")}
              style={isWinner ? { boxShadow: "0 0 30px rgba(212,175,55,0.6), 0 0 60px rgba(212,175,55,0.25)" } : {}}
            >
              <div
                className="relative rounded-t-xl overflow-visible portrait-card"
                style={{
                  borderTop: `3px solid ${hexToRgba(glowColor, isTurn ? 1.0 : 0.6)}`,
                  borderLeft: `3px solid ${hexToRgba(glowColor, isTurn ? 1.0 : 0.6)}`,
                  borderRight: `3px solid ${hexToRgba(glowColor, isTurn ? 1.0 : 0.6)}`,
                  borderBottom: "none",
                  borderRadius: "12px 12px 0 0",
                  boxShadow: isTurn
                    ? `0 0 30px ${hexToRgba(glowColor, 0.8)}, 0 0 60px ${hexToRgba(glowColor, 0.4)}, 0 0 90px ${hexToRgba(glowColor, 0.15)}, inset 0 0 20px ${hexToRgba(glowColor, 0.25)}`
                    : isWinner
                    ? `0 0 25px rgba(212,175,55,0.5), 0 0 50px rgba(212,175,55,0.2)`
                    : `0 0 18px ${hexToRgba(glowColor, 0.5)}, 0 6px 30px rgba(0,0,0,0.7)`,
                  transition: "all 0.3s ease",
                  animation: isTurn ? "seatTurnPulse 2s ease-in-out infinite" : undefined,
                }}
              >
                {/* Top glow edge */}
                <div
                  className="absolute top-0 left-0 right-0 h-[3px] z-20 rounded-t-xl"
                  style={{
                    background: `linear-gradient(90deg, transparent, ${glowColor}, transparent)`,
                    boxShadow: `0 0 10px ${hexToRgba(glowColor, 0.7)}`,
                  }}
                />

                {/* Avatar image — full upper body, object-top */}
                {player.avatar ? (
                  <img
                    src={fullBodyImage || player.avatar}
                    alt={player.name}
                    className="absolute inset-0 w-full h-full object-cover z-[1] rounded-t-xl"
                    style={{
                      objectPosition: fullBodyImage ? "center 10%" : "center 15%",
                      opacity: isFolded ? 0.3 : 1,
                      filter: isFolded ? "grayscale(1) brightness(0.6)" : "none",
                      transition: "opacity 0.4s ease, filter 0.4s ease",
                    }}
                  />
                ) : (
                  <div
                    className="absolute inset-0 w-full h-full flex items-center justify-center font-black text-white/70 z-[1] rounded-t-xl"
                    style={{
                      fontSize: `calc(1.5em * ${perspectiveScale})`,
                      background: isHero
                        ? "linear-gradient(135deg, #0e7490, #164e63)"
                        : "linear-gradient(135deg, #78716c, #44403c)",
                      opacity: isFolded ? 0.3 : 1,
                      filter: isFolded ? "grayscale(1)" : "none",
                    }}
                  >
                    {player.name.charAt(0).toUpperCase()}
                  </div>
                )}

                {/* Cinematic gradient overlay — darker at bottom for text contrast */}
                <div className="absolute bottom-0 left-0 right-0 h-[70%] z-[2] pointer-events-none rounded-b-xl"
                  style={{ background: "linear-gradient(to top, rgba(10,10,12,0.95) 0%, rgba(10,10,12,0.6) 35%, rgba(0,0,0,0.15) 65%, transparent 100%)" }} />

                {/* Face-down hole cards — overlapping bottom of avatar (stitch-poker style) */}
                {!hideCards && !isHero && player.cards && player.cards.length > 0 && !isFolded && player.status !== "folded" && (
                  <div className="absolute left-1/2 -translate-x-1/2 flex z-[15]" style={{ bottom: "-4px" }}>
                    {player.cards.filter((_, i) => dealCardCount === undefined || i < dealCardCount).map((_, i) => (
                      <div
                        key={`oc-${i}`}
                        className="rounded-md"
                        style={{
                          width: Math.round(30 * perspectiveScale),
                          height: Math.round(42 * perspectiveScale),
                          background: "linear-gradient(135deg, #1e3a5f, #0d1b2a)",
                          border: "2px solid rgba(0,243,255,0.3)",
                          transform: i === 0 ? "rotate(-10deg) translateX(4px)" : "rotate(10deg) translateX(-4px)",
                          boxShadow: "0 4px 16px rgba(0,0,0,0.8)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <div
                          className="rounded border-2 flex items-center justify-center"
                          style={{
                            width: "60%",
                            height: "70%",
                            borderColor: "rgba(0,243,255,0.25)",
                            background: "rgba(0,243,255,0.06)",
                          }}
                        >
                          <span style={{ color: "rgba(0,243,255,0.35)", fontSize: `${Math.round(10 * perspectiveScale)}px`, fontWeight: 900 }}>S</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Name + chips bar */}
              <div
                className="relative z-[3] rounded-b-xl overflow-hidden"
                style={{
                  background: "rgba(15,15,20,0.92)",
                  backdropFilter: "blur(12px)",
                  borderLeft: `3px solid ${hexToRgba(glowColor, 0.35)}`,
                  borderRight: `3px solid ${hexToRgba(glowColor, 0.35)}`,
                  borderBottom: `3px solid ${hexToRgba(glowColor, 0.35)}`,
                  padding: "4px 8px 3px",
                }}
              >
                {/* Bottom gold accent line */}
                <div className="absolute bottom-0 left-0 right-0 h-[3px] z-20"
                  style={{
                    background: "linear-gradient(90deg, transparent, #d4af37, #ffd700, #d4af37, transparent)",
                    boxShadow: "0 0 8px rgba(212,175,55,0.5)",
                  }} />
                <div className="flex items-baseline gap-1.5">
                  <span className="text-white/50 font-mono" style={{ fontSize: "0.5625em" }}>
                    P{(seatIndex ?? 0) + 1}
                  </span>
                  <p className="font-extrabold text-white/90 truncate leading-tight uppercase"
                    style={{ fontSize: "0.6875em", maxWidth: `calc(100px * var(--seat-scale, 1))`, fontFamily: "system-ui, -apple-system, sans-serif", textShadow: `0 0 6px ${hexToRgba(glowColor, 0.4)}` }}>
                    {player.name}
                  </p>
                </div>
                <div className="flex items-center gap-0.5">
                  <span className="font-mono font-bold text-[#ffd700] leading-tight" style={{ fontSize: "0.6875em" }}>
                    {formatChips(animatedChips)}
                  </span>
                  {chipsAnimating && chipsDelta !== 0 && (
                    <span className={cn("font-mono font-bold leading-tight", chipsDelta > 0 ? "text-green-400" : "text-red-400")} style={{ fontSize: "0.5625em" }}>
                      {chipsDelta > 0 ? "+" : ""}{formatChips(chipsDelta)}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* ── Bet amount — floats between avatar and table center ── */}
            {player.currentBet > 0 && !isFolded && (() => {
              const isTop = seatIndex >= 3 && seatIndex <= 6;
              const isLeft = seatIndex === 1 || seatIndex === 2 || seatIndex === 3;
              const isRight = seatIndex === 7 || seatIndex === 8 || seatIndex === 9;
              const betStyle: React.CSSProperties = {
                position: "absolute",
                zIndex: 25,
                ...(seatIndex === 0 ? { top: "-20px", left: "50%", transform: "translateX(-50%)" } : {}),
                ...(seatIndex === 5 ? { bottom: "-20px", left: "50%", transform: "translateX(-50%)" } : {}),
                ...(isTop && seatIndex !== 5 ? { bottom: "-18px", left: "50%", transform: "translateX(-50%)" } : {}),
                ...(!isTop && seatIndex !== 0 && isLeft ? { right: "-8px", top: "50%", transform: "translateY(-50%) translateX(100%)" } : {}),
                ...(!isTop && seatIndex !== 0 && isRight ? { left: "-8px", top: "50%", transform: "translateY(-50%) translateX(-100%)" } : {}),
              };
              return (
                <div style={betStyle} className="flex items-center gap-1 px-1.5 py-0.5 rounded-full">
                  <span className="text-[#d4af37] font-bold font-mono"
                    style={{ fontSize: "0.5em", background: "rgba(10,10,12,0.85)", border: "1px solid rgba(212,175,55,0.3)", borderRadius: "9999px", padding: "1px 6px" }}>
                    {formatChips(player.currentBet)}
                  </span>
                </div>
              );
            })()}

            {/* Face-down cards now rendered inside portrait card (stitch-poker style) */}
          </div>

          {isTurn && (
            <TimerRing
              percent={timer.percent}
              secondsLeft={timer.secondsLeft}
              size={Math.round(140 * perspectiveScale)}
              strokeWidth={Math.max(2, Math.round(4 * perspectiveScale))}
              inTimeBank={timer.inTimeBank}
              timeBankRemaining={timer.timeBankRemaining}
              isHero={isHero}
            />
          )}

          {player.isDealer && (
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              className="absolute -right-2 -top-2 z-40 rounded-full bg-white flex items-center justify-center shadow-lg"
              style={{
                width: `${Math.round(28 * perspectiveScale)}px`,
                height: `${Math.round(28 * perspectiveScale)}px`,
                border: "2.5px solid #d4af37",
                boxShadow: "0 0 10px rgba(212,175,55,0.4)",
              }}
            >
              <span style={{ fontSize: `${Math.round(11 * perspectiveScale)}px` }} className="font-black text-gray-900">D</span>
            </motion.div>
          )}

          {(player.isSittingOut || player.status === "sitting-out") && (
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-40 px-2 py-0.5 rounded font-black uppercase tracking-wider text-orange-300 bg-black/80 border border-orange-500/50"
              style={{ fontSize: "0.625em", boxShadow: "0 0 12px rgba(249,115,22,0.3)" }}
            >
              AWAY
            </motion.div>
          )}

          <div
            className="absolute -left-1 -bottom-1 z-30 rounded-md flex items-center justify-center font-bold"
            style={{
              width: `${Math.round(20 * perspectiveScale)}px`,
              height: `${Math.round(20 * perspectiveScale)}px`,
              fontSize: "0.5625em",
              background: hexToRgba(glowColor, 0.25),
              border: `1px solid ${hexToRgba(glowColor, 0.5)}`,
              color: glowColor,
            }}
          >
            {seatIndex + 1}
          </div>
        </div>

        {player.chips > 0 && !isFolded && (
          <PlayerChipStack chips={player.chips} side={chipStackSide} />
        )}

        {hudStats && hudStats.handsPlayed > 0 && (
          <div
            className="relative z-10 flex items-center gap-1.5 px-2 py-0.5 rounded-b-md -mt-0.5"
            style={{
              background: "rgba(0,0,0,0.70)",
              border: "1px solid rgba(255,255,255,0.06)",
              borderTop: "none",
              fontSize: "0.625em",
              transformOrigin: "top center",
            }}
          >
            <HudStat
              label="V"
              value={Math.round((hudStats.vpipCount / hudStats.handsPlayed) * 100)}
              good={[20, 35]}
            />
            <span className="text-gray-600">/</span>
            <HudStat
              label="P"
              value={Math.round((hudStats.pfrCount / hudStats.handsPlayed) * 100)}
              good={[15, 25]}
            />
            <span className="text-gray-600">/</span>
            <HudStat
              label="A"
              value={hudStats.passiveActions > 0
                ? Math.round((hudStats.aggressiveActions / hudStats.passiveActions) * 10) / 10
                : hudStats.aggressiveActions > 0 ? 99 : 0}
              good={[1.0, 3.0]}
              isFloat
            />
            <span className="text-gray-600 font-mono">({hudStats.handsPlayed})</span>
          </div>
        )}

        {/* ── Current bet chips + label (offset toward table center) ── */}
        <AnimatePresence>
          {player.currentBet > 0 && (
            <motion.div
              initial={{ opacity: 0, scale: 0.7 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.7 }}
              className="absolute z-40 flex flex-col items-center gap-0.5"
              style={{
                left: `calc(50% + ${betOffsetX}px)`,
                top: `calc(50% + ${betOffsetY}px)`,
                transform: "translate(-50%, -50%)",
              }}
            >
              <BetChipStack amount={player.currentBet} />
              <span
                className="text-[0.75rem] font-mono font-black tabular-nums px-1.5 py-px rounded-md"
                style={{
                  color: "#ffd700",
                  textShadow: "0 0 8px rgba(255,215,0,0.4)",
                  background: "rgba(0,0,0,0.55)",
                }}
              >
                {formatChips(player.currentBet)}
              </span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Face-down cards are now rendered inside the avatar section above */}
    </div>
  );
}

// Color-coded HUD stat value
function HudStat({ label, value, good, isFloat }: { label: string; value: number; good: [number, number]; isFloat?: boolean }) {
  const display = isFloat ? value.toFixed(1) : `${value}`;
  let color = "text-yellow-400"; // default: outside range
  if (value >= good[0] && value <= good[1]) {
    color = "text-green-400";
  } else if (value > good[1]) {
    color = "text-red-400";
  }

  return (
    <span className="font-mono font-bold">
      <span className="text-gray-400">{label}:</span>
      <span className={`${color} ml-0.5`}>{display}</span>
    </span>
  );
}
