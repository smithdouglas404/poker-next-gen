import { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Share2, Check, MessageSquare, X } from "lucide-react";

interface ShareReplayButtonProps {
  handId: string;
}

export function ShareReplayButton({ handId }: ShareReplayButtonProps) {
  const [copied, setCopied] = useState(false);
  const [showCommentary, setShowCommentary] = useState(false);
  const [commentary, setCommentary] = useState(() => {
    try {
      return localStorage.getItem(`replay-commentary-${handId}`) ?? "";
    } catch {
      return "";
    }
  });
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const shareUrl = `${window.location.origin}/replay/${handId}`;

  function handleCopy() {
    const truncatedCommentary = commentary.slice(0, 2000);
    const textToCopy = truncatedCommentary
      ? `${shareUrl}?commentary=${encodeURIComponent(truncatedCommentary)}`
      : shareUrl;

    navigator.clipboard.writeText(textToCopy).then(() => {
      setCopied(true);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => setCopied(false), 2000);
    });
  }

  function handleCommentaryChange(value: string) {
    setCommentary(value);
    try {
      localStorage.setItem(`replay-commentary-${handId}`, value);
    } catch {
      // storage full or unavailable
    }
  }

  return (
    <div className="relative">
      <div className="flex items-center gap-2">
        {/* Share / Copy button */}
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={handleCopy}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-sm transition-all"
          style={{
            background: copied
              ? "rgba(34,197,94,0.2)"
              : "linear-gradient(135deg, #d4af37 0%, #b8962e 100%)",
            color: copied ? "#22c55e" : "#000",
            border: copied ? "1px solid rgba(34,197,94,0.3)" : "1px solid transparent",
            boxShadow: copied ? "none" : "0 0 20px rgba(212,175,55,0.25)",
          }}
        >
          <AnimatePresence mode="wait">
            {copied ? (
              <motion.span
                key="check"
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                exit={{ scale: 0 }}
                className="flex items-center gap-1.5"
              >
                <Check className="w-4 h-4" />
                Copied!
              </motion.span>
            ) : (
              <motion.span
                key="share"
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                exit={{ scale: 0 }}
                className="flex items-center gap-1.5"
              >
                <Share2 className="w-4 h-4" />
                Share Replay
              </motion.span>
            )}
          </AnimatePresence>
        </motion.button>

        {/* Commentary toggle */}
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => setShowCommentary(!showCommentary)}
          className="p-2.5 rounded-xl transition-all"
          style={{
            background: showCommentary
              ? "rgba(212,175,55,0.15)"
              : "rgba(255,255,255,0.05)",
            border: showCommentary
              ? "1px solid rgba(212,175,55,0.3)"
              : "1px solid rgba(255,255,255,0.1)",
            color: showCommentary ? "#d4af37" : "#9ca3af",
          }}
          title="Add commentary"
        >
          {showCommentary ? <X className="w-4 h-4" /> : <MessageSquare className="w-4 h-4" />}
        </motion.button>
      </div>

      {/* Commentary textarea */}
      <AnimatePresence>
        {showCommentary && (
          <motion.div
            initial={{ opacity: 0, height: 0, marginTop: 0 }}
            animate={{ opacity: 1, height: "auto", marginTop: 12 }}
            exit={{ opacity: 0, height: 0, marginTop: 0 }}
            className="overflow-hidden"
          >
            <textarea
              value={commentary}
              onChange={(e) => handleCommentaryChange(e.target.value)}
              placeholder="Add your commentary to share with this replay..."
              rows={3}
              className="w-full px-4 py-3 rounded-xl text-sm resize-none focus:outline-none transition-all"
              style={{
                background: "rgba(15,23,30,0.8)",
                border: "1px solid rgba(212,175,55,0.15)",
                color: "#e5e7eb",
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = "rgba(212,175,55,0.4)";
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = "rgba(212,175,55,0.15)";
              }}
            />
            <p className="text-[0.625rem] text-gray-600 mt-1.5">
              Commentary is saved locally and included when you share the link.
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
