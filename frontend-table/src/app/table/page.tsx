"use client";

import { useEffect, useRef, useState } from "react";

import { GameProvider, useGame } from "@/features/game/GameProvider";
import { TableHud } from "@/features/hud/TableHud";
import { drawTableLayer } from "@/features/table/drawTableScene";
import { runDealAnimation } from "@/features/table/dealAnimation";
import { getCanvasResolution } from "@/features/table/rendererQuality";
import { heroSeatIndex, syncGameToCanvas } from "@/features/table/syncGameToCanvas";
import type { TableLayout } from "@/features/table/tableLayout";

type Backend = "webgpu" | "webgl" | "unknown";

function TableCanvas() {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const layoutRef = useRef<TableLayout | null>(null);
  const cardsLayerRef = useRef<import("pixi.js").Container | null>(null);
  const [backend, setBackend] = useState<Backend>("unknown");

  const { snapshot, holeCards, profile, dealTrigger } = useGame();
  const dealAnimRef = useRef<ReturnType<typeof runDealAnimation> | null>(null);

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
      const cardsLayer = new Container();
      cardsLayer.zIndex = 10;
      cardsLayerRef.current = cardsLayer;
      app.stage.addChild(tableLayer, cardsLayer);

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
    dealAnimRef.current = runDealAnimation(cardsLayer, layout);
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
  }, [snapshot, holeCards, profile.userId]);

  return (
    <>
      <div ref={hostRef} className="absolute inset-0 z-0" aria-label="Poker table surface" />
      <div className="pointer-events-none absolute bottom-2 left-1/2 z-10 -translate-x-1/2 rounded-full bg-black/40 px-3 py-1 text-[10px] uppercase tracking-widest text-neutral-400">
        Renderer: {backend} · Multiplayer
      </div>
    </>
  );
}

export default function TablePage() {
  return (
    <GameProvider>
      <TableHud>
        <TableCanvas />
      </TableHud>
    </GameProvider>
  );
}
