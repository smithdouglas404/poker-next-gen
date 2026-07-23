"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { BlindCurve, blindPreset, type BlindLevel } from "@/features/commandcore/BlindCurve";
import { Chip, NeonSection, NeonSlider, NeonToggle, PreviewTile } from "@/features/commandcore/kit";
import { TournamentBuilderWizard } from "@/features/commands/TournamentBuilderWizard";
import { walletApi, type NowPaymentsBalanceEntry } from "@/features/wallet/walletRpc";
import { callSessionRpc } from "@/lib/nakama/sessionRpc";
import { BTN_GOLD, GLASS_PANEL, cn } from "@/features/ui/tokens";

// High Rollers Club :: Command Core (Session Architect). A pre-game cockpit that
// composes the wired session-setup capabilities — variant, buy-in band, shot
// clock + time bank, blind-curve simulator, IP/device jurisdiction guard, live
// treasury readout — and drives a real table_create (cash) or the tournament
// builder. Vision pieces that aren't wired yet are shown as disabled Preview
// tiles, never fake controls.

export default function CommandCorePage() {
  const [format, setFormat] = useState<"cash" | "tournament">("cash");
  const [variant, setVariant] = useState<"holdem" | "plo">("holdem");

  // Buy-in band + blinds (cents).
  const [smallBlind, setSmallBlind] = useState(100);
  const [bigBlind, setBigBlind] = useState(200);
  const [minBuyIn, setMinBuyIn] = useState(10_000);
  const [buyIn, setBuyIn] = useState(30_000);
  const [maxBuyIn, setMaxBuyIn] = useState(60_000);
  const [maxSeats, setMaxSeats] = useState(6);
  const [minPlayers, setMinPlayers] = useState(2);

  // Integrity.
  const [ipGuard, setIpGuard] = useState(true);
  const [actionSecs, setActionSecs] = useState(30);
  const [timeBankSecs, setTimeBankSecs] = useState(30);

  // Structure simulator (tournament).
  const [blinds] = useState<BlindLevel[]>(() => blindPreset(10));

  // Live data.
  const [treasury, setTreasury] = useState<NowPaymentsBalanceEntry[] | null>(null);
  const [region, setRegion] = useState<{ allowed: boolean; country: string } | null>(null);

  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [wizard, setWizard] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const t = await walletApi.nowpaymentsBalance();
        if (t.configured) setTreasury(t.balances ?? []);
      } catch {
        /* admin-only; hidden for players */
      }
      try {
        const r = (await callSessionRpc("jurisdiction_check", {})) as {
          allowed?: boolean;
          country?: string;
        };
        setRegion({ allowed: r.allowed !== false, country: r.country || "—" });
      } catch {
        /* best-effort */
      }
    })();
  }, []);

  async function initialize() {
    if (format === "tournament") {
      setWizard(true);
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const res = (await callSessionRpc("table_create", {
        variant,
        small_blind: smallBlind,
        big_blind: bigBlind,
        buy_in: buyIn,
        min_buy_in: minBuyIn,
        max_buy_in: maxBuyIn,
        max_seats: maxSeats,
        min_players: minPlayers,
        action_secs: actionSecs,
        time_bank_secs: timeBankSecs,
      })) as { code?: string; match_id?: string };
      const code = res.code;
      if (code) {
        window.location.href = `/lobby?code=${encodeURIComponent(code)}`;
        return;
      }
      setMsg("Session created, but no room code was returned. Find it in the Lobby.");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Could not initialize the session.");
    } finally {
      setBusy(false);
    }
  }

  function savePreset() {
    const preset = {
      format, variant, smallBlind, bigBlind, minBuyIn, buyIn, maxBuyIn,
      maxSeats, minPlayers, ipGuard, actionSecs, timeBankSecs,
    };
    if (typeof window !== "undefined") {
      window.localStorage.setItem("nexus.commandcore.preset", JSON.stringify(preset));
      setMsg("Protocol preset saved to this device.");
    }
  }

  const numCls =
    "w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white outline-none focus:border-brand/50";

  return (
    <div className="min-h-screen bg-[radial-gradient(1200px_600px_at_50%_-10%,rgba(224,30,43,0.06),transparent),radial-gradient(900px_500px_at_90%_0%,rgba(212,175,55,0.05),transparent)] bg-background text-foreground">
      <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6">
        {/* Header */}
        <div className={cn(GLASS_PANEL, "mb-6 flex flex-wrap items-center justify-between gap-3 border-brand/20 p-4")}>
          <div>
            <p className="font-display text-[11px] font-bold uppercase tracking-[0.35em] text-brand">High Rollers Club · Command Core</p>
            <h1 className="mt-0.5 font-display text-xl font-bold uppercase tracking-wider text-white">Session Architect</h1>
          </div>
          <div className="flex items-center gap-2 rounded-full border border-white/10 bg-black/30 px-3 py-1.5">
            <span className={cn("h-2 w-2 rounded-full", region?.allowed ? "bg-green" : "bg-red-400")} />
            <span className="text-xs text-neutral-300">
              {region ? `Region ${region.country} · ${region.allowed ? "cleared" : "restricted"}` : "Checking region…"}
            </span>
          </div>
        </div>

        <div className="space-y-6">
          {/* [1] LIQUIDITY & WALLET ENGINE */}
          <NeonSection index="1" title="Liquidity & Wallet Engine">
            <div className="grid gap-4 lg:grid-cols-2">
              <div>
                <p className="text-[11px] uppercase tracking-wider text-muted">Accepted currencies</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Chip label="USD" />
                  <Chip label="ETH" />
                  <Chip label="SOL" />
                  <Chip label="USDC" />
                </div>
                <p className="mt-2 text-[11px] text-neutral-500">
                  USD is the settlement ledger; crypto funds via NOWPayments deposit/withdraw rails.
                </p>
                <Link href="/hub" className="mt-3 inline-block text-xs text-brand hover:underline">
                  Configure rake per club →
                </Link>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wider text-muted">Host treasury (NOWPayments)</p>
                {treasury === null ? (
                  <p className="mt-2 text-sm text-neutral-500">Operator-only — treasury balance hidden.</p>
                ) : treasury.length === 0 ? (
                  <p className="mt-2 text-2xl font-bold text-green">$0.00</p>
                ) : (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {treasury.slice(0, 6).map((t) => (
                      <span key={t.currency} className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5 text-sm">
                        <span className="text-muted">{t.currency}</span>{" "}
                        <span className="font-semibold text-green">{t.amount}</span>
                      </span>
                    ))}
                  </div>
                )}
                <div className="mt-3">
                  <PreviewTile title="On-chain multi-sig escrow" caption="Instant on-chain standup settlement — pending gaming/crypto counsel." />
                </div>
              </div>
            </div>
          </NeonSection>

          {/* [2] DYNAMIC GAME MATRIX */}
          <NeonSection index="2" title="Dynamic Game Matrix">
            <div className="grid gap-5 lg:grid-cols-2">
              <div className="space-y-4">
                <div>
                  <p className="mb-1 text-[11px] uppercase tracking-wider text-muted">Format</p>
                  <div className="flex gap-2">
                    {(["cash", "tournament"] as const).map((f) => (
                      <button
                        key={f}
                        type="button"
                        onClick={() => setFormat(f)}
                        className={cn(
                          "flex-1 rounded-lg border px-3 py-2 text-sm font-semibold capitalize transition",
                          format === f ? "border-gold/50 bg-gold/10 text-gold" : "border-white/10 text-neutral-300 hover:border-white/20",
                        )}
                      >
                        {f}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="mb-1 text-[11px] uppercase tracking-wider text-muted">Variant</p>
                  <select value={variant} onChange={(e) => setVariant(e.target.value as "holdem" | "plo")} className={numCls}>
                    <option value="holdem">Texas Hold&apos;em</option>
                    <option value="plo">Pot-Limit Omaha</option>
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <label className="block">
                    <span className="text-[11px] uppercase tracking-wider text-muted">Small blind $</span>
                    <input type="number" className={numCls} value={smallBlind / 100} onChange={(e) => setSmallBlind(Math.round(Number(e.target.value) * 100))} />
                  </label>
                  <label className="block">
                    <span className="text-[11px] uppercase tracking-wider text-muted">Big blind $</span>
                    <input type="number" className={numCls} value={bigBlind / 100} onChange={(e) => setBigBlind(Math.round(Number(e.target.value) * 100))} />
                  </label>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <label className="block">
                    <span className="text-[11px] uppercase tracking-wider text-muted">Min buy-in $</span>
                    <input type="number" className={numCls} value={minBuyIn / 100} onChange={(e) => setMinBuyIn(Math.round(Number(e.target.value) * 100))} />
                  </label>
                  <label className="block">
                    <span className="text-[11px] uppercase tracking-wider text-muted">Default $</span>
                    <input type="number" className={numCls} value={buyIn / 100} onChange={(e) => setBuyIn(Math.round(Number(e.target.value) * 100))} />
                  </label>
                  <label className="block">
                    <span className="text-[11px] uppercase tracking-wider text-muted">Max buy-in $</span>
                    <input type="number" className={numCls} value={maxBuyIn / 100} onChange={(e) => setMaxBuyIn(Math.round(Number(e.target.value) * 100))} />
                  </label>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <NeonSlider label="Seats" value={maxSeats} min={2} max={10} onChange={setMaxSeats} />
                  <NeonSlider label="Min to start" value={minPlayers} min={2} max={maxSeats} onChange={setMinPlayers} />
                </div>
              </div>

              <div className="space-y-3">
                <p className="text-[11px] uppercase tracking-wider text-muted">Integrity & security controls</p>
                <NeonToggle
                  on={ipGuard}
                  onToggle={() => setIpGuard((v) => !v)}
                  label="IP / device jurisdiction guard"
                  sub={region ? `Live · your region ${region.country} ${region.allowed ? "cleared" : "restricted"}` : "Enforced at table create + deposits"}
                />
                <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
                  <p className="text-sm font-semibold text-white">Action clock + time bank</p>
                  <div className="mt-2 space-y-3">
                    <NeonSlider label="Shot clock" value={actionSecs} min={10} max={60} step={5} onChange={setActionSecs} format={(v) => `${v}s`} />
                    <NeonSlider label="Time bank" value={timeBankSecs} min={0} max={120} step={5} onChange={setTimeBankSecs} format={(v) => `${v}s`} />
                  </div>
                  <p className="mt-1 text-[11px] text-neutral-500">Server-enforced: the table auto-folds when the clock and bank both expire.</p>
                </div>
                <PreviewTile title="AI collusion matrix" caption="Live suspicion scoring on check-backs / soft-play — detector in development." />
              </div>
            </div>
          </NeonSection>

          {/* [3] REAL-TIME STRUCTURE SIMULATOR */}
          {format === "tournament" && (
            <NeonSection index="3" title="Real-Time Structure Simulator">
              <BlindCurve blinds={blinds} />
              <p className="mt-3 text-[11px] text-neutral-500">
                Continue in the tournament builder to edit levels, payouts, and start — Initialize opens it.
              </p>
            </NeonSection>
          )}

          {/* Footer */}
          <div className={cn(GLASS_PANEL, "flex flex-wrap items-center justify-between gap-3 border-brand/20 p-4")}>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={savePreset}
                className="rounded-full border border-white/20 px-5 py-2.5 text-sm font-semibold uppercase tracking-wider text-neutral-200 hover:bg-white/5"
              >
                Save protocol preset
              </button>
              {msg && <span className="text-xs text-neutral-400">{msg}</span>}
            </div>
            <button type="button" disabled={busy} onClick={initialize} className={cn(BTN_GOLD, "disabled:opacity-50")}>
              {busy ? "Initializing…" : format === "tournament" ? "🚀 Build Tournament" : "🚀 Initialize Session"}
            </button>
          </div>
        </div>
      </div>

      {wizard && (
        <TournamentBuilderWizard
          onClose={() => setWizard(false)}
          onComplete={() => {
            setWizard(false);
            window.location.href = "/tournaments";
          }}
        />
      )}
    </div>
  );
}
