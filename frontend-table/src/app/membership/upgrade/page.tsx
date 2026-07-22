"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

// PremiumUpgrade — a thin alias that lands players on the canonical Tiers screen.
// No backend of its own; the upgrade CTAs on /membership drive subscription_checkout.
export default function PremiumUpgradeRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/membership");
  }, [router]);

  return (
    <div className="flex min-h-screen items-center justify-center text-sm text-neutral-500">
      Redirecting to membership…
    </div>
  );
}
