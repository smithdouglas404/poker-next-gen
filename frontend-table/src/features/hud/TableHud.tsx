"use client";

import { CommunityCards } from "@/features/hud/CommunityCards";
import { PlayerHeader } from "@/features/hud/PlayerHeader";
import { RoomPanel } from "@/features/hud/RoomPanel";
import { SeatHud } from "@/features/hud/SeatHud";
import { ActionBar } from "@/features/hud/ActionBar";
import { PreActionBar } from "@/features/hud/PreActionBar";
import { ActionTimer } from "@/features/hud/ActionTimer";
import { EquityPanel } from "@/features/hud/EquityPanel";
import { HandVerifyPanel } from "@/features/hud/HandVerifyPanel";
import { BuyInSlider, TableLog } from "@/features/hud/TableLog";
import { ChatPanel } from "@/features/hud/ChatPanel";
import { HandHistoryPanel } from "@/features/hud/HandHistoryPanel";
import { HostPanel } from "@/features/hud/HostPanel";
import { MusicPicker } from "@/features/sound/MusicPicker";
import { TableSettings } from "@/features/hud/TableSettings";
import { TauntBar } from "@/features/sound/TauntBar";
import { usePokerKeyboard } from "@/features/hud/usePokerKeyboard";
import { useGameSounds } from "@/features/sound/useGameSounds";
import { useGame } from "@/features/game/GameProvider";
import { useTableGraphics } from "@/features/table/tableGraphics";

export function TableHud({ children }: { children: React.ReactNode }) {
  const { error, snapshot, connected, matchId } = useGame();
  const [graphics] = useTableGraphics();
  usePokerKeyboard();
  useGameSounds();

  // In cinematic mode the R3F scene owns the seats, community board, and pot,
  // so the legacy DOM chrome for those (SeatHud seat cards, CommunityCards
  // placeholders, the center pot label) must not double up over the felt.
  // We keep only the interactive glass controls the 3D layer does NOT provide,
  // parked as restrained overlays around the edges.
  const cinematic = graphics === "cinematic";

  // Panels that render empty-state chrome ("Waiting for table events…", buy-in
  // slider, hand-audit placeholder) only earn their space once there is a live
  // table. In cinematic idle/demo they would just clutter the felt edge, so we
  // gate them on an active game. Classic mode is unchanged.
  const hasGame = connected || !!matchId || !!snapshot;
  const showGamePanels = !cinematic || hasGame;

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-background">
      {children}

      <div className="pointer-events-none absolute inset-0 z-20 flex flex-col p-4">
        <PlayerHeader />

        <div className="mt-4 flex flex-1 gap-4">
          <div className="flex w-full max-w-xs flex-col gap-3">
            <RoomPanel />
            <HostPanel />
            {showGamePanels && <BuyInSlider />}
            <EquityPanel />
            {showGamePanels && <HandVerifyPanel />}
            {showGamePanels && <TableLog />}
            <ChatPanel />
            <HandHistoryPanel />
            <TauntBar />
            {/* Music + display settings are tall always-expanded panels; in a
                cinematic idle/demo they occlude the left seats, so hold them
                until a live table is up. Mute stays reachable via the header. */}
            {showGamePanels && <MusicPicker />}
            {showGamePanels && <TableSettings />}
          </div>
          <div className="relative flex-1">
            {/* Seats + board are drawn by the 3D scene in cinematic mode; SeatHud
                still renders (avatar-preset toggle only) so 2.5D/3D/Mix stays
                switchable. */}
            <SeatHud />
            <ActionTimer />
            {!cinematic && (
              <CommunityCards board={snapshot?.board ?? []} phase={snapshot?.phase ?? "waiting"} />
            )}
          </div>
        </div>

        <div className="mt-auto flex flex-col items-end gap-2 pb-2 pr-2">
          <p className="pointer-events-none text-[10px] uppercase tracking-wider text-neutral-600">
            Keys: F fold · C check/call · R raise
          </p>
          <PreActionBar />
          <ActionBar />
        </div>

        {/* The offline "Failed to fetch" toast is noise on the demo/cinematic
            showcase (no server by design); keep it only for the classic path. */}
        {!cinematic && error && (
          <div className="pointer-events-auto absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full border border-brand/40 bg-brand/15 px-4 py-2 text-xs text-[#ff9ba1]">
            {error}
          </div>
        )}
      </div>
    </div>
  );
}
