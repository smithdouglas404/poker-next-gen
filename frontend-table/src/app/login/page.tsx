"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { authenticate } from "@/lib/nakama/auth";
import { Button, Field, Input, Panel, SectionHeader } from "@/features/ui";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "signup">("login");

  // Open directly in sign-up when linked as /login?mode=signup ("Join" button).
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (new URLSearchParams(window.location.search).get("mode") === "signup") {
      setMode("signup");
    }
  }, []);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await authenticate("email", { email, password, username }, mode === "signup");
      router.push("/hub"); // land members on their home, not the marketing page
    } catch (e) {
      setError(e instanceof Error ? e.message : "Authentication failed");
    } finally {
      setBusy(false);
    }
  };

  // Play now without an account — device (guest) auth. Guests can play and enter
  // access codes; club creation / paid features still require a verified account.
  const continueAsGuest = async () => {
    setBusy(true);
    setError(null);
    try {
      await authenticate("device", {}, true);
      router.push("/hub");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start a guest session");
    } finally {
      setBusy(false);
    }
  };

  const googleLogin = async () => {
    setError("Configure NEXT_PUBLIC_GOOGLE_CLIENT_ID and Google Sign-In SDK for OAuth in production.");
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-4 text-white">
      <Panel className="w-full max-w-md p-8">
        <SectionHeader>High Rollers Club</SectionHeader>
        <h1 className="font-display mt-2 text-3xl font-bold">
          {mode === "login" ? "Sign In" : "Create Account"}
        </h1>
        <p className="mt-2 text-sm text-neutral-400">
          {mode === "login"
            ? "Welcome back to the table."
            : "Join the club — real email authentication."}
        </p>

        {error && (
          <div className="mt-4 rounded-xl border border-red-500/30 bg-red-950/20 p-3 text-sm text-red-200">
            {error}
          </div>
        )}

        <div className="mt-6 space-y-4">
          {mode === "signup" && (
            <Field label="Username">
              <Input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Your handle" />
            </Field>
          )}
          <Field label="Email">
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
          </Field>
          <Field label="Password">
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
          </Field>
          <Button size="lg" disabled={busy} onClick={() => void submit()} className="w-full">
            {busy ? "Please wait…" : mode === "login" ? "Sign In" : "Create Account"}
          </Button>
          <Button variant="outline" size="lg" disabled={busy} onClick={() => void googleLogin()} className="w-full">
            Continue with Google
          </Button>
          <div className="flex items-center gap-3 py-1">
            <span className="h-px flex-1 bg-white/10" />
            <span className="text-[10px] uppercase tracking-[0.25em] text-neutral-600">or</span>
            <span className="h-px flex-1 bg-white/10" />
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={() => void continueAsGuest()}
            className="w-full rounded-xl border border-white/15 py-3 text-sm font-bold uppercase tracking-wide text-neutral-200 transition hover:border-white/30 hover:text-white disabled:opacity-40"
          >
            Play now as guest
          </button>
        </div>

        <p className="mt-6 text-center text-sm text-neutral-500">
          {mode === "login" ? (
            <>
              No account?{" "}
              <button type="button" onClick={() => setMode("signup")} className="text-brand hover:underline">
                Sign up
              </button>
            </>
          ) : (
            <>
              Have an account?{" "}
              <button type="button" onClick={() => setMode("login")} className="text-brand hover:underline">
                Sign in
              </button>
            </>
          )}
        </p>

        <p className="mt-4 text-center">
          <Link href="/hub" className="text-xs text-neutral-500 hover:text-neutral-300">
            ← Back to Command Center
          </Link>
        </p>
      </Panel>
    </div>
  );
}
