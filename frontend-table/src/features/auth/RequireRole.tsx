"use client";

// RequireRole gates a page on a platform/club ROLE, on top of the Clerk-session
// requirement already enforced by middleware.ts. The Clerk middleware guarantees
// the visitor is a signed-in member before this renders; this adds the role check
// (platform_admin, or club owner/configurer) and shows a clean "Not authorized"
// screen instead of leaking admin/owner chrome. The backend still enforces every
// action (adminCaller / requireClubConfigurer → 403), so this is defense-in-depth
// for the UI, not the security boundary.

import Link from "next/link";
import { useEffect, useState } from "react";

import { callSessionRpc } from "@/lib/nakama/sessionRpc";
import { GLASS_PANEL, cn } from "@/features/ui/tokens";

type Gate = "checking" | "denied" | "granted";

interface MeRoles {
  platform_admin: boolean;
  club_admin_of?: string[];
}

export function RequireRole({
  require: req,
  children,
}: {
  require: "platform_admin" | "club_admin";
  children: React.ReactNode;
}) {
  const [gate, setGate] = useState<Gate>("checking");

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const roles = (await callSessionRpc("me_roles", {})) as MeRoles;
        if (!alive) return;
        const ok =
          req === "platform_admin"
            ? Boolean(roles.platform_admin)
            : Boolean(roles.platform_admin) || (roles.club_admin_of?.length ?? 0) > 0;
        setGate(ok ? "granted" : "denied");
      } catch {
        if (alive) setGate("denied");
      }
    })();
    return () => {
      alive = false;
    };
  }, [req]);

  if (gate === "granted") return <>{children}</>;

  return (
    <div className="flex min-h-screen items-center justify-center px-4 text-white">
      <div className={cn(GLASS_PANEL, "w-full max-w-md p-8 text-center")}>
        {gate === "checking" ? (
          <p className="text-sm text-white/60">Checking access…</p>
        ) : (
          <>
            <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-brand/80">
              Restricted
            </p>
            <h1 className="mt-2 font-display text-2xl font-bold uppercase tracking-wide">
              Not authorized
            </h1>
            <p className="mt-2 text-sm text-white/55">
              {req === "platform_admin"
                ? "This area is for platform administrators."
                : "This area is for club owners and operators."}
            </p>
            <Link
              href="/dashboard"
              className="mt-6 inline-block rounded-xl border border-white/15 px-5 py-2.5 text-sm font-semibold hover:border-white/30"
            >
              ← Back to Command Center
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
