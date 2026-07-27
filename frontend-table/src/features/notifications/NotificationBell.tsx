"use client";

// The notification bell, made real.
//
// It was a decorative control: `aria-label="Notifications"` on a button whose
// only behaviour was `router.push("/dashboard")`. There was no inbox anywhere in
// the app, which is also why club announcements had nowhere to land even once
// the server started sending them.

import { useCallback, useEffect, useRef, useState } from "react";
import { Bell } from "lucide-react";

import { cn } from "@/features/ui/tokens";
import { InlineMarkup } from "@/features/ui/InlineMarkup";

import {
  NOTIFICATION_CODE,
  dismissNotifications,
  listNotifications,
  type AppNotification,
} from "./notificationsRpc";

const POLL_MS = 60_000;

const SEVERITY_DOT: Record<AppNotification["severity"], string> = {
  info: "bg-green",
  warning: "bg-gold",
  critical: "bg-brand",
};

function relTime(iso?: string): string {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "";
  const mins = Math.max(0, Math.round((Date.now() - then) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

function sourceLabel(n: AppNotification): string {
  if (n.code === NOTIFICATION_CODE.clubAnnouncement) return n.clubName ?? "Club";
  if (n.code === NOTIFICATION_CODE.platformAnnouncement) return "High Rollers";
  return "";
}

export function NotificationBell() {
  const [items, setItems] = useState<AppNotification[]>([]);
  const [open, setOpen] = useState(false);
  // Distinguished from "empty": an unreachable server must not render as
  // "no messages", which would quietly hide a broadcast the player did receive.
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const panelRef = useRef<HTMLDivElement | null>(null);

  const load = useCallback(async () => {
    try {
      setItems(await listNotifications(25));
      setFailed(false);
    } catch {
      setFailed(true);
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), POLL_MS);
    // Coming back to the tab is the moment a stale count is most obvious.
    const onFocus = () => void load();
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [load]);

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const dismiss = async (id: string) => {
    setItems((list) => list.filter((n) => n.id !== id));
    try {
      await dismissNotifications([id]);
    } catch {
      // Put it back rather than pretending it was cleared server-side.
      void load();
    }
  };

  const dismissAll = async () => {
    const ids = items.map((n) => n.id);
    setItems([]);
    try {
      await dismissNotifications(ids);
    } catch {
      void load();
    }
  };

  const count = items.length;

  return (
    <div className="relative" ref={panelRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={count > 0 ? `Notifications (${count} unread)` : "Notifications"}
        aria-expanded={open}
        className="relative rounded-lg p-1.5 text-neutral-400 transition-colors hover:bg-white/10 hover:text-foreground"
      >
        <Bell className="h-4 w-4" />
        {count > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand px-1 text-[9px] font-bold tabular-nums text-white">
            {count > 9 ? "9+" : count}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-[340px] overflow-hidden rounded-2xl border border-white/[0.08] bg-surface-2 shadow-[0_18px_50px_-12px_rgba(0,0,0,0.7)]">
          <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-neutral-400">
              Notifications
            </p>
            {count > 0 && (
              <button
                type="button"
                onClick={() => void dismissAll()}
                className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500 transition-colors hover:text-foreground"
              >
                Clear all
              </button>
            )}
          </div>

          <div className="max-h-[380px] overflow-y-auto">
            {!loaded && <p className="px-4 py-6 text-center text-sm text-neutral-500">Loading…</p>}
            {loaded && failed && (
              <p className="px-4 py-6 text-center text-sm text-neutral-500">
                Couldn&apos;t reach the server, so nothing is shown. This is not the same as having
                no messages.
              </p>
            )}
            {loaded && !failed && count === 0 && (
              <p className="px-4 py-6 text-center text-sm text-neutral-500">You&apos;re all caught up.</p>
            )}
            {loaded &&
              !failed &&
              items.map((n) => (
                <div
                  key={n.id}
                  className="border-b border-white/[0.04] px-4 py-3 last:border-0 hover:bg-white/[0.02]"
                >
                  <div className="flex items-start gap-2.5">
                    <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", SEVERITY_DOT[n.severity])} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <p className="truncate text-sm font-semibold text-white">{n.subject}</p>
                        <span className="shrink-0 text-[10px] text-neutral-600">
                          {relTime(n.createTime)}
                        </span>
                      </div>
                      {sourceLabel(n) && (
                        <p className="mt-0.5 text-[10px] uppercase tracking-wider text-neutral-500">
                          {sourceLabel(n)}
                        </p>
                      )}
                      {n.body && (
                        <p className="mt-1 text-[12px] leading-snug text-neutral-400">
                          {/* Same renderer the composer previews with, so what the
                              operator saw is what the player reads. */}
                          <InlineMarkup text={n.body} />
                        </p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => void dismiss(n.id)}
                      aria-label="Dismiss"
                      className="shrink-0 text-neutral-600 transition-colors hover:text-foreground"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
