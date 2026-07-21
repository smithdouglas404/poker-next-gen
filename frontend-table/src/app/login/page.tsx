"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { authenticate } from "@/lib/nakama/auth";
import { Button, Field, Input, Panel, SectionHeader } from "@/features/ui";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "signup">("login");
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
      router.push("/");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Authentication failed");
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
        </div>

        <p className="mt-6 text-center text-sm text-neutral-500">
          {mode === "login" ? (
            <>
              No account?{" "}
              <button type="button" onClick={() => setMode("signup")} className="text-cyan hover:underline">
                Sign up
              </button>
            </>
          ) : (
            <>
              Have an account?{" "}
              <button type="button" onClick={() => setMode("login")} className="text-cyan hover:underline">
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
