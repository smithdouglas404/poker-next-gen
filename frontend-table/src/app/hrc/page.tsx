"use client";

// Preview route for the HRC table: /hrc?demo=1
//
// Exists so the table can be reviewed without standing up a match. There is only
// one table renderer (see HrcTable), so there is nothing to switch between here.
//
// GameProvider is mounted because HrcTable calls useGame(); with ?demo=1 it reads
// DEMO_SNAPSHOT and never needs a connection.

import dynamic from "next/dynamic";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { GameProvider } from "@/features/game/GameProvider";

// framer-motion touches the DOM — never import during SSR.
const HrcTable = dynamic(() => import("@/features/hrc/HrcTable"), { ssr: false });

function Inner() {
  const sp = useSearchParams();
  const demo = sp.get("demo") === "1";
  return (
    <div className="h-screen w-screen overflow-hidden bg-[#05070c]">
      <HrcTable demo={demo} />
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
