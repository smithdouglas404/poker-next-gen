"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

interface ServiceStatus {
  id: string;
  name: string;
  url: string;
  ok: boolean;
  error?: string;
  hint?: string;
}

interface StackHealth {
  ok: boolean;
  allOk?: boolean;
  services: ServiceStatus[];
  live: Record<string, string | undefined>;
  boot?: Record<string, string>;
  runtime?: { mode?: string; note?: string };
  at: string;
}

export default function LiveStackPage() {
  const [health, setHealth] = useState<StackHealth | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/stack/health", { cache: "no-store" });
      if (!res.ok) {
        setHealth(null);
        return;
      }
      setHealth(await res.json());
    } catch {
      setHealth(null);
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const id = window.setInterval(() => void refresh(), 10_000);
    return () => window.clearInterval(id);
  }, [refresh]);

  const onRailway = health?.runtime?.mode === "railway";
  const onCompose = health?.runtime?.mode === "compose";

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-white/10 px-6 py-10">
        <div className="mx-auto flex max-w-4xl flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.35em] text-emerald-300/80">Live Stack</p>
            <h1 className="mt-2 text-3xl font-semibold">
              {health?.ok ? "Core stack live" : health ? "Stack incomplete" : "Live Stack"}
            </h1>
            <p className="mt-2 text-sm text-neutral-400">
              Nakama + rs_poker are required · OddSlingers is optional
              {health?.runtime?.mode && (
                <span className="ml-2 rounded bg-white/10 px-2 py-0.5 text-[10px] uppercase tracking-wider">
                  {health.runtime.mode}
                </span>
              )}
            </p>
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              disabled={busy}
              onClick={() => void refresh()}
              className="rounded-xl border border-white/20 px-4 py-2 text-sm font-semibold hover:bg-white/5 disabled:opacity-50"
            >
              {busy ? "Checking…" : "Refresh"}
            </button>
            <Link href="/hub" className="rounded-xl border border-emerald-500/40 px-4 py-2 text-sm text-emerald-200">
              Command Center
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl space-y-8 px-6 py-10">
        <section
          className={`rounded-2xl border p-6 ${
            health?.ok ? "border-emerald-500/40 bg-emerald-950/20" : "border-amber-500/40 bg-amber-950/20"
          }`}
        >
          <p className="text-sm uppercase tracking-wider text-neutral-400">Overall</p>
          <p className="mt-1 text-2xl font-semibold">
            {health?.ok
              ? health.allOk
                ? "All services live"
                : "Core live (OddSlingers optional)"
              : onRailway
                ? "Railway services down"
                : onCompose
                  ? "Sibling containers down"
                  : "Core services down"}
          </p>
          {health?.runtime?.note && (
            <p className="mt-2 text-sm text-neutral-400">{health.runtime.note}</p>
          )}
          {health?.at && <p className="mt-1 text-xs text-neutral-500">Last check {new Date(health.at).toLocaleString()}</p>}
          {health === null && !busy && (
            <p className="mt-2 text-sm text-red-300">Could not reach /api/stack/health.</p>
          )}
        </section>

        <section className="grid gap-4 sm:grid-cols-2">
          {health?.services.map((svc) => (
            <article
              key={svc.id}
              className="rounded-xl border border-white/[0.06] bg-[#1c2128] p-5 shadow-[0_2px_12px_rgba(0,0,0,0.4)]"
            >
              <div className="flex items-center justify-between gap-2">
                <h2 className="font-semibold">{svc.name}</h2>
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                    svc.ok
                      ? "bg-emerald-500/20 text-emerald-300"
                      : svc.id === "oddslingers"
                        ? "bg-amber-500/20 text-amber-300"
                        : "bg-red-500/20 text-red-300"
                  }`}
                >
                  {svc.ok ? "Live" : svc.id === "oddslingers" ? "Optional" : "Down"}
                </span>
              </div>
              <p className="mt-2 break-all font-mono text-[10px] text-neutral-500">{svc.url}</p>
              {svc.error && <p className="mt-2 text-xs text-red-300">{svc.error}</p>}
              {svc.hint && <p className="mt-2 text-xs text-amber-200/90">{svc.hint}</p>}
            </article>
          ))}
        </section>

        <section className="rounded-xl border border-white/[0.06] bg-[#1c2128] p-6 shadow-[0_2px_12px_rgba(0,0,0,0.4)]">
          <h2 className="text-lg font-semibold">
            {onRailway ? "Fix on Railway" : onCompose ? "Fix missing services (Docker)" : "Deploy the stack"}
          </h2>
          <p className="mt-2 text-sm text-neutral-400">
            {onRailway
              ? "Check deploy logs in Railway or from your terminal:"
              : onCompose
                ? "Run these from your terminal in the repo root:"
                : "Deploy everything on Railway (no Docker). See docs/RAILWAY.md:"}
          </p>
          <div className="mt-4 space-y-3 font-mono text-xs">
            {health?.boot &&
              Object.entries(health.boot).map(([key, cmd]) => (
                <div key={key} className="rounded-xl bg-black/50 p-4">
                  <p className="text-neutral-500"># {key.replace(/_/g, " ")}</p>
                  <p className="text-emerald-200">{cmd}</p>
                </div>
              ))}
          </div>
        </section>

        <section className="rounded-xl border border-white/[0.06] bg-[#1c2128] p-6 shadow-[0_2px_12px_rgba(0,0,0,0.4)]">
          <h2 className="text-lg font-semibold">Open in browser</h2>
          <ul className="mt-4 space-y-2 text-sm">
            {health &&
              Object.entries(health.live)
                .filter(([, url]) => url)
                .map(([key, url]) => (
                  <li key={key} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-black/30 px-3 py-2">
                    <span className="capitalize text-neutral-300">{key.replace(/_/g, " ")}</span>
                    <a href={url} className="font-mono text-emerald-400 hover:underline" target="_blank" rel="noreferrer">
                      {url}
                    </a>
                  </li>
                ))}
          </ul>
        </section>
      </main>
    </div>
  );
}
