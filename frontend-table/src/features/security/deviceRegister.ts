// Device registration for multi-account / shared-device detection.
//
// `device_register` shipped with the anti-cheat backend and had no caller, so
// poker_device_fingerprint was a table nothing wrote. Every shared-device check
// downstream — the collusion scanner's shared-device component,
// device_multi_account_list — read an empty set and reported nothing. The
// detection ran, found zero, and looked like a clean platform.
//
// The IP is NOT sent: the server takes it from the connection. Anything the
// client asserts about itself is worthless as a fraud signal, because the party
// being detected controls it.
//
// The fingerprint below is deliberately coarse and non-invasive: screen shape,
// timezone, platform, language, hardware concurrency. It is stable enough to
// correlate two accounts on one machine and weak enough that it identifies a
// device class rather than tracking a person across the web. That is the right
// trade for this purpose — the question is "are these two accounts the same
// machine", not "who is this human".

import { callSessionRpc } from "@/lib/nakama/sessionRpc";

const SENT_KEY = "poker.device.registered";

/** A coarse, stable device signature. Empty string when unavailable (SSR). */
export function deviceFingerprint(): string {
  if (typeof window === "undefined" || typeof navigator === "undefined") return "";
  const parts = [
    // Screen geometry survives tab/window resizing; innerWidth would not.
    `${window.screen?.width ?? 0}x${window.screen?.height ?? 0}x${window.screen?.colorDepth ?? 0}`,
    String(new Date().getTimezoneOffset()),
    Intl.DateTimeFormat().resolvedOptions().timeZone ?? "",
    navigator.language ?? "",
    // `platform` is deprecated but still the most stable OS hint available; the
    // userAgentData fallback is Chromium-only, hence both.
    (navigator as unknown as { userAgentData?: { platform?: string } }).userAgentData?.platform ??
      navigator.platform ??
      "",
    String(navigator.hardwareConcurrency ?? 0),
    String((navigator as unknown as { deviceMemory?: number }).deviceMemory ?? 0),
  ];
  return hash(parts.join("|"));
}

/** FNV-1a — short, dependency-free, and adequate for a correlation key. */
function hash(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

/**
 * Register this device against the signed-in account. Safe to call repeatedly.
 *
 * Once per session, not once per page: the backend upserts, but a request on
 * every navigation is noise in the logs and load for nothing. Failure is
 * swallowed — a player must never be blocked from playing because a fraud
 * signal could not be recorded. It simply means this session is not correlated,
 * which is the pre-existing behaviour for every session until now.
 */
export async function registerDevice(): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    if (window.sessionStorage.getItem(SENT_KEY)) return;
  } catch {
    /* storage blocked (private mode) — fall through and just send it */
  }
  const fingerprint = deviceFingerprint();
  if (!fingerprint) return;
  try {
    await callSessionRpc("device_register", {
      fingerprint,
      user_agent: navigator.userAgent ?? "",
    });
    try {
      window.sessionStorage.setItem(SENT_KEY, "1");
    } catch {
      /* nothing to do */
    }
  } catch {
    /* not a player-facing failure */
  }
}
