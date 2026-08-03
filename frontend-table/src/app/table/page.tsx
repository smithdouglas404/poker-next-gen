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
import { TableFeltBackdrop } from "@/features/hrc/components/TableFeltBackdrop";

// framer-motion/three/drei all touch the DOM/WebGL — never import during SSR
// (Golden rule 3).
const HrcTable = dynamic(() => import("@/features/hrc/HrcTable"), { ssr: false });

function TableSurface() {
  const sp = useSearchParams();
  const demo = sp.get("demo") === "1";
  return (
    <SoundProvider>
      {/* Always behind HrcTable — HrcTable itself renders nothing until a
          real snapshot exists (no fake game state), which otherwise leaves
          the pre-seat "This table is open" / "Sit Here" screen with no table
          graphic under it at all. */}
      <TableFeltBackdrop />
      <HrcTable demo={demo} />
      <HandHistoryPanel />
      <ChatStatsPanel />
    </SoundProvider>
  );
}

export default function TablePage() {
  return (
    <GameProvider>
      <JurisdictionGate />
      {/* TableHud itself reads useSearchParams, so it needs its own boundary. */}
      <Suspense fallback={null}>
        <TableHud>
          <TableSurface />
        </TableHud>
      </Suspense>
    </GameProvider>
  );
}
