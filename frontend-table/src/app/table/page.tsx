"use client";

import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

import { GameProvider } from "@/features/game/GameProvider";
import { JurisdictionGate } from "@/features/game/JurisdictionGate";
import { TableHud } from "@/features/hud/TableHud";
import { SoundProvider } from "@/features/hrc/lib/sound-context";
import { HandHistoryPanel } from "@/features/hud/HandHistoryPanel";
import { ChatStatsPanel } from "@/features/hud/ChatStatsPanel";

// framer-motion/three/drei all touch the DOM/WebGL — never import during SSR
// (Golden rule 3).
const HrcTable = dynamic(() => import("@/features/hrc/HrcTable"), { ssr: false });

function TableSurface() {
  const sp = useSearchParams();
  const demo = sp.get("demo") === "1";
  // 3D is deferred — force the 2.5D flat-image renderer regardless of what a
  // table's stored render_style says, until 3D work resumes.
  return (
    <SoundProvider>
      <HrcTable demo={demo} override="2.5d" />
      <HandHistoryPanel />
      <ChatStatsPanel />
    </SoundProvider>
  );
}

export default function TablePage() {
  return (
    <GameProvider>
      <JurisdictionGate />
      <TableHud>
        <Suspense fallback={null}>
          <TableSurface />
        </Suspense>
      </TableHud>
    </GameProvider>
  );
}
