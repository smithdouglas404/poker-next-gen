"use client";

// Self-diagnosing connectivity page. Runs entirely in the browser, so it uses
// the visitor's own network path to the backend — the same path every data call
// takes. Open /diag after any deploy: it prints the COMPILED Nakama host, the
// resolved URL/port/SSL, and live pass/fail for reachability, device-auth, and
// an RPC. "Failed to fetch" here means the browser can't reach the host shown —
// almost always a wrong NEXT_PUBLIC_NAKAMA_HOST baked at build time.

import { useCallback, useEffect, useState } from "react";

import { GLASS_PANEL, cn } from "@/features/ui/tokens";

type Check = { label: string; status: "pending" | "ok" | "fail"; detail: string };

function normalizeHost(raw: string | undefined): string {
  const value = (raw ?? "http://localhost:7350").trim();
  if (/^https?:\/\//i.test(value)) return value;
  return `https://${value}`;
}

export default function DiagPage() {
  const rawHost = process.env.NEXT_PUBLIC_NAKAMA_HOST;
  const serverKey = process.env.NEXT_PUBLIC_NAKAMA_SERVER_KEY ?? "defaultkey";
  const host = normalizeHost(rawHost);
  const url = (() => {
    try {
      return new URL(host);
    } catch {
      return null;
    }
  })();
  const useSSL = url?.protocol === "https:";
  const port = url?.port || (useSSL ? "443" : "7350");
  const base = url ? `${url.protocol}//${url.hostname}:${port}` : "(invalid host)";

  const [checks, setChecks] = useState<Check[]>([]);
  const [running, setRunning] = useState(false);

  const run = useCallback(async () => {
    if (!url) {
      setChecks([{ label: "Host config", status: "fail", detail: `NEXT_PUBLIC_NAKAMA_HOST is invalid: ${String(rawHost)}` }]);
      return;
    }
    setRunning(true);
    const results: Check[] = [];
    const push = (c: Check) => {
      results.push(c);
      setChecks([...results]);
    };

    // 1. Reachability + healthz (no auth needed).
    try {
      const r = await fetch(`${base}/v2/rpc/healthz?http_key=defaulthttpkey`, { method: "GET" });
      push({
        label: "Backend reachable (healthz)",
        status: r.ok ? "ok" : "fail",
        detail: `HTTP ${r.status} from ${base}`,
      });
    } catch (e) {
      push({
        label: "Backend reachable (healthz)",
        status: "fail",
        detail: `Failed to fetch ${base} — the browser cannot reach this host. Fix NEXT_PUBLIC_NAKAMA_HOST + rebuild. (${e instanceof Error ? e.message : "network error"})`,
      });
      setRunning(false);
      return;
    }

    // 2. Device auth (the first call every data page makes).
    let token = "";
    try {
      const auth = "Basic " + btoa(`${serverKey}:`);
      const r = await fetch(`${base}/v2/account/authenticate/device?create=true`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: auth },
        body: JSON.stringify({ id: `diag-${Date.now()}-${Math.floor(Math.random() * 1e6)}` }),
      });
      const body = await r.json().catch(() => ({}));
      token = (body as { token?: string }).token ?? "";
      push({
        label: "Device authentication",
        status: r.ok && token ? "ok" : "fail",
        detail: r.ok ? "session token issued" : `HTTP ${r.status} — server key mismatch? (frontend uses "${serverKey}")`,
      });
    } catch (e) {
      push({ label: "Device authentication", status: "fail", detail: e instanceof Error ? e.message : "network error" });
    }

    // 3. A real session RPC through the issued token.
    if (token) {
      try {
        const r = await fetch(`${base}/v2/rpc/healthz`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: '""',
        });
        push({ label: "Authenticated RPC", status: r.ok ? "ok" : "fail", detail: `HTTP ${r.status}` });
      } catch (e) {
        push({ label: "Authenticated RPC", status: "fail", detail: e instanceof Error ? e.message : "network error" });
      }
    }
    setRunning(false);
  }, [base, rawHost, serverKey, url]);

  useEffect(() => {
    void run();
  }, [run]);

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-10 text-white">
      <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-gold/70">Diagnostics</p>
      <h1 className="font-display text-3xl font-bold uppercase tracking-wide">Backend Connectivity</h1>
      <p className="mt-2 text-sm text-white/50">
        Runs in your browser against the host this build was compiled with. Reload after each deploy.
      </p>

      <div className={cn(GLASS_PANEL, "mt-6 space-y-1 p-5 font-mono text-xs")}>
        <Row k="NEXT_PUBLIC_NAKAMA_HOST (raw)" v={String(rawHost ?? "(unset → localhost fallback)")} />
        <Row k="Resolved base URL" v={base} />
        <Row k="SSL / port" v={`${useSSL ? "https" : "http"} : ${port}`} />
        <Row k="Server key" v={serverKey} />
      </div>

      <div className="mt-5 space-y-2">
        {checks.map((c) => (
          <div key={c.label} className={cn(GLASS_PANEL, "flex items-start gap-3 p-4")}>
            <span className="text-lg leading-none">
              {c.status === "ok" ? "✅" : c.status === "fail" ? "❌" : "⏳"}
            </span>
            <div className="min-w-0">
              <p className="font-semibold">{c.label}</p>
              <p className="break-words text-xs text-white/55">{c.detail}</p>
            </div>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={() => void run()}
        disabled={running}
        className="mt-5 rounded-xl border border-white/15 px-4 py-2 text-sm font-bold uppercase tracking-wide hover:border-white/30 disabled:opacity-40"
      >
        {running ? "Running…" : "Re-run checks"}
      </button>

      <div className={cn(GLASS_PANEL, "mt-6 p-4 text-xs text-white/55")}>
        <p className="font-semibold text-white/70">Reading this:</p>
        <p className="mt-1">
          If <b>healthz</b> fails with &quot;Failed to fetch&quot;, the host above is unreachable from the
          browser — set <b>NEXT_PUBLIC_NAKAMA_HOST</b> to the backend&apos;s <b>public</b> Railway domain
          (not <span className="text-gold/70">*.railway.internal</span>) and <b>rebuild</b> the frontend
          (this value is baked at build time). If healthz passes but <b>device auth</b> fails with a 401,
          the server keys don&apos;t match.
        </p>
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex flex-wrap justify-between gap-2 border-b border-white/[0.05] py-1 last:border-0">
      <span className="text-white/45">{k}</span>
      <span className="break-all text-right text-white/90">{v}</span>
    </div>
  );
}
