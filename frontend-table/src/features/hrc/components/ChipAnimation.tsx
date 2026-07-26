import { motion, AnimatePresence } from "framer-motion";
import { useState, useEffect, useCallback, useRef } from "react";

interface ChipFlight {
  id: string;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  amount: number;
  color: string;
}

interface ChipAnimationProps {
  /** Container dimensions for coordinate mapping */
  containerRef: React.RefObject<HTMLDivElement | null>;
}

// Chip colors based on amount
function chipColor(amount: number): string {
  if (amount >= 500) return "linear-gradient(135deg, #ffd700, #c9a84c)";
  if (amount >= 100) return "linear-gradient(135deg, #1a1a2e, #2d2d44)";
  if (amount >= 50) return "linear-gradient(135deg, #e74c3c, #c0392b)";
  return "linear-gradient(135deg, #2ecc71, #27ae60)";
}

export function ChipAnimation({ containerRef }: ChipAnimationProps) {
  const [flights, setFlights] = useState<ChipFlight[]>([]);

  const addFlight = useCallback((flight: Omit<ChipFlight, 'id'>) => {
    const id = `chip-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    setFlights(prev => [...prev, { ...flight, id }]);
  }, []);

  const removeFlight = useCallback((id: string) => {
    setFlights(prev => prev.filter(f => f.id !== id));
  }, []);

  // Expose via window for other components to trigger
  useEffect(() => {
    (window as any).__chipAnimate = addFlight;
    return () => { delete (window as any).__chipAnimate; };
  }, [addFlight]);

  return (
    <div className="absolute inset-0 pointer-events-none z-40">
      <AnimatePresence>
        {flights.map((flight) => (
          <ChipFlightAnim
            key={flight.id}
            flight={flight}
            onComplete={() => removeFlight(flight.id)}
          />
        ))}
      </AnimatePresence>
    </div>
  );
}

function ChipFlightAnim({ flight, onComplete }: { flight: ChipFlight; onComplete: () => void }) {
  // Calculate midpoint with arc
  const midX = (flight.fromX + flight.toX) / 2;
  const midY = Math.min(flight.fromY, flight.toY) - 40; // arc upward

  return (
    <motion.div
      className="absolute"
      initial={{
        left: flight.fromX,
        top: flight.fromY,
        scale: 1,
        opacity: 1,
      }}
      animate={{
        left: [flight.fromX, midX, flight.toX],
        top: [flight.fromY, midY, flight.toY],
        scale: [1, 1.2, 0.8],
        opacity: [1, 1, 0.8],
      }}
      transition={{
        duration: 0.6,
        ease: "easeInOut",
      }}
      onAnimationComplete={onComplete}
    >
      {/* Stack of 3 chips */}
      <div className="relative w-6 h-6">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="absolute left-0 w-6 h-6 rounded-full"
            style={{
              bottom: `${i * 2}px`,
              background: flight.color || chipColor(flight.amount),
              boxShadow: "0 2px 4px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.2)",
              border: "1.5px dashed rgba(255,255,255,0.25)",
              transform: "rotateX(55deg)",
            }}
          />
        ))}
      </div>
    </motion.div>
  );
}

// Helper to trigger chip animation from anywhere
export function triggerChipFlight(
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  amount: number,
) {
  const fn = (window as any).__chipAnimate;
  if (fn) {
    fn({ fromX, fromY, toX, toY, amount, color: chipColor(amount) });
  }
}
