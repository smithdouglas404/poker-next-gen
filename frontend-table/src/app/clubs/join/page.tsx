"use client";

// Join-by-code page (_invite-by-code resolver): a player pastes a club's share
// code (its slug) or opens a /clubs/join?code=… link, previews the club, and
// joins. Wired to club_resolve_code + club_join — no fabricated data.

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";

import { callSessionRpc } from "@/lib/nakama/sessionRpc";
import { BTN_GOLD, GLASS_PANEL, cn } from "@/features/ui/tokens";

type ClubPreview = { id: string; name: string; slug: string; description: string; members: number };

function JoinInner() {
  const router = useRouter();
  const params = useSearchParams();
  const [code, setCode] = useState("");
  const [club, setClub] = useState<ClubPreview | null>(null);
  const [alreadyMember, setAlreadyMember] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const resolve = useCallback(async (raw: string) => {
    const c = raw.trim();
    if (!c) return;
    setBusy(true);
    setError(null);
    setClub(null);
    try {
      const res = (await callSessionRpc("club_resolve_code", { code: c })) as {
        club: ClubPreview;
        already_member: boolean;
      };
      setClub(res.club);
      setAlreadyMember(res.already_member);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No club matches that code.");
    } finally {
      setBusy(false);
    }
  }, []);

  // Deep-link: /clubs/join?code=slug auto-resolves.
  useEffect(() => {
    const q = params.get("code");
    if (q) {
      setCode(q);
      void resolve(q);
    }
  }, [params, resolve]);

  const join = useCallback(async () => {
    if (!club) return;
    setBusy(true);
    setError(null);
    try {
      await callSessionRpc("club_join", { club_id: club.id });
      router.push("/clubs");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not join this club.");
      setBusy(false);
    }
  }, [club, router]);

  return (
    <div className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-4 py-10 text-white">
      <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-gold/70">Clubs</p>
      <h1 className="font-display text-3xl font-bold uppercase tracking-wide">Join by Code</h1>
      <p className="mt-2 text-sm text-white/50">
        Enter a club&apos;s share code (its handle) or open an invite link. You can belong to as many
        clubs as you like.
      </p>

      <div className={cn(GLASS_PANEL, "mt-6 p-5")}>
        <label className="text-[11px] uppercase tracking-wider text-white/45">Club code</label>
        <div className="mt-2 flex gap-2">
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void resolve(code)}
            placeholder="e.g. high-rollers"
            className="flex-1 rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm outline-none focus:border-gold/50"
          />
          <button
            type="button"
            onClick={() => void resolve(code)}
            disabled={busy || !code.trim()}
            className="rounded-lg border border-white/15 px-4 py-2 text-sm font-semibold hover:border-white/30 disabled:opacity-40"
          >
            {busy && !club ? "…" : "Find"}
          </button>
        </div>

        {error && <p className="mt-3 text-sm text-brand">{error}</p>}

        {club && (
          <div className="mt-5 rounded-xl border border-white/10 bg-black/30 p-4">
            <p className="font-display text-lg font-bold text-white">{club.name}</p>
            <p className="text-[11px] text-white/45">
              @{club.slug} · {club.members} member{club.members === 1 ? "" : "s"}
            </p>
            {club.description && <p className="mt-2 text-sm text-white/60">{club.description}</p>}
            {alreadyMember ? (
              <Link href="/clubs" className="mt-4 block text-center text-sm font-semibold text-green">
                You&apos;re already a member → Go to Clubs
              </Link>
            ) : (
              <button
                type="button"
                onClick={() => void join()}
                disabled={busy}
                className={cn(BTN_GOLD, "mt-4 w-full rounded-xl px-4 py-2.5 text-sm font-bold uppercase tracking-wide disabled:opacity-40")}
              >
                {busy ? "Joining…" : `Join ${club.name}`}
              </button>
            )}
          </div>
        )}
      </div>

      <Link href="/clubs" className="mt-6 text-center text-xs text-white/40 hover:text-white/70">
        ← Back to Clubs
      </Link>
    </div>
  );
}

export default function JoinClubPage() {
  return (
    <Suspense fallback={<div className="p-10 text-center text-white/50">Loading…</div>}>
      <JoinInner />
    </Suspense>
  );
}
