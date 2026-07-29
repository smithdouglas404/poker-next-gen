"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { SignUp } from "@clerk/nextjs";

import { SignupConsentGate } from "@/features/auth/SignupConsentGate";

// A plan chosen on /join arrives here as ?plan=&interval= — carry it through
// Clerk's own post-signup redirect so /membership can auto-start checkout
// instead of dropping the visitor back into a bare tier grid.
function SignUpInner() {
  const params = useSearchParams();
  const plan = params.get("plan");
  const interval = params.get("interval");
  const redirect = plan
    ? `/membership?upgrade=${encodeURIComponent(plan)}${interval ? `&interval=${encodeURIComponent(interval)}` : ""}`
    : undefined;

  return (
    <SignupConsentGate>
      <SignUp forceRedirectUrl={redirect} />
    </SignupConsentGate>
  );
}

export default function SignUpPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-black p-6">
      <Suspense fallback={null}>
        <SignUpInner />
      </Suspense>
    </div>
  );
}
