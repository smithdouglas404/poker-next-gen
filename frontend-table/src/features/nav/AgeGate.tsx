"use client";

import { useEffect, useState } from "react";

// One-time age gate. Real-money gaming requires an age affirmation at entry;
// this stores a per-device confirmation and blocks until acknowledged. It is a
// front-door affordance, not the compliance control — KYC/AML at the money edges
// is the real check.
const KEY = "hrc.age.ok";

export function AgeGate() {
  const [ok, setOk] = useState(true); // assume ok during SSR to avoid a flash

  useEffect(() => {
    setOk(window.localStorage.getItem(KEY) === "1");
  }, []);

  if (ok) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 p-6 backdrop-blur-md">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#191d25] p-8 text-center">
        <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-gold/80">High Rollers Club</p>
        <h2 className="mt-2 text-2xl font-semibold text-white">Are you of legal age?</h2>
        <p className="mt-3 text-sm text-neutral-300">
          You must be at least 18 (or 21 where required in your jurisdiction) to enter. Real-money play is
          age-restricted and requires identity verification.
        </p>
        <div className="mt-6 flex gap-3">
          <button
            type="button"
            onClick={() => {
              window.localStorage.setItem(KEY, "1");
              setOk(true);
            }}
            className="flex-1 rounded-full bg-gradient-to-r from-[#9a7b2c] via-gold to-gold-lite px-6 py-2.5 text-sm font-bold uppercase tracking-wider text-black"
          >
            I am of legal age
          </button>
          <a
            href="https://www.begambleaware.org/"
            className="rounded-full border border-white/20 px-5 py-2.5 text-sm font-semibold uppercase tracking-wider text-neutral-300 hover:bg-white/5"
          >
            Leave
          </a>
        </div>
      </div>
    </div>
  );
}
