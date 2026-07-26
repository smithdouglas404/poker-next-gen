import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Mic, MicOff, Eye, EyeOff, Volume2, VolumeX } from "lucide-react";
import { commentaryPlayer, type SpeakerChangeCallback } from "@/lib/commentary-engine";

// ─── Subtitle Overlay ────────────────────────────────────────────────────────

interface CommentarySubtitlesProps {
  enabled: boolean;
}

export function CommentarySubtitles({ enabled }: CommentarySubtitlesProps) {
  const [speaker, setSpeaker] = useState<"pbp" | "analyst" | null>(null);
  const [text, setText] = useState<string | null>(null);
  const [emphasis, setEmphasis] = useState<"normal" | "excited" | "thoughtful" | null>(null);

  useEffect(() => {
    const handler: SpeakerChangeCallback = (s, t, e) => {
      setSpeaker(s);
      setText(t);
      setEmphasis(e);
    };
    commentaryPlayer.onSpeakerChange = handler;
    return () => {
      if (commentaryPlayer.onSpeakerChange === handler) {
        commentaryPlayer.onSpeakerChange = null;
      }
    };
  }, []);

  if (!enabled || !speaker || !text) return null;

  const speakerName = speaker === "pbp" ? "LON" : "NORMAN";
  const speakerColor = speaker === "pbp" ? "#d4af37" : "#ffd700";
  const isExcited = emphasis === "excited";

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={text}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        transition={{ duration: 0.25 }}
        className="fixed bottom-28 left-1/2 -translate-x-1/2 z-50 max-w-lg w-[90vw] pointer-events-none"
      >
        <div
          className="rounded-xl px-4 py-2.5 flex items-start gap-3"
          style={{
            background: "rgba(10, 16, 22, 0.88)",
            backdropFilter: "blur(16px)",
            border: `1px solid ${speakerColor}30`,
            boxShadow: `0 0 20px ${speakerColor}10`,
          }}
        >
          {/* Speaker badge */}
          <div className="flex flex-col items-center gap-0.5 shrink-0 pt-0.5">
            <motion.div
              animate={isExcited ? { scale: [1, 1.2, 1] } : {}}
              transition={{ repeat: Infinity, duration: 0.6 }}
            >
              <Mic className="w-3.5 h-3.5" style={{ color: speakerColor }} />
            </motion.div>
            <span
              className="text-[0.5rem] font-black uppercase tracking-widest"
              style={{ color: speakerColor }}
            >
              {speakerName}
            </span>
          </div>
          {/* Text */}
          <p
            className="text-[0.8rem] leading-relaxed"
            style={{
              color: "rgba(255,255,255,0.92)",
              fontStyle: emphasis === "thoughtful" ? "italic" : "normal",
            }}
          >
            {text}
          </p>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

// ─── Controls Panel ──────────────────────────────────────────────────────────

interface CommentaryControlsProps {
  enabled: boolean;
  omniscientMode: boolean;
  onToggle: (enabled: boolean) => void;
  onOmniscientToggle: (enabled: boolean) => void;
}

export function CommentaryControls({
  enabled,
  omniscientMode,
  onToggle,
  onOmniscientToggle,
}: CommentaryControlsProps) {
  const [showPanel, setShowPanel] = useState(false);
  const [volume, setVolume] = useState(() => Math.round(commentaryPlayer.volume * 100));
  const [muted, setMuted] = useState(() => commentaryPlayer.muted);

  const handleToggle = useCallback(() => {
    const next = !enabled;
    onToggle(next);
    commentaryPlayer.enabled = next;
  }, [enabled, onToggle]);

  const handleVolumeChange = useCallback((v: number) => {
    setVolume(v);
    commentaryPlayer.volume = v / 100;
  }, []);

  const handleMuteToggle = useCallback(() => {
    const next = !muted;
    setMuted(next);
    commentaryPlayer.muted = next;
  }, [muted]);

  return (
    <div className="relative">
      <button
        onClick={() => setShowPanel(!showPanel)}
        className={`p-1.5 rounded transition-all duration-200 ${
          enabled
            ? "bg-purple-500/20 shadow-[0_0_8px_rgba(168,85,247,0.3)]"
            : "hover:bg-white/5"
        }`}
        title="AI Commentary"
      >
        {enabled ? (
          <Mic className="w-4 h-4 text-purple-400" />
        ) : (
          <MicOff className="w-4 h-4 text-gray-500" />
        )}
      </button>

      <AnimatePresence>
        {showPanel && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 top-full mt-1.5 z-50 w-56 rounded-lg p-3 space-y-3"
            style={{
              background: "rgba(14, 20, 28, 0.95)",
              border: "1px solid rgba(168, 85, 247, 0.2)",
              backdropFilter: "blur(16px)",
              boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
            }}
          >
            {/* Header */}
            <div className="flex items-center gap-1.5">
              <Mic className="w-3 h-3 text-purple-400" />
              <span className="text-[0.625rem] font-bold uppercase tracking-wider text-purple-400">
                AI Commentary
              </span>
            </div>

            {/* Enable toggle */}
            <ToggleRow
              label="Live Commentary"
              checked={enabled}
              onChange={handleToggle}
              color="purple"
            />

            {/* Omniscient toggle */}
            <ToggleRow
              label="Show Hole Cards"
              icon={omniscientMode ? <Eye className="w-3 h-3 text-amber-400" /> : <EyeOff className="w-3 h-3 text-gray-500" />}
              checked={omniscientMode}
              onChange={() => onOmniscientToggle(!omniscientMode)}
              color="amber"
              disabled={!enabled}
            />

            {/* Volume */}
            <div className={`flex items-center gap-2 ${!enabled ? "opacity-40 pointer-events-none" : ""}`}>
              <button onClick={handleMuteToggle} className="shrink-0">
                {muted ? (
                  <VolumeX className="w-3.5 h-3.5 text-gray-400" />
                ) : (
                  <Volume2 className="w-3.5 h-3.5 text-gray-400" />
                )}
              </button>
              <input
                type="range"
                min={0}
                max={100}
                value={volume}
                onChange={(e) => handleVolumeChange(parseInt(e.target.value))}
                className="flex-1 h-1 accent-purple-500 cursor-pointer"
              />
              <span className="text-[0.5625rem] text-gray-500 w-7 text-right tabular-nums">
                {volume}%
              </span>
            </div>

            {/* Info */}
            <p className="text-[0.5rem] text-gray-600 leading-tight">
              Two commentators discuss player stats, tendencies, and key hands — like a real poker broadcast.
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Toggle Row ──────────────────────────────────────────────────────────────

function ToggleRow({
  label,
  icon,
  checked,
  onChange,
  color,
  disabled,
}: {
  label: string;
  icon?: React.ReactNode;
  checked: boolean;
  onChange: () => void;
  color: "purple" | "amber";
  disabled?: boolean;
}) {
  const activeColor = color === "purple" ? "bg-purple-500" : "bg-amber-500";
  return (
    <label
      className={`flex items-center justify-between cursor-pointer ${
        disabled ? "opacity-40 pointer-events-none" : ""
      }`}
    >
      <span className="text-xs text-white/80 flex items-center gap-1.5">
        {icon}
        {label}
      </span>
      <button
        onClick={(e) => { e.preventDefault(); onChange(); }}
        className={`relative w-8 h-4 rounded-full transition-colors ${
          checked ? activeColor : "bg-gray-600"
        }`}
      >
        <div
          className={`absolute top-0.5 w-3 h-3 bg-white rounded-full transition-transform ${
            checked ? "left-[18px]" : "left-0.5"
          }`}
        />
      </button>
    </label>
  );
}
