"use client";
import { useEffect, useState } from "react";

const KEY = "hrc.age.ok";

export function AgeGate() {
  const [ok, setOk] = useState(true);

  useEffect(() => {
    setOk(window.localStorage.getItem(KEY) === "1");
  }, []);

  if (ok) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 p-6 backdrop-blur-xl">
      {/* Ambient glow */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <div className="h-[600px] w-[600px] rounded-full bg-[#f5c518]/[0.04] blur-[120px]" />
      </div>

      <div className="relative w-full max-w-md animate-scale-in">
        {/* Gold top accent */}
        <div className="h-px w-full rounded-t-2xl bg-gradient-to-r from-transparent via-[#f5c518]/60 to-transparent" />

        <div className="rounded-2xl border border-white/[0.10] bg-[#1a2030] p-8 text-center shadow-[0_32px_80px_rgba(0,0,0,0.8)] panel-inner-glow">
          {/* Logo */}
          <div className="mx-auto mb-5 grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-[#ffe066] via-[#f5c518] to-[#c9a000] shadow-[0_0_32px_rgba(245,197,24,0.45)]">
            <span className="font-display text-xl font-black text-[#1a1200]">HR</span>
          </div>

          <p className="text-[11px] font-bold uppercase tracking-[0.35em] text-[#f5c518]/70">
            High Rollers Club
          </p>
          <h2 className="mt-2 font-display text-2xl font-bold uppercase tracking-wide text-white">
            Are you of legal age?
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-neutral-400">
            You must be at least 18 (or 21 where required in your jurisdiction) to enter.
            Real-money play is age-restricted and requires identity verification.
          </p>

          <div className="mt-6 flex gap-3">
            <button
              type="button"
              onClick={() => {
                window.localStorage.setItem(KEY, "1");
                setOk(true);
              }}
              className="flex-1 rounded-xl bg-gradient-to-b from-[#ffe066] via-[#f5c518] to-[#c9a000] px-6 py-3 text-sm font-bold uppercase tracking-wider text-[#1a1200] shadow-[0_4px_20px_rgba(245,197,24,0.40)] transition hover:shadow-[0_6px_28px_rgba(245,197,24,0.55)] hover:-translate-y-px"
            >
              I am of legal age
            </button>
            <a
              href="https://www.begambleaware.org/"
              className="rounded-xl border border-white/20 bg-white/[0.04] px-5 py-3 text-sm font-semibold uppercase tracking-wider text-neutral-300 transition hover:border-white/30 hover:bg-white/[0.08]"
            >
              Leave
            </a>
          </div>

          <div className="mt-5 flex items-center justify-center gap-3">
            <span className="text-[10px] text-neutral-700">Powered by</span>
            <span className="text-[10px] font-semibold text-neutral-600">Provably Fair Engine</span>
            <span className="h-1 w-1 rounded-full bg-neutral-700" />
            <span className="text-[10px] text-neutral-700">GTO Verified</span>
          </div>
        </div>
      </div>
    </div>
  );
}
