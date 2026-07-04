"use client";

import { CommunityCards } from "@/features/hud/CommunityCards";
import { PlayerHeader } from "@/features/hud/PlayerHeader";
import { RoomPanel } from "@/features/hud/RoomPanel";
import { SeatHud } from "@/features/hud/SeatHud";
import { ActionBar } from "@/features/hud/ActionBar";
import { useGame } from "@/features/game/GameProvider";

export function TableHud({ children }: { children: React.ReactNode }) {
  const { error, snapshot } = useGame();

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-neutral-950">
      {children}

      {/* HUD layers */}
      <div className="pointer-events-none absolute inset-0 z-20 flex flex-col p-4">
        <PlayerHeader />

        <div className="mt-4 flex flex-1 gap-4">
          <RoomPanel />
          <div className="relative flex-1">
            <SeatHud />
            <CommunityCards board={snapshot?.board ?? []} phase={snapshot?.phase ?? "waiting"} />
          </div>
        </div>

        <div className="mt-auto flex justify-end pb-2 pr-2">
          <ActionBar />
        </div>

        {error && (
          <div className="pointer-events-auto absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full border border-red-500/40 bg-red-950/60 px-4 py-2 text-xs text-red-200">
            {error}
          </div>
        )}
      </div>
    </div>
  );
}
