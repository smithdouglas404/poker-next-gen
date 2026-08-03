import { useState, useEffect, useMemo } from "react";
import { motion, useMotionValue, useTransform, animate } from "framer-motion";
import { cn } from "@/features/hrc/lib/utils";
import { CardType, Suit } from "@/features/hrc/lib/poker-types";
import { useGameUI } from "@/features/hrc/lib/game-ui-context";
import { useSoundEngine } from "@/features/hrc/lib/sound-context";

interface CardProps {
  card?: CardType;
  className?: string;
  size?: "sm" | "md" | "lg" | "xl" | "2xl" | "3xl";
  delay?: number;
  isHero?: boolean;
  dealFrom?: { x: number; y: number };
  onDealt?: () => void;
  faceDown?: boolean;
  flipDelay?: number;
}

/* ── Suit glow colors for hero card shadows (4-color deck: red/blue/green/dark) ── */
const suitGlow: Record<Suit, string> = {
  hearts:   "rgba(220,38,38,0.5)",
  diamonds: "rgba(59,130,246,0.5)",
  clubs:    "rgba(34,197,94,0.45)",
  spades:   "rgba(148,163,184,0.4)",
};

// Card sizes use strict 2:3 ratio matching SVG native 210x315
const sizeConfig = {
  sm:    { w: "w-[50px]",   h: "h-[75px]",   wPx: 50,  hPx: 75  },
  md:    { w: "w-[70px]",   h: "h-[105px]",  wPx: 70,  hPx: 105 },
  lg:    { w: "w-[90px]",   h: "h-[135px]",  wPx: 90,  hPx: 135 },
  xl:    { w: "w-[108px]",  h: "h-[162px]",  wPx: 108, hPx: 162 },
  "2xl": { w: "w-[130px]",  h: "h-[195px]",  wPx: 130, hPx: 195 },
  "3xl": { w: "w-[160px]",  h: "h-[240px]",  wPx: 160, hPx: 240 },
};

/* ── Card image URLs (Doug's SVG deck) ── */
function getCardFaceUrl(rank: string, suit: string): string {
  return `/cards/${rank}_${suit}.svg`;
}

const CARD_BACK_URL = "/cardbacks/cardback_royal.webp";
const CARD_BACK_FALLBACK = "/cardbacks/cardback_classic.webp";

// A card at rest: square on its flex position, no leftover deal offset or tilt.
// Module-level so the object identity is stable across renders, for the same
// reason COMMUNITY_DEAL_FROM is hoisted in ImageTable — framer-motion restarts
// an in-flight animation when handed a new `animate` object identity.
const CARD_REST = { rotateY: 0, scale: 1, opacity: 1, x: 0, y: 0, rotate: 0 };

/* ── Card face: SVG card with realistic styling ── */
function CardFace({ card, isHero }: { card: CardType; isHero: boolean }) {
  return (
    <div className="absolute inset-0 rounded-lg overflow-hidden" style={{
      border: isHero ? "2px solid #d4af37" : "1.5px solid rgba(180,160,120,0.5)",
      boxShadow: isHero
        ? "inset 0 0 10px rgba(212,175,55,0.15), inset 0 1px 0 rgba(255,255,255,0.15)"
        : "inset 0 0 6px rgba(0,0,0,0.12), inset 0 1px 0 rgba(255,255,255,0.1)",
      background: "#fdfeee",
    }}>
      <img
        src={getCardFaceUrl(card.rank, card.suit)}
        alt={`${card.rank} of ${card.suit}`}
        className="w-full h-full object-contain"
        draggable={false}
        style={{ filter: "contrast(1.05) saturate(1.1)" }}
      />
      {/* Paper texture + light sheen */}
      <div className="absolute inset-0 rounded-lg pointer-events-none" style={{
        background: `
          linear-gradient(155deg, rgba(255,255,255,0.25) 0%, transparent 20%, transparent 60%, rgba(255,255,255,0.08) 100%),
          linear-gradient(to bottom, rgba(255,255,255,0.06) 0%, transparent 30%, rgba(0,0,0,0.04) 100%)
        `,
      }} />
      {/* Subtle edge shadow for depth */}
      <div className="absolute inset-0 rounded-lg pointer-events-none" style={{
        boxShadow: "inset 0 0 3px rgba(0,0,0,0.08), inset 0 -1px 2px rgba(0,0,0,0.06)",
      }} />
    </div>
  );
}

/* ── Card back: Nano Banana generated image ── */
function CardBack({ imageUrl }: { imageUrl?: string }) {
  const src = imageUrl || CARD_BACK_URL;
  const [imgSrc, setImgSrc] = useState(src);
  // Update if prop changes
  useEffect(() => { setImgSrc(imageUrl || CARD_BACK_URL); }, [imageUrl]);
  return (
    <div className="absolute inset-0 rounded-lg p-[1.5px]"
      style={{ background: "linear-gradient(135deg, #d4af37 0%, #8b6914 25%, #d4af37 50%, #8b6914 75%, #d4af37 100%)" }}
    >
      <div className="w-full h-full rounded-[6px] overflow-hidden relative">
        <img
          src={imgSrc}
          alt="card back"
          className="w-full h-full object-cover"
          draggable={false}
          onError={() => setImgSrc(CARD_BACK_FALLBACK)}
        />
        <div className="absolute inset-x-0 top-0 bg-gradient-to-b from-white/[0.06] to-transparent" style={{ height: "25%" }} />
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   MAIN CARD COMPONENT — Nano Banana images + animations
   ═══════════════════════════════════════════════════════════════════════════ */
export function Card({
  card,
  className,
  size = "md",
  delay = 0,
  isHero = false,
  dealFrom,
  onDealt,
  faceDown = false,
  flipDelay = 0,
}: CardProps) {
  const s = sizeConfig[size];
  const [holoActive, setHoloActive] = useState(false);
  const [hasFlipped, setHasFlipped] = useState(false);
  let compactMode = false;
  let cardBackImageUrl: string | undefined;
  try {
    const gameUI = useGameUI();
    compactMode = gameUI.compactMode;
    cardBackImageUrl = gameUI.cardBackPreset?.imageUrl;
  } catch {}
  let sound: ReturnType<typeof useSoundEngine> | null = null;
  try { sound = useSoundEngine(); } catch {}

  // 3D flip: back (rotateY=0) → front (rotateY=180)
  const rotateY = useMotionValue(faceDown ? 0 : 180);
  const backOpacity = useTransform(rotateY, [0, 90, 91, 180], [1, 1, 0, 0]);
  const frontOpacity = useTransform(rotateY, [0, 89, 90, 180], [0, 0, 1, 1]);

  useEffect(() => {
    if (!faceDown && !hasFlipped && card && !card.hidden) {
      const timer = setTimeout(() => {
        animate(rotateY, 180, {
          type: "spring",
          stiffness: 200,
          damping: 20,
          onComplete: () => setHasFlipped(true),
        });
        sound?.playCardFlip();
      }, flipDelay * 1000);
      return () => clearTimeout(timer);
    }
  }, [faceDown, hasFlipped, flipDelay, rotateY, card, sound]);

  // Memoized on the underlying values (not the `dealFrom` object itself,
  // which callers like ImageTable recreate as a fresh literal every render):
  // framer-motion restarts an in-flight spring whenever it receives a new
  // `transition`/`animate` object identity, so an unmemoized dealAnimation
  // here made every parent re-render re-trigger the deal-in tween from
  // wherever it currently was — cards could get caught mid-flight, frozen at
  // a random offset/rotation forever once re-renders settled, instead of
  // ever reaching their resting (0,0,0) position.
  const dealAnimation = useMemo(() => {
    if (compactMode) {
      return {
        initial: { scale: 1, opacity: 1, x: 0, y: 0, rotate: 0 },
        animate: { scale: 1, opacity: 1, x: 0, y: 0, rotate: 0 },
        transition: { duration: 0 },
      };
    }
    if (dealFrom) {
      return {
        initial: { x: dealFrom.x, y: dealFrom.y, scale: 0.2, opacity: 0, rotate: -20 },
        animate: { x: 0, y: 0, scale: 1, opacity: 1, rotate: 0 },
        transition: {
          type: "spring" as const,
          stiffness: 200,
          damping: 20,
          delay,
        },
      };
    }
    return {
      initial: { scale: 0.4, opacity: 0, y: -40 },
      animate: { scale: 1, opacity: 1, y: 0 },
      transition: { type: "spring" as const, stiffness: 200, damping: 20, delay },
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compactMode, dealFrom?.x, dealFrom?.y, delay]);

  // ── Branch 1: Face-down with 3D flip animation ──
  if ((faceDown || !hasFlipped) && card && !card.hidden && !compactMode) {
    return (
      <motion.div
        {...dealAnimation}
        onAnimationComplete={() => {
          onDealt?.();
          sound?.playCardDeal();
        }}
        className={cn("relative select-none", s.w, s.h, className)}
        style={{ perspective: 800 }}
      >
        <motion.div
          className="w-full h-full relative"
          style={{ rotateY, transformStyle: "preserve-3d" }}
        >
          <motion.div
            className="absolute inset-0 rounded-lg overflow-hidden"
            style={{ backfaceVisibility: "hidden", opacity: backOpacity }}
          >
            <CardBack imageUrl={cardBackImageUrl} />
          </motion.div>
          <motion.div
            className="absolute inset-0 rounded-lg"
            style={{ backfaceVisibility: "hidden", rotateY: 180, opacity: frontOpacity }}
          >
            <CardFace card={card} isHero={isHero} />
          </motion.div>
        </motion.div>
      </motion.div>
    );
  }

  // ── Branch 2: Hidden / no card — card back only ──
  if (!card || card.hidden) {
    return (
      <motion.div
        {...dealAnimation}
        onAnimationComplete={() => onDealt?.()}
        className={cn(
          "relative rounded-lg overflow-hidden select-none",
          s.w, s.h,
          isHero ? "card-shadow-hero" : "card-shadow",
          className
        )}
      >
        <CardBack imageUrl={cardBackImageUrl} />
      </motion.div>
    );
  }

  // ── Branch 3: Normal face-up card ──
  // If hasFlipped is true, the card already completed a 3D flip — skip the rotateY entrance
  const glow = suitGlow[card.suit];
  const skipEntrance = hasFlipped || compactMode;

  // Branch 1 (the face-down deal) animates x/y/rotate via dealAnimation. When
  // the flip completes mid-deal, React reconciles that same motion.div into
  // THIS branch — whose animate target used to mention only rotateY/scale/
  // opacity. framer-motion leaves a motion value it is not told about exactly
  // where it is, so the in-flight deal spring was abandoned and x/y/rotate
  // froze forever at whatever partial value they held.
  //
  // That is why the community row rendered as a scatter: the row container
  // measured dead centre (cx 800, w 390) while its five children sat at
  // cy 421/428/514/517/510, the first two stuck at translate(183.5, -91.8) —
  // partway along COMMUNITY_DEAL_FROM's {x:200, y:-100} path — with ~18deg of
  // the -20deg deal tilt still on them.
  //
  // Restating the full resting pose (CARD_REST — x/y/rotate = 0, the same end
  // state Branch 1 already declares) means every card lands on its flex
  // position no matter which branch it is in when the deal spring is
  // interrupted.
  return (
    <motion.div
      initial={skipEntrance ? CARD_REST : { rotateY: 180, scale: 0.6, opacity: 0 }}
      animate={CARD_REST}
      transition={skipEntrance ? { duration: 0 } : { type: "spring", stiffness: 200, damping: 20, delay }}
      whileHover={isHero && !compactMode ? {
        rotateY: -15,
        rotateX: 10,
        y: -22,
        scale: 1.12,
        transition: { duration: 0.2, ease: "easeOut" },
      } : undefined}
      onAnimationComplete={() => {
        if (isHero && !compactMode) setHoloActive(true);
        onDealt?.();
      }}
      className={cn(
        "relative rounded-lg overflow-hidden select-none cursor-default",
        s.w, s.h,
        isHero ? "card-shadow-hero" : "card-shadow",
        className
      )}
      style={{
        boxShadow: isHero
          ? `0 6px 16px rgba(0,0,0,0.5), 0 16px 36px rgba(0,0,0,0.35), 0 0 28px ${glow}, 0 1px 0 rgba(255,255,255,0.1)`
          : `0 4px 12px rgba(0,0,0,0.5), 0 10px 24px rgba(0,0,0,0.3), 0 1px 0 rgba(255,255,255,0.08)`,
        transformOrigin: isHero ? "left center" : "center center",
      }}
    >
      <CardFace card={card} isHero={isHero} />

      {/* Holographic sweep on hero cards */}
      {holoActive && (
        <div
          className="absolute inset-0 rounded-lg pointer-events-none"
          style={{
            background: "linear-gradient(105deg, rgba(255,0,0,0.12) 0%, rgba(255,154,0,0.12) 10%, rgba(208,222,33,0.12) 20%, rgba(79,220,74,0.12) 30%, rgba(63,218,216,0.12) 40%, rgba(47,201,226,0.12) 50%, rgba(28,127,238,0.12) 60%, rgba(95,21,242,0.12) 70%, rgba(186,12,248,0.12) 80%, rgba(251,7,217,0.12) 90%, rgba(255,0,0,0.12) 100%)",
            backgroundSize: "200% 100%",
            animation: "holoSweep 1.5s ease-out forwards",
            mixBlendMode: "screen",
          }}
          onAnimationEnd={() => setHoloActive(false)}
        />
      )}
    </motion.div>
  );
}
