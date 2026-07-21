"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { useAnimations, useGLTF } from "@react-three/drei";
import type * as THREE from "three";

import { Character3D } from "./Character3D";

/** Default "house" rigged model — replaced per-player by an equipped Tripo GLB. */
export const HOUSE_MODEL = "/models/house.glb";

function Model({
  url,
  active,
  winner,
  folded,
}: {
  url: string;
  active?: boolean;
  winner?: boolean;
  folded?: boolean;
}) {
  const group = useRef<THREE.Group>(null);
  const { scene, animations } = useGLTF(url);
  const { actions, names } = useAnimations(animations, group);

  // Play the first available clip as an idle loop.
  useEffect(() => {
    const first = names[0];
    if (first && actions[first]) {
      actions[first]!.reset().fadeIn(0.3).play();
    }
    return () => {
      if (first && actions[first]) actions[first]!.fadeOut(0.2);
    };
  }, [actions, names]);

  // Reaction state via transform (works regardless of the model's clip set).
  const lift = winner ? 0.18 : active ? 0.1 : 0;
  const scale = winner ? 1.12 : 1;

  return (
    <group
      ref={group}
      position={[0, -0.9 + lift, 0]}
      scale={[scale, scale, scale]}
      rotation={[0, folded ? 0.5 : 0, 0]}
    >
      <primitive object={scene} />
    </group>
  );
}

/**
 * A single seat's character rendered as a real rigged 3D GLB in its own small
 * WebGL canvas, positioned by SeatHud exactly like the 2.5D portrait — so it
 * aligns with the felt with no global-camera math. Falls back to the 2.5D
 * `Character3D` during SSR / first paint and if WebGL/the model fails.
 */
export function Character3DGL({
  identity,
  name,
  hero,
  active,
  winner,
  folded,
  modelUrl,
  size = 96,
}: {
  identity: string;
  name?: string;
  hero: boolean;
  active?: boolean;
  winner?: boolean;
  folded?: boolean;
  modelUrl?: string;
  size?: number;
}) {
  const [mounted, setMounted] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => setMounted(true), []);

  // Portrait fallback (SSR, pre-mount, or on error).
  if (!mounted || failed) {
    return (
      <Character3D
        identity={identity}
        name={name}
        hero={hero}
        active={active}
        winner={winner}
        folded={folded}
      />
    );
  }

  const url = modelUrl || HOUSE_MODEL;

  return (
    <div style={{ width: size, height: size, opacity: folded ? 0.55 : 1 }}>
      <Canvas
        camera={{ position: [0, 0.2, 3.2], fov: 35 }}
        dpr={[1, 2]}
        gl={{ alpha: true, antialias: true }}
        onError={() => setFailed(true)}
        style={{ background: "transparent" }}
      >
        <ambientLight intensity={0.9} />
        <directionalLight position={[2, 4, 3]} intensity={1.4} />
        <directionalLight position={[-3, 2, -2]} intensity={0.5} color={hero ? "#fbbf24" : "#81ecff"} />
        <Suspense fallback={null}>
          <Model url={url} active={active} winner={winner} folded={folded} />
        </Suspense>
      </Canvas>
    </div>
  );
}

useGLTF.preload(HOUSE_MODEL);
