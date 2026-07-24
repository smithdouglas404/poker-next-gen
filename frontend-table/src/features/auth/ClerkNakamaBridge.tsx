"use client";

import { useAuth } from "@clerk/nextjs";
import { useEffect, useRef } from "react";

import { authenticateClerk, loadPersistedSession } from "@/lib/nakama/auth";

// ClerkNakamaBridge establishes a Nakama session once a user is signed in with
// Clerk. The whole app runs on Nakama sessions (callSessionRpc), so a Clerk
// login alone is not enough — this trades the Clerk session JWT for a Nakama
// session via the backend's verify-and-mint hook. It is a no-op when the user
// is signed out, when a valid Nakama session already exists, or when Clerk is
// not configured (useAuth stays unloaded). Renders nothing.
export function ClerkNakamaBridge() {
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const attempted = useRef(false);

  useEffect(() => {
    if (!isLoaded || !isSignedIn || attempted.current) return;
    const existing = loadPersistedSession();
    if (existing && !existing.isexpired(Date.now() / 1000)) return;
    attempted.current = true;
    void (async () => {
      try {
        const jwt = await getToken();
        if (jwt) {
          await authenticateClerk(jwt);
          // Reload so session-dependent screens pick up the new Nakama session.
          if (typeof window !== "undefined") window.location.reload();
        }
      } catch {
        // Allow a later retry (e.g. token not ready yet).
        attempted.current = false;
      }
    })();
  }, [isLoaded, isSignedIn, getToken]);

  return null;
}
