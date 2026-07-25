"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { authenticate } from "@/lib/nakama/auth";
import { callSessionRpc } from "@/lib/nakama/sessionRpc";
import { AVATARS, avatarSrc } from "@/features/table/avatars";
import { Button, Field, Input, Panel, SectionHeader } from "@/features/ui";
import { cn } from "@/features/ui/tokens";

// Starter avatars offered at onboarding — the player creates their profile and
// picks their character together (they can buy more later in the marketplace).
const STARTER_AVATARS = ["neon-viper", "chrome-siren", "ice-queen", "cyber-samurai", "red-wolf", "steel-ghost"]
  .map((id) => AVATARS.find((a) => a.id === id))
  .filter((a): a is (typeof AVATARS)[number] => Boolean(a));

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [step, setStep] = useState<"form" | "avatar">("form");
  const [avatar, setAvatar] = useState<string>(STARTER_AVATARS[0]?.id ?? "neon-viper");

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
      if (mode === "signup") {
        // New account → pick your starter avatar (profile + avatar together).
        setStep("avatar");
      } else {
        router.push("/hub"); // land members on their home, not the marketing page
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Authentication failed");
    } finally {
      setBusy(false);
    }
  };

  // Persist the chosen avatar to the account, then into the customization studio.
  const proceedWithAvatar = async () => {
    setBusy(true);
    try {
      await callSessionRpc("profile_meta_set", { avatar }).catch(() => {});
      router.push("/studio");
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

  // Google / 3rd-party OAuth is handled by Clerk (clerk.com). Route to the Clerk
  // sign-in page; on success ClerkNakamaBridge trades the Clerk session for a
  // Nakama session. No-op message only if Clerk isn't configured on this build.
  const googleLogin = async () => {
    if (!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) {
      setError("Social sign-in isn't configured on this deployment yet.");
      return;
    }
    router.push("/sign-in");
  };

  if (step === "avatar") {
    return (
      <div className="flex min-h-screen items-center justify-center px-4 py-10 text-white">
        <Panel className="w-full max-w-3xl p-8">
          <SectionHeader>High Rollers Club</SectionHeader>
          <h1 className="font-display mt-2 text-3xl font-bold">Choose Your Character</h1>
          <p className="mt-2 text-sm text-neutral-400">
            Your account is created. Pick a starter avatar — you can buy more and fully customize in
            the Studio. Every avatar tracks its own battle record as you play.
          </p>
          <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3">
            {STARTER_AVATARS.map((a) => {
              const on = avatar === a.id;
              return (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => setAvatar(a.id)}
                  className={cn(
                    "group relative overflow-hidden rounded-2xl border-2 p-2 text-left transition",
                    on ? "border-gold" : "border-white/10 hover:border-white/30",
                  )}
                  style={on ? { boxShadow: `0 0 22px ${a.glow}` } : undefined}
                >
                  <div className="aspect-square overflow-hidden rounded-xl bg-gradient-to-br from-[#1c1f27] to-[#0c0e13]">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={avatarSrc(a.id)}
                      alt={a.name}
                      className="h-full w-full object-cover"
                      onError={(e) => {
                        (e.currentTarget as HTMLImageElement).style.visibility = "hidden";
                      }}
                    />
                  </div>
                  <div className="mt-2 flex items-center justify-between px-1">
                    <span className="font-display text-sm font-semibold text-white">{a.name}</span>
                    <span className="text-[10px] uppercase tracking-wide text-gold/70">{a.tier}</span>
                  </div>
                  {on && (
                    <span className="absolute right-3 top-3 grid h-6 w-6 place-items-center rounded-full bg-gold text-xs font-bold text-black">
                      ✓
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          <div className="mt-7 flex flex-col gap-3 sm:flex-row">
            <Button size="lg" disabled={busy} onClick={() => void proceedWithAvatar()} className="flex-1">
              {busy ? "Saving…" : "Proceed to Customization →"}
            </Button>
            <Button
              variant="outline"
              size="lg"
              disabled={busy}
              onClick={() => router.push("/hub")}
              className="sm:w-40"
            >
              Skip for now
            </Button>
          </div>
        </Panel>
      </div>
    );
  }

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
