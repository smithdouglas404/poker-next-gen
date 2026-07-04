"use client";

/**
 * Poker Next-Gen — Table Surface
 *
 * A responsive, React-wrapped <canvas> driven by Pixi.js v8. The renderer
 * prefers the WebGPU backend (falling back to WebGL) and paints a stylized,
 * deep-green vector elliptical poker table with a gold inner border, layout
 * boundaries, six symmetric player-seat placeholders, and a center dev banner.
 */

import { useEffect, useRef, useState } from "react";

import { drawTableScene } from "@/features/table/drawTableScene";

type Backend = "webgpu" | "webgl" | "unknown";

export default function TablePage() {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [backend, setBackend] = useState<Backend>("unknown");

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

      const stage = new Container();
      app.stage.addChild(stage);

      const render = () => {
        drawTableScene(stage, app.renderer.width, app.renderer.height);
      };

      render();
      const onResize = () => render();
      app.renderer.on("resize", onResize);

      cleanup = () => {
        app.renderer.off("resize", onResize);
        app.destroy(true, { children: true });
        if (app.canvas.parentNode) app.canvas.parentNode.removeChild(app.canvas);
      };
    })();

    return () => {
      destroyed = true;
      if (cleanup) cleanup();
    };
  }, []);

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-neutral-950">
      <div ref={hostRef} className="absolute inset-0" aria-label="Poker table surface" />
      <div className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 select-none rounded-full bg-black/40 px-3 py-1 text-[10px] uppercase tracking-widest text-neutral-300">
        Renderer: {backend}
      </div>
    </main>
  );
}
