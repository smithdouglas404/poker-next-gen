// Insurance Panel — equity cash-out offer on all-in
import { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";

interface InsuranceOffer {
  playerId: string;
  equity: number;
  cashOutAmount: number;
  fee: number;
}

interface InsurancePanelProps {
  offer: InsuranceOffer;
  onAccept: () => void;
  onDecline: () => void;
}

export function InsurancePanel({ offer, onAccept, onDecline }: InsurancePanelProps) {
  const [countdown, setCountdown] = useState(15);
  const [responded, setResponded] = useState(false);
  const onDeclineRef = useRef(onDecline);
  onDeclineRef.current = onDecline;

  useEffect(() => {
    if (responded) return;
    const interval = setInterval(() => {
      setCountdown(c => {
        if (c <= 1) {
          clearInterval(interval);
          setResponded(true);
          onDeclineRef.current();
          return 0;
        }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [responded]);

  const handleAccept = () => {
    if (responded) return;
    setResponded(true);
    onAccept();
  };

  const handleDecline = () => {
    if (responded) return;
    setResponded(true);
    onDecline();
  };

  const equityPct = Math.round(offer.equity * 100);

  return (
    <motion.div
      initial={{ scale: 0.8, opacity: 0, y: 20 }}
      animate={{ scale: 1, opacity: 1, y: 0 }}
      exit={{ scale: 0.8, opacity: 0, y: 20 }}
      className="fixed bottom-32 left-1/2 -translate-x-1/2 z-[60] w-[340px]"
    >
      <div
        className="rounded-xl overflow-hidden backdrop-blur-xl"
        style={{
          background: "linear-gradient(135deg, rgba(10,15,30,0.95), rgba(20,10,40,0.95))",
          border: "1px solid rgba(212,175,55,0.2)",
          boxShadow: "0 0 30px rgba(212,175,55,0.1), inset 0 1px 0 rgba(255,255,255,0.05)",
        }}
      >
        {/* Holographic top border */}
        <div
          className="h-[2px] w-full"
          style={{
            background: "linear-gradient(90deg, transparent, #d4af37, #d4af37, #d4af37, transparent)",
          }}
        />

        <div className="p-4">
          {/* Header */}
          <div className="flex items-center justify-between mb-3">
            <div className="text-[0.625rem] font-bold uppercase tracking-[0.2em] text-amber-400">
              Equity Insurance
            </div>
            <div
              className="text-xs font-mono font-bold px-2 py-0.5 rounded-full"
              style={{
                background: countdown <= 5 ? "rgba(239,68,68,0.2)" : "rgba(255,255,255,0.05)",
                color: countdown <= 5 ? "#ef4444" : "#a0a0a0",
                border: `1px solid ${countdown <= 5 ? "rgba(239,68,68,0.3)" : "rgba(255,255,255,0.1)"}`,
              }}
            >
              {countdown}s
            </div>
          </div>

          {/* Equity display */}
          <div className="flex items-center justify-center gap-6 mb-4">
            <div className="text-center">
              <div className="text-[0.5625rem] uppercase tracking-wider text-gray-500 mb-1">Your Equity</div>
              <div className="text-2xl font-bold font-mono text-white">{equityPct}%</div>
            </div>
            <div className="w-px h-10 bg-white/10" />
            <div className="text-center">
              <div className="text-[0.5625rem] uppercase tracking-wider text-gray-500 mb-1">Cash Out</div>
              <div className="text-2xl font-bold font-mono" style={{ color: "#ffd700" }}>
                ${offer.cashOutAmount.toLocaleString()}
              </div>
              <div className="text-[0.5rem] text-gray-600 font-mono">{offer.fee}% fee: ${Math.round(offer.cashOutAmount * offer.fee / 100).toLocaleString()}</div>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex gap-3">
            <motion.button
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              onClick={handleAccept}
              disabled={responded}
              className="flex-1 py-2.5 rounded-lg font-bold text-sm uppercase tracking-wider text-white disabled:opacity-50"
              style={{
                background: "linear-gradient(135deg, #059669, #047857)",
                boxShadow: "0 0 15px rgba(5,150,105,0.3)",
              }}
            >
              SIGN
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              onClick={handleDecline}
              disabled={responded}
              className="flex-1 py-2.5 rounded-lg font-bold text-sm uppercase tracking-wider text-white disabled:opacity-50"
              style={{
                background: "linear-gradient(135deg, #dc2626, #b91c1c)",
                boxShadow: "0 0 15px rgba(220,38,38,0.3)",
              }}
            >
              BURN
            </motion.button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
