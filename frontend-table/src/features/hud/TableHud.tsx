"use client";

import { PlayerHeader } from "@/features/hud/PlayerHeader";
import { RoomPanel } from "@/features/hud/RoomPanel";
import { SeatHud } from "@/features/hud/SeatHud";
import { ActionBar } from "@/features/hud/ActionBar";
import { PreActionBar } from "@/features/hud/PreActionBar";
import { ActionTimer } from "@/features/hud/ActionTimer";
import { HeroControlsDock } from "@/features/hud/HeroControlsDock";
import { EquityPanel } from "@/features/hud/EquityPanel";
import { SidebetPanel } from "@/features/hud/SidebetPanel";
import { HandVerifyPanel } from "@/features/hud/HandVerifyPanel";
import { ShowdownVerifyCTA } from "@/features/game/ShowdownVerifyCTA";
import { SpectatorBar } from "@/features/game/SpectatorBar";
import { TotalInPlay } from "@/features/hud/TotalInPlay";
import { BuyInSlider, TableLog } from "@/features/hud/TableLog";
import { TableEmptyState } from "@/features/hud/TableEmptyState";
import { ChatPanel } from "@/features/hud/ChatPanel";
import { ChipAnimation } from "@/features/hrc/components/ChipAnimation";
import { MusicPicker } from "@/features/sound/MusicPicker";
import { TableSettings } from "@/features/hud/TableSettings";
import { TauntBar } from "@/features/sound/TauntBar";
import { usePokerKeyboard } from "@/features/hud/usePokerKeyboard";
import { useGameSounds } from "@/features/sound/useGameSounds";
import { useGame } from "@/features/game/GameProvider";
import { SHOW_LEFT_PANEL_COLUMN } from "@/features/hud/roomPanelState";

export function TableHud({ children }: { children: React.ReactNode }) {
  const { error } = useGame();
  usePokerKeyboard();
  useGameSounds();

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-background">
      {children}

      {/* Bet-to-pot chip flights — Seat.tsx's triggerChipFlight() computes
          viewport-relative coordinates via getBoundingClientRect(), so this
          must live directly in this full-viewport `relative` root, not
          nested deeper where a positioned ancestor would offset it. */}
      <ChipAnimation />

      <div className="pointer-events-none absolute inset-0 z-20 flex flex-col p-4">
        <PlayerHeader />

        <div className="mt-4 flex flex-1 gap-4">
          {/* The felt is not a shelf for panels. This column used to render on
              every real table — RoomPanel's Create/Join builder, buy-in,
              equity, sidebets, verify, log, chat, spectator, taunts, music and
              table settings, thirteen stacked panels over the left of the
              table. It was hidden under `!demo`, which is exactly why every
              ?demo=1 screenshot looked clean while /table never did, and why
              "the table" meant two different things for days.
              The reference (AFTER1600x1000.png) has none of it: HAND HISTORY
              top-left and chat bottom-left, both mounted separately in
              app/table/page.tsx. Room Control stays reachable through its own
              collapsed ROOM tab; nothing here is deleted, it just stops
              covering the felt. */}
          {SHOW_LEFT_PANEL_COLUMN && (
          <div className="flex w-full max-w-xs flex-col gap-3">
            <RoomPanel />
            <BuyInSlider />
            <EquityPanel />
            <SidebetPanel />
            <HandVerifyPanel />
            <ShowdownVerifyCTA />
            <TableLog />
            <ChatPanel />
          <SpectatorBar />
          <TotalInPlay />
            <TauntBar />
            <MusicPicker />
            <TableSettings />
          </div>
          )}
          <div className="relative flex-1">
            {/* SeatHud draws the seat plaques and the empty "SIT HERE" cards.
                The 2D/3D/Mix AVATAR switcher lives in TableSettings, not here. */}
            <SeatHud />
            {/* Path to the money action while the hero isn't seated (self-hides
                once seated) — P0-7. */}
            <TableEmptyState />
            <ActionTimer />
            {/* DELIBERATELY NOT MOUNTED: hud/GameStatusRail.tsx (current bet +
                hand strength pills). Decided by the owner on 2026-08-03 — do
                not mount it, and do not treat its absence as an oversight to
                "fix".

                It was originally gated on `cinematic`, a table-graphics mode
                nothing ever set, so it had never rendered once. When that mode
                was deleted the question became live, and the answer is no: its
                hand-strength pill duplicates the one HeroHoleCards already
                shows above the hero's cards, and its current-bet figure is
                already on screen as ActionBar's "TO CALL". Two surfaces naming
                the same thing is how they drift apart.

                The file stays so the work isn't lost, and it shares
                useHandCategory with HeroHoleCards so the two could not
                disagree if it ever were mounted. */}
            {/* The board is drawn by ImageTable. This used to ALSO mount
                hud/CommunityCards under `!cinematic`, from when the 2.5D path
                didn't draw its own board — so both rendered: the real cards at
                45% of the felt plus a second row of dashed FLOP/TURN/RIVER
                slots at 42% of the viewport bleeding through behind them. */}
          </div>
        </div>

        {/* Centred on EVERY table. This used to read
            `demo ? "items-center" : "items-end pr-2"`, so the action dock sat
            centre-bottom in the preview and hard against the right edge on the
            real table — one more way ?demo=1 and /table disagreed about what
            "the table" looks like. The reference has it centred. */}
        <div className="mt-auto flex flex-col items-center gap-2 pb-2">
          <p className="pointer-events-none text-[10px] uppercase tracking-wider text-neutral-600">
            Keys: F fold · C check/call · R raise
          </p>
          <PreActionBar />
          <ActionBar />
          {/* Below the action panel, not above it — above collided with the
              hero's own floating bet-chip indicator and the keyboard-hint
              caption, both of which sit in the felt-adjacent band right over
              PreActionBar. Below the solid ActionBar panel is clear of both. */}
          <HeroControlsDock />
        </div>

        {error && (
          <div className="pointer-events-auto absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full border border-brand/40 bg-brand/15 px-4 py-2 text-xs text-[#ff9ba1]">
            {error}
          </div>
        )}
      </div>
    </div>
  );
}
