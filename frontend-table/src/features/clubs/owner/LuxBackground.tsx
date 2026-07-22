"use client";

/**
 * Screen-local environmental depth for the Club-Owner Hub.
 *
 * Glassmorphism only reads as glass when there is something RICH behind it to
 * blur. The rest of the app sits on flat obsidian, so the owner hub paints its
 * own warm "server-vault / luxury-casino" depth here — pure CSS, fixed behind
 * all content — giving the frosted glass panels real substance to refract:
 *
 *  1. a warm dark base gradient (near-black browns, not cold black),
 *  2. a gold ambient glow pooled at the top + warm amber wash on the right,
 *  3. a deep felt-green pool low-left (the casino floor),
 *  4. a receding perspective corridor of faint "server racks" for depth,
 *  5. a heavy vignette to seat the panels, and
 *  6. a fine fractal-noise grain so the blur has micro-texture.
 *
 * It is `pointer-events-none` and sits at `-z-10` under the shell. Nothing about
 * the global theme is touched.
 */

// Fine film grain (kept tiny + faint) so backdrop-blur has something to chew on.
const NOISE =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.55'/%3E%3C/svg%3E\")";

export function LuxBackground() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      {/* 1–3 · warm base + gold ambient + felt-green pool */}
      <div
        className="absolute inset-0"
        style={{
          background: [
            "radial-gradient(120% 85% at 50% -12%, rgba(212,175,55,0.16), transparent 55%)",
            "radial-gradient(85% 65% at 88% 12%, rgba(184,124,38,0.12), transparent 60%)",
            "radial-gradient(90% 80% at 12% 96%, rgba(21,74,49,0.20), transparent 62%)",
            "linear-gradient(180deg, #100b06 0%, #0b0805 42%, #070503 100%)",
          ].join(","),
        }}
      />

      {/* 4 · receding server-rack corridor — perspective grid, masked to fade */}
      <div
        className="absolute inset-x-0 bottom-0 h-[70%] opacity-[0.5]"
        style={{
          background: [
            // vertical rack columns
            "repeating-linear-gradient(90deg, rgba(212,175,55,0.05) 0 2px, transparent 2px 74px)",
            // horizontal shelf lines
            "repeating-linear-gradient(0deg, rgba(255,214,140,0.035) 0 2px, transparent 2px 46px)",
          ].join(","),
          transform: "perspective(680px) rotateX(56deg) scale(1.9)",
          transformOrigin: "50% 100%",
          maskImage:
            "radial-gradient(120% 90% at 50% 100%, #000 8%, rgba(0,0,0,0.55) 46%, transparent 78%)",
          WebkitMaskImage:
            "radial-gradient(120% 90% at 50% 100%, #000 8%, rgba(0,0,0,0.55) 46%, transparent 78%)",
        }}
      />

      {/* subtle warm horizon glow where the corridor recedes */}
      <div
        className="absolute inset-x-0 top-[34%] h-56 opacity-70"
        style={{
          background:
            "radial-gradient(60% 100% at 50% 0%, rgba(212,175,55,0.10), transparent 70%)",
        }}
      />

      {/* 5 · vignette to seat the glass */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(135% 120% at 50% 42%, transparent 38%, rgba(0,0,0,0.5) 82%, rgba(0,0,0,0.72) 100%)",
        }}
      />

      {/* 6 · film grain */}
      <div
        className="absolute inset-0 opacity-[0.05] mix-blend-soft-light"
        style={{ backgroundImage: NOISE, backgroundSize: "140px 140px" }}
      />
    </div>
  );
}
