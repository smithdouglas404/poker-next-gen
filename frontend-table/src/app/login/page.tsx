"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { authenticate } from "@/lib/nakama/auth";

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
    <div className="flex min-h-screen items-center justify-center bg-neutral-950 px-4 text-white">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-black/40 p-8">
        <p className="text-xs uppercase tracking-[0.3em] text-amber-300/80">Poker Next-Gen</p>
        <h1 className="mt-2 text-2xl font-semibold">{mode === "login" ? "Sign In" : "Create Account"}</h1>
        <p className="mt-2 text-sm text-neutral-400">
          Real Nakama email authentication — replaces anonymous device-only login.
        </p>

        {error && (
          <div className="mt-4 rounded-lg border border-red-500/30 bg-red-950/20 p-3 text-sm text-red-200">
            {error}
          </div>
        )}

        <div className="mt-6 space-y-3">
          {mode === "signup" && (
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Username"
              className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-sm outline-none focus:border-emerald-500/50"
            />
          )}
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-sm outline-none focus:border-emerald-500/50"
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-sm outline-none focus:border-emerald-500/50"
          />
          <button
            type="button"
            disabled={busy}
            onClick={() => void submit()}
            className="w-full rounded-xl bg-emerald-700 py-3 text-sm font-semibold uppercase tracking-wider hover:bg-emerald-600 disabled:opacity-50"
          >
            {mode === "login" ? "Sign In" : "Create Account"}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void googleLogin()}
            className="w-full rounded-xl border border-white/20 py-3 text-sm font-semibold uppercase tracking-wider hover:bg-white/5 disabled:opacity-50"
          >
            Continue with Google
          </button>
        </div>

        <p className="mt-6 text-center text-sm text-neutral-500">
          {mode === "login" ? (
            <>
              No account?{" "}
              <button type="button" onClick={() => setMode("signup")} className="text-emerald-400 hover:underline">
                Sign up
              </button>
            </>
          ) : (
            <>
              Have an account?{" "}
              <button type="button" onClick={() => setMode("login")} className="text-emerald-400 hover:underline">
                Sign in
              </button>
            </>
          )}
        </p>

        <p className="mt-4 text-center">
          <Link href="/" className="text-xs text-neutral-500 hover:text-neutral-300">
            ← Back to Command Center
          </Link>
        </p>
      </div>
    </div>
  );
}
