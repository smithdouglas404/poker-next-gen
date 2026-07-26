import { motion } from "framer-motion";
import { ReplaySnapshot } from "@/hooks/useHandReplayState";
import { Play, Pause, SkipBack, SkipForward, Gauge } from "lucide-react";

interface ReplayTimelineProps {
  snapshot: ReplaySnapshot;
  onStepForward: () => void;
  onStepBackward: () => void;
  onTogglePlay: () => void;
  onGoToAction: (idx: number) => void;
  onCycleSpeed: () => void;
}

export function ReplayTimeline({
  snapshot,
  onStepForward,
  onStepBackward,
  onTogglePlay,
  onGoToAction,
  onCycleSpeed,
}: ReplayTimelineProps) {
  const { actionIndex, totalActions, isPlaying, speed, streetMarkers } = snapshot;
  const progress = totalActions > 0 ? Math.max(0, (actionIndex + 1) / totalActions) : 0;

  return (
    <div
      className="rounded-xl p-4"
      style={{
        background: "rgba(20,31,40,0.65)",
        backdropFilter: "blur(16px)",
        border: "1px solid rgba(212,175,55,0.12)",
      }}
    >
      {/* Street markers */}
      <div className="flex items-center gap-2 mb-3">
        {streetMarkers.map((marker, i) => {
          const isCurrentOrPast = actionIndex >= marker.actionIndex;
          return (
            <button
              key={i}
              onClick={() => onGoToAction(marker.actionIndex)}
              className={`px-2.5 py-1 rounded text-[0.5625rem] font-bold uppercase tracking-wider transition-all ${
                isCurrentOrPast
                  ? "bg-amber-500/20 text-amber-400 border border-amber-500/20"
                  : "text-gray-600 hover:text-gray-400 border border-transparent"
              }`}
            >
              {marker.label}
            </button>
          );
        })}
        <div className="flex-1" />
        <span className="text-[0.625rem] font-mono text-gray-500">
          {Math.max(0, actionIndex + 1)} / {totalActions}
        </span>
      </div>

      {/* Scrubber bar */}
      <div
        className="relative h-2 rounded-full bg-white/5 mb-4 cursor-pointer group"
        onClick={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const x = (e.clientX - rect.left) / rect.width;
          const idx = Math.max(0, Math.round(x * totalActions) - 1);
          onGoToAction(idx);
        }}
      >
        {/* Progress fill */}
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-cyan-500 to-cyan-400 transition-all duration-150"
          style={{ width: `${progress * 100}%` }}
        />
        {/* Street marker dots */}
        {streetMarkers.map((marker, i) => {
          if (i === 0) return null;
          const pos = (marker.actionIndex / totalActions) * 100;
          return (
            <div
              key={i}
              className="absolute top-1/2 -translate-y-1/2 w-1 h-1 rounded-full bg-white/30"
              style={{ left: `${pos}%` }}
            />
          );
        })}
        {/* Playhead */}
        <div
          className="absolute top-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full bg-amber-400 border-2 border-white shadow-[0_0_8px_rgba(212,175,55,0.4)] transition-all duration-150 group-hover:scale-125"
          style={{ left: `calc(${progress * 100}% - 7px)` }}
        />
      </div>

      {/* Transport controls */}
      <div className="flex items-center justify-center gap-3">
        {/* Step back */}
        <button
          onClick={onStepBackward}
          className="p-2 rounded-lg hover:bg-white/5 transition-colors text-gray-400 hover:text-white"
          title="Step back (Left arrow)"
        >
          <SkipBack className="w-4 h-4" />
        </button>

        {/* Play/Pause */}
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={onTogglePlay}
          className="p-3 rounded-full transition-all"
          style={{
            background: isPlaying
              ? "rgba(212,175,55,0.15)"
              : "linear-gradient(135deg, #d4af37, #009ec2)",
            border: `1px solid ${isPlaying ? "rgba(212,175,55,0.3)" : "transparent"}`,
            boxShadow: isPlaying ? "none" : "0 0 15px rgba(212,175,55,0.3)",
          }}
          title="Play/Pause (Space)"
        >
          {isPlaying ? (
            <Pause className="w-5 h-5 text-amber-400" />
          ) : (
            <Play className="w-5 h-5 text-black" />
          )}
        </motion.button>

        {/* Step forward */}
        <button
          onClick={onStepForward}
          className="p-2 rounded-lg hover:bg-white/5 transition-colors text-gray-400 hover:text-white"
          title="Step forward (Right arrow)"
        >
          <SkipForward className="w-4 h-4" />
        </button>

        {/* Speed selector */}
        <button
          onClick={onCycleSpeed}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[0.625rem] font-bold font-mono hover:bg-white/5 transition-colors text-gray-400 hover:text-white border border-white/5"
          title="Cycle speed"
        >
          <Gauge className="w-3 h-3" />
          {speed}x
        </button>
      </div>

      {/* Current action label */}
      {snapshot.currentAction && (
        <div className="mt-3 text-center">
          <span className="text-[0.625rem] text-gray-500">
            {snapshot.players.find(p => p.id === snapshot.currentAction!.playerId)?.displayName ?? "Player"}
            {" "}
          </span>
          <span className="text-[0.625rem] font-bold text-amber-400 uppercase">
            {snapshot.currentAction.action}
          </span>
          {snapshot.currentAction.amount ? (
            <span className="text-[0.625rem] font-mono text-white ml-1">
              {snapshot.currentAction.amount.toLocaleString()}
            </span>
          ) : null}
        </div>
      )}
    </div>
  );
}
