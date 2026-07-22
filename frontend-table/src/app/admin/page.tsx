"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { AdminShell } from "@/features/admin/AdminShell";
import { adminApi } from "@/features/admin/adminRpc";
import { Announcements } from "@/features/admin/sections/Announcements";
import { AntiCheat } from "@/features/admin/sections/AntiCheat";
import { Audit } from "@/features/admin/sections/Audit";
import { Finance } from "@/features/admin/sections/Finance";
import { Kyc } from "@/features/admin/sections/Kyc";
import { Overview } from "@/features/admin/sections/Overview";
import { Platform } from "@/features/admin/sections/Platform";
import type { Notify } from "@/features/admin/sections/shared";
import { Support } from "@/features/admin/sections/Support";
import { Users } from "@/features/admin/sections/Users";
import { Withdrawals } from "@/features/admin/sections/Withdrawals";
import type { AdminSection } from "@/features/admin/types";
import { GLASS_PANEL, cn } from "@/features/ui/tokens";

interface Toast {
  msg: string;
  kind: "ok" | "err";
}

type Gate = "checking" | "denied" | "granted";

export default function AdminPage() {
  const [gate, setGate] = useState<Gate>("checking");
  const [section, setSection] = useState<AdminSection>("overview");
  const [online, setOnline] = useState<number | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);

  const notify = useCallback<Notify>((msg, kind = "ok") => {
    setToast({ msg, kind });
    window.setTimeout(() => setToast(null), 3400);
  }, []);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const roles = await adminApi.roles();
        if (!alive) return;
        setGate(roles.platform_admin ? "granted" : "denied");
      } catch {
        if (alive) setGate("denied");
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (gate !== "granted") return;
    let alive = true;
    const tick = () =>
      void adminApi
        .presence()
        .then((p) => {
          if (alive) setOnline(p.online ?? 0);
        })
        .catch(() => {});
    tick();
    const iv = window.setInterval(tick, 30_000);
    return () => {
      alive = false;
      window.clearInterval(iv);
    };
  }, [gate]);

  if (gate === "checking") {
    return (
      <div className="flex min-h-screen items-center justify-center text-neutral-500">
        <div className="flex items-center gap-3">
          <span className="h-2.5 w-2.5 animate-ping rounded-full bg-cyan" />
          Verifying access…
        </div>
      </div>
    );
  }

  if (gate === "denied") {
    return (
      <div className="flex min-h-screen items-center justify-center px-4 text-foreground">
        <div className={cn(GLASS_PANEL, "w-full max-w-md p-8 text-center")}>
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl border border-red-500/30 bg-red-500/10 text-2xl text-red-400">
            ⊘
          </div>
          <p className="mt-4 font-display text-[11px] font-bold uppercase tracking-[0.28em] text-red-400/80">
            Restricted
          </p>
          <h1 className="font-display mt-1 text-2xl font-bold uppercase tracking-wide">
            Admin access only
          </h1>
          <p className="mt-2 text-sm text-neutral-400">
            This console requires platform administrator privileges. If you believe this is an
            error, contact the platform owner.
          </p>
          <Link
            href="/hub"
            className="mt-6 inline-flex items-center gap-2 rounded-xl border border-white/15 px-5 py-2.5 text-sm font-semibold uppercase tracking-wide text-white transition hover:bg-white/5"
          >
            ← Back to Command Center
          </Link>
        </div>
      </div>
    );
  }

  return (
    <>
      {toast && (
        <div
          className={cn(
            "fixed left-1/2 top-4 z-50 -translate-x-1/2 rounded-xl border px-4 py-2.5 text-sm shadow-lg backdrop-blur-xl",
            toast.kind === "ok"
              ? "border-emerald-500/30 bg-emerald-950/50 text-emerald-200"
              : "border-red-500/30 bg-red-950/50 text-red-200",
          )}
        >
          {toast.msg}
        </div>
      )}

      <AdminShell section={section} onSection={setSection} online={online}>
        {section === "overview" && <Overview notify={notify} />}
        {section === "users" && <Users notify={notify} />}
        {section === "kyc" && <Kyc notify={notify} />}
        {section === "withdrawals" && <Withdrawals notify={notify} />}
        {section === "anticheat" && <AntiCheat notify={notify} />}
        {section === "announcements" && <Announcements notify={notify} />}
        {section === "support" && <Support notify={notify} />}
        {section === "finance" && <Finance notify={notify} />}
        {section === "platform" && <Platform notify={notify} />}
        {section === "audit" && <Audit notify={notify} />}
      </AdminShell>
    </>
  );
}
