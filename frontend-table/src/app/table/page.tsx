"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";

import { GameProvider, useGame } from "@/features/game/GameProvider";
import { JurisdictionGate } from "@/features/game/JurisdictionGate";
import { TableHud } from "@/features/hud/TableHud";
import { useTableGraphics } from "@/features/table/tableGraphics";
import { cn, GLASS_PANEL } from "@/features/ui/tokens";
import { drawTableLayer } from "@/features/table/drawTableScene";
import { runDealAnimation } from "@/features/table/dealAnimation";
import { chipsToPot, potToWinner } from "@/features/table/chipAnimation";
import { muckLosers } from "@/features/table/muckAnimation";
import { getCanvasResolution } from "@/features/table/rendererQuality";
import { heroSeatIndex, syncGameToCanvas } from "@/features/table/syncGameToCanvas";
import { useDeckStyle } from "@/features/table/deckStyle";
import { MAX_SEATS, MIN_SEATS } from "@/features/game/protocol";
import type { TableLayout } from "@/features/table/tableLayout";

// R3F touches WebGL and must never be imported during SSR (Golden rule 3).
const LiveCinematicTable = dynamic(() => import("@/features/table3d/LiveCinematicTable"), {
  ssr: false,
});

type Backend = "webgpu" | "webgl" | "unknown";

function TableCanvas() {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const layoutRef = useRef<TableLayout | null>(null);
  const cardsLayerRef = useRef<import("pixi.js").Container | null>(null);
  const chipsLayerRef = useRef<import("pixi.js").Container | null>(null);
  const [backend, setBackend] = useState<Backend>("unknown");

  const { snapshot, holeCards, profile, dealTrigger, showdown } = useGame();
  const [deckStyle] = useDeckStyle();
  const dealAnimRef = useRef<ReturnType<typeof runDealAnimation> | null>(null);
  const lastActionsRef = useRef<Record<number, string>>({});
  const chipHandNoRef = useRef<number>(-1);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    let destroyed = false;
    let cleanup: (() => void) | null = null;

    (async () => {
      const PIXI = await import("pixi.js");
      const { Application, Container, RendererType } = PIXI;
      if (destroyed) return;

      const app = new Application();
      await app.init({
        preference: "webgpu",
        resizeTo: host,
        antialias: true,
        autoStart: true,
        backgroundColor: 0x0a1712,
        backgroundAlpha: 1,
        resolution: getCanvasResolution(),
        autoDensity: true,
      });

      if (destroyed) {
        app.destroy(true, { children: true });
        return;
      }

      host.appendChild(app.canvas);
      setBackend(app.renderer.type === RendererType.WEBGL ? "webgl" : "webgpu");

      app.stage.sortableChildren = true;
      const tableLayer = new Container();
      tableLayer.zIndex = 1;
      const chipsLayer = new Container();
      chipsLayer.zIndex = 5;
      chipsLayerRef.current = chipsLayer;
      const cardsLayer = new Container();
      cardsLayer.zIndex = 10;
      cardsLayerRef.current = cardsLayer;
      app.stage.addChild(tableLayer, chipsLayer, cardsLayer);

      const renderTable = () => {
        layoutRef.current = drawTableLayer(tableLayer, app.screen.width, app.screen.height);
      };
      renderTable();
      app.renderer.on("resize", renderTable);

      cleanup = () => {
        app.renderer.off("resize", renderTable);
        app.destroy(true, { children: true });
        if (app.canvas.parentNode) app.canvas.parentNode.removeChild(app.canvas);
      };
    })();

    return () => {
      destroyed = true;
      if (cleanup) cleanup();
    };
  }, []);

  useEffect(() => {
    const cardsLayer = cardsLayerRef.current;
    const layout = layoutRef.current;
    if (!cardsLayer || !layout || dealTrigger === 0) return;

    dealAnimRef.current?.cancel();
    dealAnimRef.current = runDealAnimation(cardsLayer, layout, snapshot?.variant === "plo" ? 4 : 2);
    void dealAnimRef.current.promise.then(() => {
      const seatIdx = snapshot ? heroSeatIndex(snapshot.seats, profile.userId) : -1;
      syncGameToCanvas(cardsLayer, layout, snapshot, holeCards, seatIdx);
    });
  }, [dealTrigger, snapshot, holeCards, profile.userId]);

  useEffect(() => {
    const cardsLayer = cardsLayerRef.current;
    const layout = layoutRef.current;
    if (!cardsLayer || !layout) return;

    const seatIdx = snapshot ? heroSeatIndex(snapshot.seats, profile.userId) : -1;
    syncGameToCanvas(cardsLayer, layout, snapshot, holeCards, seatIdx);
  }, [snapshot, holeCards, profile.userId, deckStyle]);

  // GPU chips: fly seat → pot on a bet/call/raise (diffed from last_action).
  useEffect(() => {
    const chipsLayer = chipsLayerRef.current;
    const layout = layoutRef.current;
    if (!chipsLayer || !layout || !snapshot) return;
    const seatCount = Math.min(MAX_SEATS, Math.max(MIN_SEATS, snapshot.max_seats ?? snapshot.seats.length));
    if (snapshot.hand_no !== chipHandNoRef.current) {
      chipHandNoRef.current = snapshot.hand_no;
      lastActionsRef.current = {};
    }
    for (const seat of snapshot.seats) {
      const action = (seat.last_action ?? "").toLowerCase();
      if (!action) continue;
      if (lastActionsRef.current[seat.index] === action) continue;
      lastActionsRef.current[seat.index] = action;
      if (action === "call" || action === "bet" || action === "raise" || action === "all-in" || action === "allin") {
        chipsToPot(chipsLayer, layout, seat.index, seatCount, action !== "call");
      }
    }
  }, [snapshot]);

  // GPU pot-sweep to the winner(s) + muck the losing hands at showdown.
  useEffect(() => {
    const chipsLayer = chipsLayerRef.current;
    const layout = layoutRef.current;
    if (!chipsLayer || !layout || !showdown?.winners?.length || !snapshot) return;
    const seatCount = Math.min(MAX_SEATS, Math.max(MIN_SEATS, snapshot.max_seats ?? snapshot.seats.length));
    for (const w of showdown.winners) {
      potToWinner(chipsLayer, layout, w.seat, seatCount);
    }
    // Muck: seats that reached showdown (not folded/empty) but did not win.
    const winnerSeats = new Set(showdown.winners.map((w) => w.seat));
    const losers = snapshot.seats
      .filter((s) => {
        const st = (s.status ?? "").toLowerCase();
        return st !== "folded" && st !== "empty" && st !== "" && !winnerSeats.has(s.index);
      })
      .map((s) => s.index);
    muckLosers(chipsLayer, layout, losers, seatCount);
  }, [showdown, snapshot]);

  return (
    <>
      <div ref={hostRef} className="absolute inset-0 z-0" aria-label="Poker table surface" />
      <div className="pointer-events-none absolute bottom-2 left-1/2 z-10 -translate-x-1/2 rounded-full bg-black/40 px-3 py-1 text-[10px] uppercase tracking-widest text-neutral-400">
        {snapshot?.variant === "plo" ? "Pot-Limit Omaha" : "Hold'em"} · {backend} · Multiplayer
      </div>
    </>
  );
}

function GraphicsToggle() {
  const [graphics, setGraphics] = useTableGraphics();
  const options: Array<{ id: "cinematic" | "classic"; label: string }> = [
    { id: "cinematic", label: "Cinematic" },
    { id: "classic", label: "Classic" },
  ];
  return (
    <div
      className={cn(
        GLASS_PANEL,
        // Sits BELOW the header bar (P0-6): at top-3 it collided with the ROOM
        // label and nav. The header is ~64px, so clear it.
        "pointer-events-auto absolute left-1/2 top-[5.25rem] z-30 flex -translate-x-1/2 overflow-hidden rounded-full p-0.5 text-[11px] font-bold",
      )}
    >
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          onClick={() => setGraphics(o.id)}
          className={cn(
            "rounded-full px-3 py-1 transition-colors",
            graphics === o.id ? "bg-gold text-black" : "text-neutral-300 hover:text-white",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function TableSurface() {
  const [graphics] = useTableGraphics();
  return (
    <>
      {graphics === "cinematic" ? <LiveCinematicTable /> : <TableCanvas />}
      <GraphicsToggle />
    </>
  );
}

export default function TablePage() {
  return (
    <GameProvider>
      <JurisdictionGate />
      <TableHud>
        <TableSurface />
      </TableHud>
    </GameProvider>
  );
}
