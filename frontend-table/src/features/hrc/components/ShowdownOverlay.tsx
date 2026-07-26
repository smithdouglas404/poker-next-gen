import { motion, AnimatePresence } from "framer-motion";
import { Trophy, Sparkles, Crown } from "lucide-react";
import { PlayerResult } from "@/lib/hand-evaluator";
import { Player } from "@/lib/poker-types";
import { Card } from "./Card";
import { useEffect, useRef } from "react";
import { useSoundEngine } from "@/lib/sound-context";
import confetti from "canvas-confetti";

interface ShowdownOverlayProps {
  visible: boolean;
  results: PlayerResult[];
  players: Player[];
  pot: number;
  onDismiss?: () => void;
  autoDismissMs?: number;
}

// Enhanced confetti with multiple burst waves and shimmer particles
function Confetti({ active }: { active: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!active) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    interface Particle {
      x: number; y: number; vx: number; vy: number;
      size: number; color: string; rotation: number; rotSpeed: number;
      life: number; maxLife: number; type: "confetti" | "spark" | "ring";
    }

    const particles: Particle[] = [];
    const colors = ["#ffd700", "#f5e6a3", "#e8c566", "#ffffff", "#d4a843", "#fff8dc", "#25a065", "#1b7a4a"];

    // Wave 1: Big burst from center
    for (let i = 0; i < 150; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = Math.random() * 10 + 4;
      particles.push({
        x: canvas.width / 2,
        y: canvas.height / 2 - 50,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 5,
        size: Math.random() * 7 + 2,
        color: colors[Math.floor(Math.random() * colors.length)],
        rotation: Math.random() * 360,
        rotSpeed: (Math.random() - 0.5) * 12,
        life: 0,
        maxLife: Math.random() * 100 + 50,
        type: "confetti",
      });
    }

    // Wave 2: Sparkle shimmer (delayed)
    for (let i = 0; i < 60; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = Math.random() * 3 + 1;
      particles.push({
        x: canvas.width / 2 + (Math.random() - 0.5) * 300,
        y: canvas.height / 2 - 80 + (Math.random() - 0.5) * 100,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 2,
        size: Math.random() * 3 + 1,
        color: colors[Math.floor(Math.random() * 3)],
        rotation: 0,
        rotSpeed: 0,
        life: -20 - Math.random() * 30,
        maxLife: Math.random() * 60 + 40,
        type: "spark",
      });
    }

    // Wave 3: Expanding rings
    for (let i = 0; i < 3; i++) {
      particles.push({
        x: canvas.width / 2,
        y: canvas.height / 2 - 40,
        vx: 0, vy: 0,
        size: 0,
        color: "#ffd700",
        rotation: 0, rotSpeed: 0,
        life: -i * 15,
        maxLife: 60,
        type: "ring",
      });
    }

    let frame: number;
    function animate() {
      ctx!.clearRect(0, 0, canvas!.width, canvas!.height);

      let alive = false;
      for (const p of particles) {
        p.life++;
        if (p.life < 0) { alive = true; continue; }
        if (p.life >= p.maxLife) continue;
        alive = true;
        const alpha = 1 - p.life / p.maxLife;

        if (p.type === "ring") {
          p.size += 4;
          ctx!.strokeStyle = p.color;
          ctx!.globalAlpha = alpha * 0.3;
          ctx!.lineWidth = 2;
          ctx!.beginPath();
          ctx!.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          ctx!.stroke();
        } else if (p.type === "spark") {
          ctx!.globalAlpha = alpha * (0.5 + 0.5 * Math.sin(p.life * 0.3));
          ctx!.fillStyle = p.color;
          ctx!.beginPath();
          const spikes = 4;
          for (let s = 0; s < spikes * 2; s++) {
            const r = s % 2 === 0 ? p.size * 2 : p.size * 0.5;
            const a = (s * Math.PI) / spikes;
            const sx = p.x + Math.cos(a) * r;
            const sy = p.y + Math.sin(a) * r;
            s === 0 ? ctx!.moveTo(sx, sy) : ctx!.lineTo(sx, sy);
          }
          ctx!.closePath();
          ctx!.fill();
          p.x += p.vx;
          p.y += p.vy;
          p.vy += 0.02;
        } else {
          p.x += p.vx;
          p.y += p.vy;
          p.vy += 0.18;
          p.vx *= 0.99;
          p.rotation += p.rotSpeed;
          ctx!.save();
          ctx!.translate(p.x, p.y);
          ctx!.rotate((p.rotation * Math.PI) / 180);
          ctx!.fillStyle = p.color;
          ctx!.globalAlpha = alpha;
          ctx!.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
          ctx!.restore();
        }
      }
      ctx!.globalAlpha = 1;

      if (alive) {
        frame = requestAnimationFrame(animate);
      }
    }
    animate();
    return () => cancelAnimationFrame(frame);
  }, [active]);

  if (!active) return null;
  return <canvas ref={canvasRef} className="absolute inset-0 z-50 pointer-events-none" />;
}

export function ShowdownOverlay({ visible, results, players, pot, onDismiss, autoDismissMs = 5000 }: ShowdownOverlayProps) {
  const winners = results.filter(r => r.isWinner);
  const losers = results.filter(r => !r.isWinner);
  const winnerIds = winners.map(w => w.playerId);
  const sound = useSoundEngine();
  const soundPlayedRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const dismissRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Auto-dismiss after timeout
  useEffect(() => {
    if (visible && onDismiss) {
      dismissRef.current = setTimeout(onDismiss, autoDismissMs);
    }
    return () => { if (dismissRef.current) clearTimeout(dismissRef.current); };
  }, [visible, onDismiss, autoDismissMs]);

  // Fire canvas-confetti on showdown
  useEffect(() => {
    if (visible && winners.length > 0) {
      // Gold confetti burst
      confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 }, colors: ["#d4af37", "#f3e2ad", "#8a6914", "#ffffff", "#c9a227"] });
      // Second burst delayed
      setTimeout(() => {
        confetti({ particleCount: 50, angle: 60, spread: 55, origin: { x: 0 }, colors: ["#d4af37", "#f3e2ad"] });
        confetti({ particleCount: 50, angle: 120, spread: 55, origin: { x: 1 }, colors: ["#d4af37", "#f3e2ad"] });
      }, 300);
    }
  }, [visible, winners.length]);

  // Play showdown sequence: phase reveal → fanfare → chip slide → win celebration
  useEffect(() => {
    if (visible && !soundPlayedRef.current) {
      soundPlayedRef.current = true;
      sound.playPhaseReveal();
      timerRef.current = setTimeout(() => {
        sound.playShowdownFanfare();
        timerRef.current = setTimeout(() => {
          sound.playChipSlide();
          timerRef.current = setTimeout(() => {
            sound.playWinCelebration();
          }, 400);
        }, 600);
      }, 300);
    }
    if (!visible) {
      soundPlayedRef.current = false;
    }
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [visible, sound]);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.5 }}
          className="fixed inset-0 z-[100] flex items-center justify-center overflow-auto cursor-pointer"
          onClick={() => onDismiss?.()}
        >
          {/* Backdrop — solid dark overlay (no blur for performance) */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6 }}
            className="absolute inset-0"
            style={{
              background: "radial-gradient(ellipse at center, rgba(0,0,0,0.75) 0%, rgba(0,0,0,0.90) 60%, rgba(0,0,0,0.97) 100%)",
            }}
          />

          {/* Spotlight beam effect */}
          <motion.div
            initial={{ opacity: 0, scale: 0.3 }}
            animate={{ opacity: 0.2, scale: 1 }}
            transition={{ duration: 0.8, delay: 0.2 }}
            className="absolute pointer-events-none"
            style={{
              width: "800px",
              height: "800px",
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              background: "radial-gradient(circle, rgba(255,215,0,0.25) 0%, rgba(255,215,0,0.06) 35%, transparent 65%)",
            }}
          />

          {/* Confetti */}
          <Confetti active={visible} />

          {/* Main content container */}
          <motion.div
            initial={{ scale: 0.7, y: 40 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.7, y: 40 }}
            transition={{ type: "spring", stiffness: 180, damping: 18 }}
            className="relative z-50 w-full max-w-4xl px-6 py-4"
          >
            {/* ── "SHOWDOWN" header ── */}
            <motion.div
              initial={{ y: -30, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.15, type: "spring", stiffness: 200, damping: 20 }}
              className="text-center mb-4"
            >
              <div className="inline-flex items-center gap-3">
                <Sparkles className="w-6 h-6 text-yellow-400" />
                <motion.span
                  initial={{ letterSpacing: "0.1em" }}
                  animate={{ letterSpacing: "0.6em" }}
                  transition={{ delay: 0.3, duration: 0.8 }}
                  className="font-display text-sm text-yellow-500/70 uppercase tracking-widest"
                >
                  Showdown
                </motion.span>
                <Sparkles className="w-6 h-6 text-yellow-400" />
              </div>
            </motion.div>

            {/* ── WINNER section — large and prominent ── */}
            {winners.map((winner, wi) => {
              const player = players.find(p => p.id === winner.playerId);
              if (!player || !player.cards) return null;

              return (
                <motion.div
                  key={winner.playerId}
                  initial={{ scale: 0.5, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ delay: 0.25 + wi * 0.15, type: "spring", stiffness: 200, damping: 16 }}
                  className="text-center mb-6"
                >
                  {/* Crown */}
                  <motion.div
                    initial={{ scale: 0, rotate: -20 }}
                    animate={{ scale: 1, rotate: 0 }}
                    transition={{ delay: 0.35, type: "spring", stiffness: 300, damping: 15 }}
                    className="flex justify-center mb-3"
                  >
                    <Crown className="w-14 h-14 text-yellow-400 drop-shadow-[0_0_30px_rgba(255,215,0,0.7)]" />
                  </motion.div>

                  {/* Winner name */}
                  <div className="flex items-center justify-center gap-4 mb-4">
                    <Trophy className="w-10 h-10 text-yellow-400 drop-shadow-[0_0_20px_rgba(255,215,0,0.6)]" />
                    <h2
                      className="text-5xl font-black tracking-tight"
                      style={{
                        background: "linear-gradient(135deg, #ffd700, #f5e6a3, #d4a843)",
                        WebkitBackgroundClip: "text",
                        WebkitTextFillColor: "transparent",
                        filter: "drop-shadow(0 0 24px rgba(255,215,0,0.5))",
                      }}
                    >
                      {player.name}
                    </h2>
                    <Trophy className="w-10 h-10 text-yellow-400 drop-shadow-[0_0_20px_rgba(255,215,0,0.6)]" />
                  </div>

                  {/* Winner's cards — LARGE */}
                  <motion.div
                    initial={{ y: 20, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ delay: 0.45, type: "spring" }}
                    className="flex gap-4 justify-center mb-5"
                  >
                    <Card card={{ ...player.cards[0], hidden: false }} size="3xl" delay={0.5} />
                    <Card card={{ ...player.cards[1], hidden: false }} size="3xl" delay={0.65} />
                  </motion.div>

                  {/* Winning hand name — BIG and glowing */}
                  <motion.div
                    initial={{ scale: 0, rotateX: 90 }}
                    animate={{ scale: 1, rotateX: 0 }}
                    transition={{ delay: 0.55, type: "spring", stiffness: 250, damping: 18 }}
                    className="inline-block glass rounded-2xl px-10 py-4 neon-border-gold mb-4"
                    style={{
                      boxShadow: "0 0 40px rgba(255,215,0,0.25), 0 0 80px rgba(255,215,0,0.1)",
                    }}
                  >
                    <span
                      className="text-3xl font-black tracking-wide"
                      style={{
                        background: "linear-gradient(135deg, #ffd700, #fff8dc, #d4a843)",
                        WebkitBackgroundClip: "text",
                        WebkitTextFillColor: "transparent",
                        filter: "drop-shadow(0 0 12px rgba(255,215,0,0.5))",
                      }}
                    >
                      {winner.hand.description}
                    </span>
                  </motion.div>

                  {/* Pot won — LARGE */}
                  <motion.div
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.7, type: "spring" }}
                    className="mt-2"
                  >
                    <span className="text-gray-400 text-lg mr-2">Wins</span>
                    <motion.span
                      initial={{ scale: 1.8, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ delay: 0.8, type: "spring", stiffness: 300 }}
                      className="font-black font-mono text-4xl"
                      style={{
                        color: "#ffd700",
                        textShadow: "0 0 30px rgba(255,215,0,0.5), 0 0 60px rgba(255,215,0,0.2)",
                      }}
                    >
                      ${Math.round(pot / winners.length).toLocaleString()}
                    </motion.span>
                  </motion.div>
                </motion.div>
              );
            })}

            {/* ── Other players' hands (losers) — smaller row below ── */}
            {losers.length > 0 && (
              <motion.div
                initial={{ y: 30, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.85 }}
                className="mt-2"
              >
                <div className="text-center text-xs text-gray-500 uppercase tracking-widest mb-3">
                  Other Hands
                </div>
                <div className="flex flex-wrap justify-center gap-4">
                  {losers.map((result, i) => {
                    const player = players.find(p => p.id === result.playerId);
                    if (!player || !player.cards) return null;

                    // Cards may be hidden (showAllHands=false on table config)
                    const cardsHidden = player.cards.every(c => c.hidden);

                    return (
                      <motion.div
                        key={result.playerId}
                        initial={{ opacity: 0, y: 15 }}
                        animate={{ opacity: 0.6, y: 0 }}
                        transition={{ delay: 0.95 + i * 0.1 }}
                        className="glass rounded-xl p-3 text-center"
                        style={{ minWidth: "140px" }}
                      >
                        <div className="text-sm font-bold text-white/70 mb-1 truncate">
                          {player.name}
                        </div>
                        <div className="flex gap-1.5 justify-center mb-1.5">
                          {cardsHidden ? (
                            <>
                              <Card faceDown size="lg" delay={1.0 + i * 0.1} />
                              <Card faceDown size="lg" delay={1.1 + i * 0.1} />
                            </>
                          ) : (
                            <>
                              <Card card={{ ...player.cards[0], hidden: false }} size="lg" delay={1.0 + i * 0.1} />
                              <Card card={{ ...player.cards[1], hidden: false }} size="lg" delay={1.1 + i * 0.1} />
                            </>
                          )}
                        </div>
                        <div className="text-xs font-mono text-gray-400">
                          {cardsHidden ? "Mucked" : result.hand.description}
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              </motion.div>
            )}

            {/* ── Dismiss button — visible at bottom ── */}
            {onDismiss && (
              <motion.button
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 1.2 }}
                onClick={(e) => { e.stopPropagation(); onDismiss(); }}
                data-testid="button-dismiss-showdown"
                className="mt-6 mx-auto block px-8 py-3 rounded-xl font-black uppercase tracking-widest text-sm"
                style={{
                  background: "linear-gradient(180deg, rgba(212,175,55,0.25) 0%, rgba(212,175,55,0.10) 100%)",
                  border: "1px solid rgba(212,175,55,0.4)",
                  color: "#ffd700",
                  boxShadow: "0 0 20px rgba(212,175,55,0.15)",
                  textShadow: "0 0 8px rgba(255,215,0,0.4)",
                }}
              >
                Continue
              </motion.button>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
