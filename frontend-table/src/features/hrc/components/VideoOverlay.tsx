// Video Overlay — camera/mic controls, recording, and video thumbnail at seats
import { useState, useEffect, useRef, useCallback } from "react";
import { Video, VideoOff, Mic, MicOff, Camera, Circle } from "lucide-react";
import { videoManager } from "@/lib/video-manager";

// Video thumbnail rendered on player seats — fills the full avatar area when active
interface VideoThumbnailProps {
  userId: string;
  isLocal?: boolean;
  size?: number; // kept for API compat, but now fills parent
}

export function VideoThumbnail({ userId, isLocal = false }: VideoThumbnailProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [hasStream, setHasStream] = useState(false);

  useEffect(() => {
    const check = () => {
      const stream = isLocal ? videoManager.getLocalStream() : videoManager.getRemoteStream(userId);
      if (videoRef.current && stream) {
        if (videoRef.current.srcObject !== stream) {
          videoRef.current.srcObject = stream;
        }
        setHasStream(true);
      } else {
        setHasStream(false);
      }
    };

    check();
    const unsub = videoManager.onStateChange(check);
    return () => { unsub(); };
  }, [userId, isLocal]);

  if (!hasStream) return null;

  // Fills the entire avatar area — positioned absolute over the avatar image
  return (
    <div
      className="absolute inset-0 rounded-xl overflow-hidden z-[2]"
      style={{
        boxShadow: "0 0 12px rgba(212,175,55,0.3), inset 0 0 6px rgba(212,175,55,0.1)",
        border: "2px solid rgba(212,175,55,0.5)",
      }}
    >
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={isLocal}
        className="w-full h-full object-cover"
        style={{ transform: isLocal ? "scaleX(-1)" : "none" }}
      />
      {/* Live indicator dot */}
      <div className="absolute top-1.5 right-1.5 w-2.5 h-2.5 rounded-full bg-green-500 animate-pulse shadow-[0_0_8px_rgba(34,197,94,0.6)]" />
    </div>
  );
}

// ─── Video Grid — fixed bottom-left panel with all player feeds ─────────────

import { ChevronDown, ChevronUp } from "lucide-react";

interface VideoFeedProps {
  userId: string;
  playerName: string;
  isLocal?: boolean;
}

function VideoFeed({ userId, playerName, isLocal = false }: VideoFeedProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [hasStream, setHasStream] = useState(false);

  useEffect(() => {
    const check = () => {
      const stream = isLocal ? videoManager.getLocalStream() : videoManager.getRemoteStream(userId);
      if (videoRef.current && stream) {
        if (videoRef.current.srcObject !== stream) {
          videoRef.current.srcObject = stream;
        }
        setHasStream(true);
      } else {
        setHasStream(false);
      }
    };
    check();
    const unsub = videoManager.onStateChange(check);
    return () => { unsub(); };
  }, [userId, isLocal]);

  return (
    <div
      className="relative rounded-lg overflow-hidden bg-black/70 border border-white/10"
      style={{ aspectRatio: "4 / 3" }}
    >
      {hasStream ? (
        <>
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted={isLocal}
            className="w-full h-full object-cover"
            style={{ transform: isLocal ? "scaleX(-1)" : "none" }}
          />
          <div className="absolute top-1 right-1 w-2 h-2 rounded-full bg-green-500 shadow-[0_0_4px_rgba(34,197,94,0.5)]" />
        </>
      ) : (
        <div className="w-full h-full flex items-center justify-center">
          <VideoOff className="w-4 h-4 text-gray-600" />
        </div>
      )}
      {/* Name label */}
      <div className="absolute bottom-0 inset-x-0 px-1.5 py-0.5 bg-gradient-to-t from-black/80 to-transparent">
        <span className="text-[0.5625rem] font-bold text-white/90 truncate block">
          {isLocal ? "You" : playerName}
        </span>
      </div>
    </div>
  );
}

interface VideoGridProps {
  players: { id: string; name: string; isBot?: boolean }[];
  heroId: string;
}

export function VideoGrid({ players, heroId }: VideoGridProps) {
  const [hasAny, setHasAny] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const check = () => {
      const local = videoManager.getLocalStream();
      const anyRemote = players.some(p => p.id !== heroId && videoManager.getRemoteStream(p.id));
      setHasAny(!!(local || anyRemote));
    };
    check();
    const unsub = videoManager.onStateChange(check);
    return () => { unsub(); };
  }, [players, heroId]);

  if (!hasAny) return null;

  // Non-bot players, hero first
  const videoPlayers = players.filter(p => !p.isBot);
  const sorted = [
    ...videoPlayers.filter(p => p.id === heroId),
    ...videoPlayers.filter(p => p.id !== heroId),
  ];

  // Adapt columns: 2 cols for ≤4, 3 cols for 5-9, 4 cols for 10+
  const cols = sorted.length <= 4 ? 2 : sorted.length <= 9 ? 3 : 4;
  // Panel width scales with columns (~120px per col + padding)
  const panelWidth = cols * 120 + 16;

  return (
    <div
      className="fixed bottom-14 left-2 z-40 rounded-xl overflow-hidden"
      style={{
        width: panelWidth,
        background: "rgba(8,14,28,0.92)",
        border: "1px solid rgba(212,175,55,0.15)",
        backdropFilter: "blur(16px)",
        boxShadow: "0 4px 24px rgba(0,0,0,0.5)",
      }}
    >
      {/* Header — always visible, click to collapse */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="w-full flex items-center gap-1.5 px-3 py-1.5 hover:bg-white/5 transition-colors"
      >
        <Video className="w-3 h-3 text-amber-400" />
        <span className="text-[0.625rem] font-bold uppercase tracking-wider text-amber-400">
          Live Video
        </span>
        <span className="text-[0.5rem] text-gray-500 ml-0.5">
          {sorted.length}
        </span>
        <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
        <div className="ml-auto">
          {collapsed
            ? <ChevronUp className="w-3 h-3 text-gray-500" />
            : <ChevronDown className="w-3 h-3 text-gray-500" />
          }
        </div>
      </button>

      {/* Video feeds grid */}
      {!collapsed && (
        <div
          className="p-1.5 gap-1.5 border-t border-white/5"
          style={{ display: "grid", gridTemplateColumns: `repeat(${cols}, 1fr)` }}
        >
          {sorted.map(p => (
            <VideoFeed
              key={p.id}
              userId={p.id}
              playerName={p.name}
              isLocal={p.id === heroId}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// Video control buttons — inline in the top bar, not a floating panel
interface VideoControlBarProps {
  heroId: string;
  tableId: string;
  playerIds: string[];
  isAdmin?: boolean;
}

export function VideoControlBar({ heroId, tableId, playerIds, isAdmin }: VideoControlBarProps) {
  const [active, setActive] = useState(false);
  const [videoOn, setVideoOn] = useState(true);
  const [audioOn, setAudioOn] = useState(true);
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, forceUpdate] = useState(0);

  useEffect(() => {
    const unsub = videoManager.onStateChange(() => {
      setVideoOn(videoManager.isVideoEnabled());
      setAudioOn(videoManager.isAudioEnabled());
      setRecording(videoManager.isRecording());
      forceUpdate((n) => n + 1);
    });
    return () => { unsub(); };
  }, []);

  const handleToggleVideo = useCallback(async () => {
    if (!active) {
      try {
        setError(null);
        await videoManager.start(heroId, tableId, playerIds);
        // If start() returned without creating a call, the service is unavailable
        if (!videoManager.getLocalStream()) {
          setError("Video chat unavailable");
          return;
        }
        setActive(true);
      } catch (err) {
        console.warn("[VideoControlBar] Failed to start video:", err);
        setError("Video chat unavailable");
      }
    } else {
      videoManager.toggleVideo();
    }
  }, [active, heroId, tableId, playerIds]);

  const handleToggleAudio = useCallback(() => {
    if (active) {
      videoManager.toggleAudio();
    }
  }, [active]);

  const handleStop = useCallback(() => {
    videoManager.stop();
    setActive(false);
    setError(null);
  }, []);

  const handleToggleRecording = useCallback(async () => {
    if (recording) {
      await videoManager.stopRecording();
    } else {
      await videoManager.startRecording();
    }
  }, [recording]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      videoManager.stop();
    };
  }, []);

  // Inline buttons designed to sit in the top bar alongside other controls
  return (
    <div className="flex items-center gap-1">
      {/* Error message when video service is unavailable */}
      {error && (
        <span className="text-[0.625rem] font-medium text-gray-500 px-2 py-1 rounded bg-white/5 border border-white/10">
          <VideoOff className="w-3 h-3 inline mr-1 -mt-0.5" />
          {error}
        </span>
      )}
      {/* Join / Camera toggle — prominent when inactive */}
      {!active && !error ? (
        <button
          onClick={handleToggleVideo}
          className="flex items-center gap-1.5 px-3 py-1 rounded text-[0.625rem] font-bold text-amber-400 bg-amber-500/10 border border-amber-500/20 hover:bg-amber-500/20 transition-colors"
          title="Join video chat"
        >
          <Camera className="w-3.5 h-3.5" /> JOIN VIDEO
        </button>
      ) : (
        <>
          {/* Camera toggle */}
          <button
            onClick={handleToggleVideo}
            className={`p-1.5 rounded transition-colors ${
              videoOn
                ? "bg-amber-500/15 hover:bg-amber-500/25"
                : "bg-red-500/15 hover:bg-red-500/25"
            }`}
            title={videoOn ? "Turn off camera" : "Turn on camera"}
          >
            {videoOn ? (
              <Video className="w-3.5 h-3.5 text-amber-400" />
            ) : (
              <VideoOff className="w-3.5 h-3.5 text-red-400" />
            )}
          </button>

          {/* Mic toggle */}
          <button
            onClick={handleToggleAudio}
            className={`p-1.5 rounded transition-colors ${
              audioOn
                ? "bg-amber-500/15 hover:bg-amber-500/25"
                : "bg-red-500/15 hover:bg-red-500/25"
            }`}
            title={audioOn ? "Mute mic" : "Unmute mic"}
          >
            {audioOn ? (
              <Mic className="w-3.5 h-3.5 text-amber-400" />
            ) : (
              <MicOff className="w-3.5 h-3.5 text-red-400" />
            )}
          </button>

          {/* Record button — admin only */}
          {isAdmin && (
            <button
              onClick={handleToggleRecording}
              className={`p-1.5 rounded transition-colors ${
                recording
                  ? "bg-red-500/25"
                  : "hover:bg-white/10"
              }`}
              title={recording ? "Stop recording" : "Start recording"}
            >
              <Circle className={`w-3.5 h-3.5 ${recording ? "text-red-500 fill-red-500" : "text-gray-500"}`} />
            </button>
          )}

          {/* Recording indicator */}
          {recording && (
            <div className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-red-500/15 border border-red-500/30">
              <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
              <span className="text-[0.5rem] font-bold text-red-400 uppercase">REC</span>
            </div>
          )}

          {/* Leave video */}
          <button
            onClick={handleStop}
            className="p-1.5 rounded bg-red-500/10 hover:bg-red-500/20 transition-colors"
            title="Leave video chat"
          >
            <VideoOff className="w-3.5 h-3.5 text-red-400" />
          </button>
        </>
      )}
    </div>
  );
}
