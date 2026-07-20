"use client";

import { CommunityCards } from "@/features/hud/CommunityCards";
import { PlayerHeader } from "@/features/hud/PlayerHeader";
import { RoomPanel } from "@/features/hud/RoomPanel";
import { SeatHud } from "@/features/hud/SeatHud";
import { ActionBar } from "@/features/hud/ActionBar";
import { ActionTimer } from "@/features/hud/ActionTimer";
import { EquityPanel } from "@/features/hud/EquityPanel";
import { HandVerifyPanel } from "@/features/hud/HandVerifyPanel";
import { BuyInSlider, TableLog } from "@/features/hud/TableLog";
import { ChatPanel } from "@/features/hud/ChatPanel";
import { usePokerKeyboard } from "@/features/hud/usePokerKeyboard";
import { useGameSounds } from "@/features/sound/useGameSounds";
import { useGame } from "@/features/game/GameProvider";

export function TableHud({ children }: { children: React.ReactNode }) {
  const { error, snapshot } = useGame();
  usePokerKeyboard();
  useGameSounds();

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-neutral-950">
      {children}

      <div className="pointer-events-none absolute inset-0 z-20 flex flex-col p-4">
        <PlayerHeader />

        <div className="mt-4 flex flex-1 gap-4">
          <div className="flex w-full max-w-xs flex-col gap-3">
            <RoomPanel />
            <BuyInSlider />
            <EquityPanel />
            <HandVerifyPanel />
            <TableLog />
            <ChatPanel />
          </div>
          <div className="relative flex-1">
            <SeatHud />
            <ActionTimer />
            <CommunityCards board={snapshot?.board ?? []} phase={snapshot?.phase ?? "waiting"} />
          </div>
        </div>

        <div className="mt-auto flex flex-col items-end gap-2 pb-2 pr-2">
          <p className="pointer-events-none text-[10px] uppercase tracking-wider text-neutral-600">
            Keys: F fold · C check/call · R raise
          </p>
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
