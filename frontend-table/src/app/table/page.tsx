"use client";

/**
 * Poker Next-Gen — Table Surface
 *
 * A responsive, React-wrapped <canvas> driven by Pixi.js v8. The renderer
 * prefers the WebGPU backend (falling back to WebGL) and paints a stylized,
 * deep-green vector elliptical poker table with deal animations for hole cards.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import { runDealAnimation } from "@/features/table/dealAnimation";
import { drawTableLayer } from "@/features/table/drawTableScene";
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
        backgroundColor: 0x0a1712,
        backgroundAlpha: 1,
        resolution: window.devicePixelRatio || 1,
        autoDensity: true,
      });

      if (destroyed) {
        app.destroy(true, { children: true });
        return;
      }

      host.appendChild(app.canvas);
      setBackend(app.renderer.type === RendererType.WEBGL ? "webgl" : "webgpu");

      const tableLayer = new Container();
      const cardsLayer = new Container();
      app.stage.addChild(tableLayer, cardsLayer);

      const renderTable = () => {
        layout = drawTableLayer(tableLayer, app.renderer.width, app.renderer.height);
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

      runtimeRef.current = {
        deal: async () => {
          if (!layout || cancelDeal) return;
          setIsDealing(true);
          const handle = runDealAnimation(app, cardsLayer, layout);
          cancelDeal = handle.cancel;
          try {
            await handle.promise;
          } finally {
            cancelDeal = null;
            setIsDealing(false);
          }
        },
      };
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

      <div className="absolute bottom-6 left-1/2 z-10 flex -translate-x-1/2 flex-col items-center gap-3">
        <button
          type="button"
          onClick={handleDeal}
          disabled={!ready || isDealing}
          className="rounded-full border border-amber-400/60 bg-emerald-900/90 px-8 py-2.5 text-sm font-semibold uppercase tracking-[0.2em] text-amber-200 shadow-lg shadow-black/40 transition hover:border-amber-300 hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isDealing ? "Dealing…" : "Deal"}
        </button>
        <div className="pointer-events-none select-none rounded-full bg-black/40 px-3 py-1 text-[10px] uppercase tracking-widest text-neutral-300">
          Renderer: {backend}
        </div>
      </div>
    </main>
  );
}
