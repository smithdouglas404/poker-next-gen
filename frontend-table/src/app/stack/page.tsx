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
  services: ServiceStatus[];
  live: Record<string, string>;
  boot?: Record<string, string>;
  at: string;
}

export default function LiveStackPage() {
  const [health, setHealth] = useState<StackHealth | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/stack/health", { cache: "no-store" });
      setHealth(await res.json());
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const id = window.setInterval(() => void refresh(), 10_000);
    return () => window.clearInterval(id);
  }, [refresh]);

  return (
    <div className="min-h-screen bg-neutral-950 text-white">
      <header className="border-b border-white/10 px-6 py-10">
        <div className="mx-auto flex max-w-4xl flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.35em] text-emerald-300/80">Live Stack</p>
            <h1 className="mt-2 text-3xl font-semibold">Everything running</h1>
            <p className="mt-2 text-sm text-neutral-400">
              Nakama · rs_poker engine-math · OddSlingers · Next.js table UI
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
            <Link href="/" className="rounded-xl border border-emerald-500/40 px-4 py-2 text-sm text-emerald-200">
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
          <p className="mt-1 text-2xl font-semibold">{health?.ok ? "All services live" : "Some services down"}</p>
          {health?.at && <p className="mt-1 text-xs text-neutral-500">Last check {new Date(health.at).toLocaleString()}</p>}
        </section>

        <section className="grid gap-4 sm:grid-cols-2">
          {health?.services.map((svc) => (
            <article
              key={svc.id}
              className="rounded-2xl border border-white/10 bg-white/[0.03] p-5"
            >
              <div className="flex items-center justify-between gap-2">
                <h2 className="font-semibold">{svc.name}</h2>
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                    svc.ok ? "bg-emerald-500/20 text-emerald-300" : "bg-red-500/20 text-red-300"
                  }`}
                >
                  {svc.ok ? "Live" : "Down"}
                </span>
              </div>
              <p className="mt-2 break-all font-mono text-[10px] text-neutral-500">{svc.url}</p>
              {svc.error && (
                <p className="mt-2 text-xs text-red-300">
                  Down{svc.error.includes("refused") ? " (needs Docker)" : ""}: {svc.error}
                </p>
              )}
              {svc.hint && <p className="mt-2 text-xs text-amber-200/90">{svc.hint}</p>}
            </article>
          ))}
        </section>

        <section className="rounded-2xl border border-white/10 p-6">
          <h2 className="text-lg font-semibold">Boot the full stack</h2>
          <p className="mt-2 text-sm text-neutral-400">
            If Nakama or OddSlingers show &ldquo;needs Docker&rdquo;, the UI is up but those containers are not
            listening yet. From the repo root:
          </p>
          <pre className="mt-4 overflow-x-auto rounded-xl bg-black/50 p-4 font-mono text-xs text-emerald-200">
            {health?.boot?.full_stack ?? "./scripts/live-up.sh"}
          </pre>
          <p className="mt-3 text-xs text-neutral-500">
            Then check:{" "}
            <code className="text-neutral-300">{health?.boot?.verify ?? "./scripts/stack-status.sh"}</code>
          </p>
        </section>

        <section className="rounded-2xl border border-white/10 p-6">
          <h2 className="text-lg font-semibold">Open in browser</h2>
          <ul className="mt-4 space-y-2 text-sm">
            {health &&
              Object.entries(health.live).map(([key, url]) => (
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
