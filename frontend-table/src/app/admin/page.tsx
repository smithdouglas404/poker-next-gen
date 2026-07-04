"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { callSessionRpc } from "@/lib/nakama/sessionRpc";

interface Club {
  id: string;
  name: string;
  slug: string;
  currency: string;
  is_active: boolean;
}

export default function AdminPage() {
  const [clubs, setClubs] = useState<Club[]>([]);
  const [wallet, setWallet] = useState<number | null>(null);
  const [profile, setProfile] = useState<{ user_id: string; username: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const [clubData, walletData, profileData] = await Promise.all([
        callSessionRpc("club_list", {}),
        callSessionRpc("wallet_get", {}),
        callSessionRpc("profile_get", {}),
      ]);
      const clubsPayload = clubData as { clubs?: Club[] };
      setClubs(clubsPayload.clubs ?? []);
      const w = walletData as { balance_cents?: number };
      setWallet(w.balance_cents ?? null);
      const p = profileData as { user_id: string; username: string };
      setProfile(p);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load admin data");
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <div className="min-h-screen bg-neutral-950 text-white">
      <header className="border-b border-white/10 px-6 py-8">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-amber-300/80">Admin</p>
            <h1 className="mt-1 text-3xl font-semibold">Platform Dashboard</h1>
          </div>
          <Link href="/" className="text-sm text-emerald-400 hover:underline">
            ← Command Center
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-8 px-6 py-10">
        {error && (
          <div className="rounded-xl border border-red-500/30 bg-red-950/20 p-4 text-red-200">{error}</div>
        )}

        <section className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
            <p className="text-xs uppercase tracking-wider text-neutral-500">Your Wallet</p>
            <p className="mt-2 text-3xl font-bold text-emerald-300">
              {wallet !== null ? `$${(wallet / 100).toLocaleString()}` : "—"}
            </p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
            <p className="text-xs uppercase tracking-wider text-neutral-500">User ID</p>
            <p className="mt-2 truncate font-mono text-sm text-neutral-300">{profile?.user_id ?? "—"}</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
            <p className="text-xs uppercase tracking-wider text-neutral-500">Active Clubs</p>
            <p className="mt-2 text-3xl font-bold text-amber-200">{clubs.length}</p>
          </div>
        </section>

        <section className="rounded-2xl border border-white/10 bg-black/30 p-6">
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-lg font-semibold">Communities</h2>
            <button
              type="button"
              disabled={busy}
              onClick={() => void refresh()}
              className="rounded-full border border-white/20 px-4 py-1.5 text-xs font-semibold uppercase tracking-wider hover:bg-white/5 disabled:opacity-50"
            >
              Refresh
            </button>
          </div>
          <div className="mt-4 space-y-3">
            {clubs.length === 0 && (
              <p className="text-sm text-neutral-500">
                No clubs yet. Create one from the{" "}
                <Link href="/" className="text-emerald-400 hover:underline">
                  Command Center
                </Link>
                .
              </p>
            )}
            {clubs.map((club) => (
              <div
                key={club.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.02] p-4"
              >
                <div>
                  <p className="font-medium">{club.name}</p>
                  <p className="font-mono text-xs text-neutral-500">{club.id}</p>
                </div>
                <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] uppercase text-emerald-300">
                  {club.currency}
                </span>
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
