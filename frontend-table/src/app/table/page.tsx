"use client";

/**
 * Poker Next-Gen — Table Surface
 *
 * A responsive, React-wrapped <canvas> driven by Pixi.js v8. The renderer
 * prefers the WebGPU backend (falling back to WebGL) and paints a stylized,
 * deep-green vector elliptical poker table with deal animations for hole cards.
 */

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { runDealAnimation } from "@/features/table/dealAnimation";
import { drawTableLayer } from "@/features/table/drawTableScene";
import { getCanvasResolution } from "@/features/table/rendererQuality";
import type { TableLayout } from "@/features/table/tableLayout";

type Backend = "webgpu" | "webgl" | "unknown";

interface TableRuntime {
  deal: () => Promise<void>;
}

export default function TablePage() {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const runtimeRef = useRef<TableRuntime | null>(null);
  const [backend, setBackend] = useState<Backend>("unknown");
  const [ready, setReady] = useState(false);
  const [isDealing, setIsDealing] = useState(false);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    let destroyed = false;
    let cleanup: (() => void) | null = null;
    let cancelDeal: (() => void) | null = null;
    let layout: TableLayout | null = null;

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
      app.ticker.start();
      setBackend(app.renderer.type === RendererType.WEBGL ? "webgl" : "webgpu");

      app.stage.sortableChildren = true;

      const tableLayer = new Container();
      tableLayer.zIndex = 1;

      const cardsLayer = new Container();
      cardsLayer.zIndex = 10;

      app.stage.addChild(tableLayer, cardsLayer);

      const renderTable = () => {
        layout = drawTableLayer(tableLayer, app.screen.width, app.screen.height);
      };

      renderTable();
      const onResize = () => {
        cancelDeal?.();
        cancelDeal = null;
        cardsLayer.removeChildren();
        setIsDealing(false);
        renderTable();
      };
      app.renderer.on("resize", onResize);

      const dealCards = async () => {
        if (!layout || cancelDeal) return;
        setIsDealing(true);
        const handle = runDealAnimation(cardsLayer, layout);
        cancelDeal = handle.cancel;
        try {
          await handle.promise;
        } finally {
          cancelDeal = null;
          setIsDealing(false);
        }
      };

      runtimeRef.current = { deal: dealCards };
      setReady(true);

      cleanup = () => {
        runtimeRef.current = null;
        cancelDeal?.();
        app.renderer.off("resize", onResize);
        app.destroy(true, { children: true });
        if (app.canvas.parentNode) app.canvas.parentNode.removeChild(app.canvas);
      };
    })();

    return () => {
      destroyed = true;
      setReady(false);
      runtimeRef.current = null;
      if (cleanup) cleanup();
    };
  }, []);

  const handleDeal = useCallback(async () => {
    if (!ready || isDealing) return;
    await runtimeRef.current?.deal();
  }, [isDealing, ready]);

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-neutral-950">
      <div ref={hostRef} className="absolute inset-0" aria-label="Poker table surface" />

      <div className="absolute bottom-6 left-1/2 z-10 flex w-[min(92vw,28rem)] -translate-x-1/2 flex-col items-center gap-3">
        <Link
          href="/"
          className="text-xs uppercase tracking-widest text-emerald-300/70 underline-offset-2 hover:text-emerald-200 hover:underline"
        >
          ← Command Center
        </Link>
        <button
          type="button"
          onClick={handleDeal}
          disabled={!ready || isDealing}
          className="w-full rounded-full border-2 border-amber-400/70 bg-emerald-800 px-8 py-4 text-base font-bold uppercase tracking-[0.18em] text-amber-100 shadow-lg shadow-black/40 transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isDealing ? "Dealing Cards…" : "Deal Cards"}
        </button>
        <p className="pointer-events-none select-none text-center text-xs leading-relaxed text-emerald-100/70">
          {ready ? "Click Deal Cards to slide two hole cards to every seat." : "Loading table…"}
        </p>
        <div className="pointer-events-none select-none rounded-full bg-black/40 px-3 py-1 text-[10px] uppercase tracking-widest text-neutral-300">
          Renderer: {backend} · Table v2
        </div>
      </div>
    </main>
  );
}
