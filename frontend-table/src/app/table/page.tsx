"use client";

/**
 * Poker Next-Gen — Table Surface
 *
 * A responsive, React-wrapped <canvas> driven by Pixi.js v8. The renderer
 * prefers the WebGPU backend (falling back to WebGL) and paints a stylized,
 * deep-green vector elliptical poker table with a layered felt + wooden rail
 * boundary to simulate a pristine top-down 3D perspective.
 */

import { useEffect, useRef, useState } from "react";

type Backend = "webgpu" | "webgl" | "unknown";

export default function TablePage() {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [backend, setBackend] = useState<Backend>("unknown");

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    let destroyed = false;
    // Kept in closure so the async cleanup can tear the app down safely.
    let cleanup: (() => void) | null = null;

    (async () => {
      // Import lazily so Pixi (a browser-only, WebGPU-touching library) is
      // never evaluated during server-side rendering.
      const PIXI = await import("pixi.js");
      const { Application, Container, Graphics } = PIXI;

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
      setBackend((app.renderer.type === 1 ? "webgl" : "webgpu") as Backend);

      const stage = new Container();
      app.stage.addChild(stage);

      const draw = () => {
        stage.removeChildren();

        const w = app.renderer.width;
        const h = app.renderer.height;
        const cx = w / 2;
        const cy = h / 2;

        // Table footprint: an ellipse that fills the viewport with margin,
        // clamped to a pleasant poker-oval aspect ratio (roughly 16:9).
        const margin = Math.min(w, h) * 0.08;
        const maxRx = w / 2 - margin;
        const maxRy = h / 2 - margin;
        let rx = maxRx;
        let ry = rx * 0.56;
        if (ry > maxRy) {
          ry = maxRy;
          rx = ry / 0.56;
        }

        // Ambient drop shadow beneath the table for depth.
        const shadow = new Graphics();
        shadow
          .ellipse(cx, cy + ry * 0.08, rx * 1.04, ry * 1.06)
          .fill({ color: 0x000000, alpha: 0.45 });
        stage.addChild(shadow);

        // Outer wooden rail (the raised boundary encircling the felt).
        const railThickness = Math.max(14, Math.min(rx, ry) * 0.09);
        const railOuter = new Graphics();
        railOuter
          .ellipse(cx, cy, rx, ry)
          .fill({ color: 0x3a2415 })
          .ellipse(cx, cy, rx - railThickness * 0.45, ry - railThickness * 0.45)
          .fill({ color: 0x5a3a22 });
        stage.addChild(railOuter);

        // Felt boundary highlight — the thin bright lip between rail and felt.
        const lip = new Graphics();
        lip
          .ellipse(cx, cy, rx - railThickness, ry - railThickness)
          .stroke({ color: 0xc9a227, width: Math.max(2, railThickness * 0.14), alpha: 0.9 });
        stage.addChild(lip);

        // Deep-green playing felt.
        const feltRx = rx - railThickness * 1.15;
        const feltRy = ry - railThickness * 1.15;
        const felt = new Graphics();
        felt.ellipse(cx, cy, feltRx, feltRy).fill({ color: 0x0b6135 });
        stage.addChild(felt);

        // Concentric radial shading to fake a top-down 3D dome of light: a
        // stack of progressively smaller, lighter ellipses toward center.
        const rings = 6;
        for (let i = 1; i <= rings; i++) {
          const t = i / rings;
          const g = new Graphics();
          g.ellipse(cx, cy, feltRx * (1 - t * 0.85), feltRy * (1 - t * 0.85)).fill({
            color: blend(0x0b6135, 0x158a4c, t),
            alpha: 0.28,
          });
          stage.addChild(g);
        }

        // Inner betting line — the dashed boundary players bet across.
        const betLine = new Graphics();
        betLine
          .ellipse(cx, cy, feltRx * 0.72, feltRy * 0.72)
          .stroke({ color: 0xf3f4f6, width: Math.max(1.5, railThickness * 0.06), alpha: 0.35 });
        stage.addChild(betLine);

        // Dealer / center brand medallion.
        const center = new Graphics();
        center
          .ellipse(cx, cy, feltRx * 0.16, feltRy * 0.16)
          .fill({ color: 0x0a512c, alpha: 0.9 })
          .ellipse(cx, cy, feltRx * 0.16, feltRy * 0.16)
          .stroke({ color: 0xc9a227, width: 2, alpha: 0.7 });
        stage.addChild(center);

        // Nine evenly spaced player seat pips around the felt oval.
        const seats = 9;
        for (let i = 0; i < seats; i++) {
          const a = (i / seats) * Math.PI * 2 - Math.PI / 2;
          const px = cx + Math.cos(a) * feltRx * 0.9;
          const py = cy + Math.sin(a) * feltRy * 0.9;
          const seat = new Graphics();
          seat
            .circle(px, py, Math.max(6, railThickness * 0.4))
            .fill({ color: 0x11241b })
            .circle(px, py, Math.max(6, railThickness * 0.4))
            .stroke({ color: 0xc9a227, width: 2, alpha: 0.6 });
          stage.addChild(seat);
        }
      };

      draw();
      const onResize = () => draw();
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
      <div className="pointer-events-none absolute left-1/2 top-6 -translate-x-1/2 select-none text-center">
        <h1 className="text-lg font-semibold tracking-widest text-amber-300/90">
          POKER&nbsp;NEXT-GEN
        </h1>
        <p className="text-xs uppercase tracking-[0.35em] text-emerald-200/60">
          Texas Hold&apos;em · WebGPU Table
        </p>
      </div>
      <div className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 select-none rounded-full bg-black/40 px-3 py-1 text-[10px] uppercase tracking-widest text-neutral-300">
        Renderer: {backend}
      </div>
    </main>
  );
}

/** Linearly blend two 0xRRGGBB colors by t in [0,1]. */
function blend(a: number, b: number, t: number): number {
  const ar = (a >> 16) & 0xff;
  const ag = (a >> 8) & 0xff;
  const ab = a & 0xff;
  const br = (b >> 16) & 0xff;
  const bg = (b >> 8) & 0xff;
  const bb = b & 0xff;
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return (r << 16) | (g << 8) | bl;
}
