import { Canvas } from "@react-three/fiber";
import { Suspense, useState, useMemo, Component, type ReactNode, type ErrorInfo } from "react";
import * as THREE from "three";
import { SceneRoot } from "./SceneRoot";

/** Auto-detect optimal quality based on device capabilities */
function detectQuality(): "low" | "medium" | "high" | "cinematic" {
  if (typeof window === "undefined") return "medium";
  const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || window.innerWidth < 768;
  const isLowEnd = navigator.hardwareConcurrency !== undefined && navigator.hardwareConcurrency <= 4;
  const isSmallScreen = window.innerWidth < 1024;
  if (isMobile || isLowEnd) return "low";
  if (isSmallScreen) return "medium";
  return "high";
}

class SceneErrorBoundary extends Component<
  { children: ReactNode; onError: (err: Error) => void },
  { hasError: boolean; errorMsg: string }
> {
  state = { hasError: false, errorMsg: "" };
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, errorMsg: error.message };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[PokerScene] Render crash:", error, info?.componentStack);
    this.props.onError(error);
  }
  render() {
    if (this.state.hasError) return null;
    return this.props.children;
  }
}

interface PokerSceneCanvasProps {
  quality?: "low" | "medium" | "high" | "cinematic";
  activeSeat?: number;
  winnerSeat?: number;
  className?: string;
}

export function PokerSceneCanvas({
  quality: qualityOverride,
  activeSeat,
  winnerSeat,
  className,
}: PokerSceneCanvasProps) {
  const [error, setError] = useState<string | false>(false);
  const quality = useMemo(() => qualityOverride || detectQuality(), [qualityOverride]);
  const dpr = quality === "cinematic" ? 2 : quality === "high" ? 1.5 : quality === "medium" ? 1.25 : 1;

  if (error) {
    return (
      <div className={className} style={{ display: "flex", alignItems: "center", justifyContent: "center", color: "#ff6e72", flexDirection: "column", gap: 8 }}>
        <p style={{ fontSize: 14, fontWeight: 600 }}>3D scene error</p>
        <p style={{ fontSize: 11, color: "#888", maxWidth: 300, textAlign: "center" }}>{error}</p>
      </div>
    );
  }

  return (
    <div className={className} style={{ width: "100%", height: "100%" }}>
      <SceneErrorBoundary onError={(err) => setError(err.message)}>
        <Canvas
          dpr={dpr}
          shadows={quality !== "low"}
          gl={{
            antialias: quality !== "low",
            alpha: false,
            powerPreference: "high-performance",
          }}
          onCreated={({ gl }) => {
            gl.toneMapping = THREE.ACESFilmicToneMapping;
            gl.toneMappingExposure = 1.1;
            gl.setClearColor(new THREE.Color("#070a10"), 1);
          }}
          onError={() => setError("WebGL context creation failed")}
        >
          <Suspense fallback={null}>
            <SceneRoot
              quality={quality}
              activeSeat={activeSeat}
              winnerSeat={winnerSeat}
            />
          </Suspense>
        </Canvas>
      </SceneErrorBoundary>
    </div>
  );
}
