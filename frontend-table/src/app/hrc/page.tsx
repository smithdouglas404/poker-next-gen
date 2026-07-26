"use client";

// Preview route for the ported HRC table: /hrc?style=3d&demo=1
//
// Exists so both renderers can be reviewed side by side without standing up a match.
// The real table picks its renderer from snapshot.render_style (chosen by the owner at
// table setup); `style` here is only a preview override.
//
// GameProvider is mounted because HrcTable calls useGame(); with ?demo=1 it reads
// DEMO_SNAPSHOT and never needs a connection.

import dynamic from "next/dynamic";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { GameProvider } from "@/features/game/GameProvider";
import type { HrcRenderStyle } from "@/features/hrc/HrcTable";

// three/drei/framer-motion all touch the DOM or WebGL — never import during SSR.
const HrcTable = dynamic(() => import("@/features/hrc/HrcTable"), { ssr: false });

function Inner() {
  const sp = useSearchParams();
  const demo = sp.get("demo") === "1";
  const style = (sp.get("style") as HrcRenderStyle | null) ?? undefined;
  return (
    <div className="h-screen w-screen overflow-hidden bg-[#05070c]">
      <HrcTable demo={demo} override={style} />
    </div>
  );
}

export default function HrcPage() {
  return (
    <Suspense fallback={<div className="h-screen w-screen bg-[#05070c]" />}>
      <GameProvider>
        <Inner />
      </GameProvider>
    </Suspense>
  );
}
