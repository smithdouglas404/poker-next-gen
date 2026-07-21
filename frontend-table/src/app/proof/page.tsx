"use client";

import dynamic from "next/dynamic";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";

const CinematicTable = dynamic(() => import("./CinematicTable"), { ssr: false });
const ClubDashboard = dynamic(() => import("./ClubDashboard"), { ssr: false });

function ProofInner() {
  const sp = useSearchParams();
  const screen = sp.get("screen") ?? "table";
  const mode = (sp.get("mode") as "2d" | "3d" | "mix") ?? "2d";
  if (screen === "club") return <ClubDashboard />;
  return <CinematicTable mode={mode} />;
}

export default function ProofPage() {
  return (
    <Suspense fallback={<div style={{ background: "#04060a", width: "100vw", height: "100vh" }} />}>
      <ProofInner />
    </Suspense>
  );
}
