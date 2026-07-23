"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { LegalDialog, type LegalDoc } from "@/features/landing/LegalDialog";

// Global compliance footer — license/jurisdiction, responsible-gambling, 18+,
// Terms/Privacy, support. Rendered platform-wide except on the immersive table
// and proof surfaces where chrome must stay out of the way.
const HIDE_ON = ["/table", "/proof", "/login"];

export function SiteFooter() {
  const pathname = usePathname() ?? "";
  const [legal, setLegal] = useState<LegalDoc>(null);
  if (HIDE_ON.some((p) => pathname === p || pathname.startsWith(p + "/"))) return null;

  return (
    <>
      <footer className="border-t border-white/[0.06] bg-black/40 px-4 py-6 text-center text-[11px] text-neutral-500">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-center gap-x-4 gap-y-2">
          <span className="rounded-full border border-white/15 px-2 py-0.5 font-semibold text-neutral-400">18+</span>
          <Link href="/kyc" className="hover:text-neutral-300">
            Responsible Gambling
          </Link>
          <Link href="/integrity" className="hover:text-neutral-300">
            Game Integrity
          </Link>
          <button type="button" onClick={() => setLegal("terms")} className="hover:text-neutral-300">
            Terms
          </button>
          <button type="button" onClick={() => setLegal("privacy")} className="hover:text-neutral-300">
            Privacy
          </button>
          <a href="mailto:support@highrollers.club" className="hover:text-neutral-300">
            Support
          </a>
          <Link href="/kyc" className="hover:text-neutral-300">
            Verification
          </Link>
        </div>
        <p className="mx-auto mt-3 max-w-3xl leading-relaxed text-neutral-600">
          High Rollers Club. Play responsibly. Real-money play requires identity verification and is restricted by
          jurisdiction. Must be of legal age (18+/21+ where applicable) in your region.
        </p>
      </footer>
      {legal && <LegalDialog doc={legal} onClose={() => setLegal(null)} />}
    </>
  );
}
