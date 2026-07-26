import { motion, AnimatePresence } from "framer-motion";

interface BreakingNewsModalProps {
  title: string;
  message: string;
  onDismiss: () => void;
}

export default function BreakingNewsModal({ title, message, onDismiss }: BreakingNewsModalProps) {
  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        className="fixed inset-0 z-[9999] flex items-center justify-center"
        style={{
          background: "rgba(0, 0, 0, 0.75)",
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
        }}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.9, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: 20 }}
          transition={{ duration: 0.5, ease: "easeOut", delay: 0.1 }}
          className="relative max-w-lg w-full mx-4 rounded-2xl p-8 text-center"
          style={{
            background: "rgba(15, 15, 25, 0.85)",
            backdropFilter: "blur(20px)",
            WebkitBackdropFilter: "blur(20px)",
            border: "2px solid #d4a843",
            boxShadow:
              "0 0 40px rgba(212, 168, 67, 0.25), 0 0 80px rgba(212, 168, 67, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.05)",
          }}
        >
          {/* Gold accent line at top */}
          <div
            className="absolute top-0 left-1/2 -translate-x-1/2 h-[2px] w-24 rounded-full"
            style={{
              background: "linear-gradient(90deg, transparent, #d4a843, transparent)",
            }}
          />

          <div className="mb-2 text-xs font-semibold uppercase tracking-[0.3em] text-amber-400/70">
            Breaking News
          </div>

          <h2
            className="text-2xl md:text-3xl font-bold mb-4 leading-tight"
            style={{
              background: "linear-gradient(to bottom, #ffd970, #d4a843)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}
          >
            {title}
          </h2>

          <p className="text-gray-300 text-base md:text-lg leading-relaxed mb-8 whitespace-pre-wrap">
            {message}
          </p>

          <button
            onClick={onDismiss}
            className="px-8 py-3 rounded-lg font-bold text-sm uppercase tracking-widest transition-all duration-200 hover:scale-105 active:scale-95 focus:outline-none focus:ring-2 focus:ring-amber-400/50"
            style={{
              background: "linear-gradient(to bottom, #d4a843, #b8912e)",
              color: "#1a1a2e",
              boxShadow: "0 4px 15px rgba(212, 168, 67, 0.3)",
            }}
          >
            Dismiss
          </button>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
