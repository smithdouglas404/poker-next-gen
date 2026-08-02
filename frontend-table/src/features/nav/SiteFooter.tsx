"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { LegalDialog, type LegalDoc } from "@/features/landing/LegalDialog";

const HIDE_ON = ["/table", "/proof", "/login"];

const FOOTER_LINKS = [
  { label: "Lobby",               href: "/lobby"         },
  { label: "Tournaments",         href: "/tournaments"   },
  { label: "Clubs",               href: "/clubs"         },
  { label: "Marketplace",         href: "/marketplace"   },
  { label: "Loyalty",             href: "/loyalty"       },
  { label: "Staking",             href: "/staking"       },
  { label: "Provably Fair",       href: "/provably-fair" },
  { label: "Game Integrity",      href: "/integrity"     },
  { label: "Responsible Gambling",href: "/kyc"           },
  { label: "Verification",        href: "/kyc"           },
];

export function SiteFooter() {
  const pathname = usePathname() ?? "";
  const [legal, setLegal] = useState<LegalDoc>(null);

  if (HIDE_ON.some((p) => pathname === p || pathname.startsWith(p + "/"))) return null;

  return (
    <>
      <footer className="border-t border-white/[0.06] bg-[#0a0d12]">
        {/* Gold accent line */}
        <div className="h-px w-full bg-gradient-to-r from-transparent via-[#f5c518]/25 to-transparent" />

        <div className="mx-auto max-w-7xl px-6 py-10">
          {/* Top row: brand + links */}
          <div className="flex flex-wrap items-start justify-between gap-8">
            {/* Brand */}
            <div className="space-y-3">
              <div className="flex items-center gap-2.5">
                <div className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-[#ffe066] via-[#f5c518] to-[#c9a000] shadow-[0_0_12px_rgba(245,197,24,0.30)]">
                  <span className="font-display text-sm font-black text-[#1a1200]">HR</span>
                </div>
                <div>
                  <p className="font-display text-sm font-bold uppercase tracking-[0.12em] text-white">High Rollers Club</p>
                  <p className="text-[10px] text-neutral-600">Premium Poker Network</p>
                </div>
              </div>
              <p className="max-w-xs text-xs leading-relaxed text-neutral-600">
                Real-money play requires identity verification and is restricted by jurisdiction.
              </p>
              <div className="flex items-center gap-2">
                <span className="rounded-full border border-white/15 px-2.5 py-0.5 text-[11px] font-bold text-neutral-400">18+</span>
                <span className="rounded-full border border-[#22c55e]/30 bg-[#22c55e]/[0.07] px-2.5 py-0.5 text-[11px] font-semibold text-[#22c55e]">
                  Provably Fair
                </span>
              </div>
            </div>

            {/* Links grid */}
            <div className="flex flex-wrap gap-x-8 gap-y-2">
              {FOOTER_LINKS.map((l) => (
                <Link
                  key={l.label}
                  href={l.href}
                  className="text-xs text-neutral-500 transition hover:text-neutral-200"
                >
                  {l.label}
                </Link>
              ))}
              <button
                type="button"
                onClick={() => setLegal("terms")}
                className="text-xs text-neutral-500 transition hover:text-neutral-200"
              >
                Terms
              </button>
              <button
                type="button"
                onClick={() => setLegal("privacy")}
                className="text-xs text-neutral-500 transition hover:text-neutral-200"
              >
                Privacy
              </button>
              <a
                href="mailto:support@highrollers.club"
                className="text-xs text-neutral-500 transition hover:text-neutral-200"
              >
                Support
              </a>
            </div>
          </div>

          {/* Bottom row */}
          <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.05] pt-6">
            <p className="text-[11px] text-neutral-700">
              © {new Date().getFullYear()} High Rollers Club. All rights reserved.
            </p>
            <p className="text-[11px] text-neutral-700">
              Play responsibly. Must be of legal age (18+/21+ where applicable) in your region.
            </p>
          </div>
        </div>
      </footer>
      {legal && <LegalDialog doc={legal} onClose={() => setLegal(null)} />}
    </>
  );
}
