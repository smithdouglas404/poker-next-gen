"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

import { Button, Panel, SectionHeader } from "@/features/ui";

// Login entry (Clerk-only identity). Members sign in / join through Clerk
// (Google, etc.); the Nakama email/password form and auto-guest session were
// removed — all valid users validate against Clerk. The only guest path is a
// table access code, which routes to the code entry; a coded guest can play just
// that one table (the backend join-code gate is the real boundary).
export default function LoginPage() {
  const router = useRouter();
  const clerkReady = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);

  return (
    <div className="flex min-h-screen items-center justify-center px-4 text-white">
      <Panel className="w-full max-w-md p-8">
        <SectionHeader>High Rollers Club</SectionHeader>
        <h1 className="font-display mt-2 text-3xl font-bold">Sign In</h1>
        <p className="mt-2 text-sm text-neutral-400">
          Members sign in with a secure account. New here? Create one in the same flow.
        </p>

        <div className="mt-6 space-y-4">
          <Button
            size="lg"
            className="w-full"
            disabled={!clerkReady}
            onClick={() => router.push("/sign-in")}
          >
            Sign in / Join
          </Button>
          {!clerkReady && (
            <p className="text-xs text-red-300">Sign-in isn&apos;t configured on this deployment yet.</p>
          )}

          <div className="flex items-center gap-3 py-1">
            <span className="h-px flex-1 bg-white/10" />
            <span className="text-[10px] uppercase tracking-[0.25em] text-neutral-600">or</span>
            <span className="h-px flex-1 bg-white/10" />
          </div>

          {/* Guest = table-code only. Routes to the lobby's access-code entry
              (room_resolve → that one table). Everything else needs an account. */}
          <Link
            href="/lobby?guest=code"
            className="block w-full rounded-xl border border-white/15 py-3 text-center text-sm font-bold uppercase tracking-wide text-neutral-200 transition hover:border-white/30 hover:text-white"
          >
            Have a table code? Play as guest
          </Link>
        </div>

        <p className="mt-6 text-center">
          <Link href="/" className="text-xs text-neutral-500 hover:text-neutral-300">
            ← Back to home
          </Link>
        </p>
      </Panel>
    </div>
  );
}
