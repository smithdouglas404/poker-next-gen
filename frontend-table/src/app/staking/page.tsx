"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { stakingApi } from "@/features/staking/stakingRpc";
import type { StakingDeal } from "@/features/staking/types";
import { BTN_GOLD, GLASS_PANEL, HEADING_SM, cn } from "@/features/ui/tokens";

/* money helpers — amounts on the wire are minor units (cents) */
const money = (minor: number) =>
  `$${(minor / 100).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
const pctFromBps = (bps: number) => `${(bps / 100).toFixed(bps % 100 === 0 ? 0 : 1)}%`;

const STATUS_STYLE: Record<string, string> = {
  offered: "text-gold border-gold/40 bg-gold/[0.08]",
  active: "text-green border-green/40 bg-green/[0.08]",
  settle_proposed: "text-cyan border-cyan/40 bg-cyan/[0.08]",
  settled: "text-muted border-white/15 bg-white/[0.04]",
  cancelled: "text-neutral-500 border-white/10 bg-white/[0.02]",
  declined: "text-neutral-500 border-white/10 bg-white/[0.02]",
};
const STATUS_LABEL: Record<string, string> = {
  offered: "Open offer",
  active: "Active",
  settle_proposed: "Settlement proposed",
  settled: "Settled",
  cancelled: "Cancelled",
  declined: "Declined",
};

function StatusPill({ status }: { status: string }) {
  return (
    <span
      className={cn(
        "rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
        STATUS_STYLE[status] ?? "text-muted border-white/15",
      )}
    >
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}

export default function StakingPage() {
  const [open, setOpen] = useState<StakingDeal[]>([]);
  const [mine, setMine] = useState<StakingDeal[]>([]);
  const [me, setMe] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  // create-offer form
  const [stakeUsd, setStakeUsd] = useState(50);
  const [markupPct, setMarkupPct] = useState(20);
  const [note, setNote] = useState("");

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const [openRes, mineRes] = await Promise.all([stakingApi.openList(), stakingApi.list()]);
      setOpen(openRes.deals ?? []);
      setMine(mineRes.deals ?? []);
      setMe(mineRes.me ?? openRes.me ?? "");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load the staking marketplace.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const act = useCallback(
    async (key: string, fn: () => Promise<unknown>) => {
      setBusy(key);
      setError(null);
      try {
        await fn();
        await refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "That action failed.");
      } finally {
        setBusy(null);
      }
    },
    [refresh],
  );

  const backing = useMemo(() => mine.filter((d) => d.backer === me), [mine, me]);
  const backed = useMemo(() => mine.filter((d) => d.player === me), [mine, me]);
  // Open offers I did NOT post (mine appear under "My backing").
  const openOthers = useMemo(() => open.filter((d) => d.backer !== me), [open, me]);

  const createOffer = () =>
    act("create", async () => {
      await stakingApi.offer({
        stake_minor: Math.round(stakeUsd * 100),
        markup_bps: Math.round(markupPct * 100),
        note: note.trim(),
      });
      setNote("");
    });

  return (
    <div className="min-h-screen bg-background px-4 py-8 text-foreground sm:px-8">
      <div className="mx-auto w-full max-w-5xl">
        <div className="mb-6 flex items-start justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-gold">Marketplace</p>
            <h1 className="font-display text-2xl font-bold uppercase tracking-wide">Staking &amp; Backing</h1>
            <p className="mt-1 max-w-2xl text-sm text-muted">
              Back another player&apos;s action, or get backed. The stake is escrowed the moment you
              post an offer; when the run is done, either party proposes a repayment and the other
              confirms. <span className="text-gold">Play-money only</span> — settlement is a mutual
              agreement, not tied to live table results.
            </p>
          </div>
          <Link href="/dashboard" className="shrink-0 text-sm text-neutral-400 hover:text-white">
            ← Back
          </Link>
        </div>

        {error && (
          <div className="mb-4 rounded-xl border border-gold/40 bg-gold/10 px-4 py-2 text-sm text-[#ff9ba1]">
            {error}
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
          {/* ───────────────────────── create offer */}
          <div className={cn(GLASS_PANEL, "h-fit p-5")}>
            <p className={HEADING_SM}>Post a backing offer</p>
            <p className="mt-1 text-xs text-muted">
              Your stake is escrowed from your wallet now and advanced to whoever accepts.
            </p>
            <div className="mt-4 space-y-4">
              <label className="block">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-muted">Stake</span>
                <div className="mt-1 flex items-center rounded-xl border border-white/10 bg-white/[0.02] px-3">
                  <span className="text-muted">$</span>
                  <input
                    type="number"
                    min={1}
                    value={stakeUsd}
                    onChange={(e) => setStakeUsd(Math.max(1, Number(e.target.value)))}
                    className="w-full bg-transparent px-2 py-2 text-sm outline-none"
                  />
                </div>
              </label>
              <label className="block">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-muted">
                  Markup (your profit share)
                </span>
                <div className="mt-1 flex items-center rounded-xl border border-white/10 bg-white/[0.02] px-3">
                  <input
                    type="number"
                    min={0}
                    max={200}
                    value={markupPct}
                    onChange={(e) => setMarkupPct(Math.max(0, Number(e.target.value)))}
                    className="w-full bg-transparent px-2 py-2 text-sm outline-none"
                  />
                  <span className="text-muted">%</span>
                </div>
                <span className="mt-1 block text-[10px] text-neutral-500">
                  Terms only — used when you and the player agree on a repayment.
                </span>
              </label>
              <label className="block">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-muted">Note</span>
                <input
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="e.g. $50 for the 7pm freeroll, 20% markup"
                  maxLength={160}
                  className="mt-1 w-full rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2 text-sm outline-none placeholder:text-neutral-600"
                />
              </label>
              <button
                onClick={createOffer}
                disabled={busy === "create"}
                className={cn(BTN_GOLD, "w-full rounded-xl py-2.5 text-sm disabled:opacity-50")}
              >
                {busy === "create" ? "Escrowing…" : `Escrow ${money(Math.round(stakeUsd * 100))} & post`}
              </button>
            </div>
          </div>

          {/* ───────────────────────── open offers */}
          <div className="space-y-3">
            <p className={HEADING_SM}>Open offers</p>
            {loading ? (
              <p className="text-sm text-neutral-500">Loading…</p>
            ) : openOthers.length === 0 ? (
              <div className={cn(GLASS_PANEL, "p-5 text-sm text-neutral-500")}>
                No open backing offers right now. Post one on the left.
              </div>
            ) : (
              openOthers.map((d) => (
                <div key={d.id} className={cn(GLASS_PANEL, "flex items-center justify-between gap-3 p-4")}>
                  <div className="min-w-0">
                    <p className="truncate text-sm">
                      <span className="font-semibold text-gold">{money(d.stake_minor)}</span>{" "}
                      <span className="text-muted">from</span>{" "}
                      <span className="font-medium">{d.backer_name || "a backer"}</span>{" "}
                      <span className="text-neutral-500">· {pctFromBps(d.markup_bps)} markup</span>
                    </p>
                    {d.note && <p className="mt-0.5 truncate text-xs text-neutral-500">{d.note}</p>}
                  </div>
                  <button
                    onClick={() => act(d.id, () => stakingApi.accept(d.id))}
                    disabled={busy === d.id}
                    className={cn(BTN_GOLD, "shrink-0 rounded-lg px-3 py-1.5 text-xs disabled:opacity-50")}
                  >
                    Accept
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        {/* ───────────────────────── my deals */}
        <div className="mt-8 grid gap-6 lg:grid-cols-2">
          <DealColumn
            title="My backing"
            empty="You haven't backed anyone yet."
            deals={backing}
            me={me}
            busy={busy}
            act={act}
            role="backer"
          />
          <DealColumn
            title="I'm backed"
            empty="Nobody is backing you yet — accept an open offer above."
            deals={backed}
            me={me}
            busy={busy}
            act={act}
            role="player"
          />
        </div>
      </div>
    </div>
  );
}

/* A player's book on one side of the deal (backer or player). Renders exactly the
   controls that side is allowed to drive — no dead buttons. */
function DealColumn({
  title,
  empty,
  deals,
  me,
  busy,
  act,
  role,
}: {
  title: string;
  empty: string;
  deals: StakingDeal[];
  me: string;
  busy: string | null;
  act: (key: string, fn: () => Promise<unknown>) => Promise<void>;
  role: "backer" | "player";
}) {
  return (
    <div className="space-y-3">
      <p className={HEADING_SM}>{title}</p>
      {deals.length === 0 ? (
        <div className={cn(GLASS_PANEL, "p-5 text-sm text-neutral-500")}>{empty}</div>
      ) : (
        deals.map((d) => <DealCard key={d.id} d={d} me={me} busy={busy} act={act} role={role} />)
      )}
    </div>
  );
}

function DealCard({
  d,
  me,
  busy,
  act,
  role,
}: {
  d: StakingDeal;
  me: string;
  busy: string | null;
  act: (key: string, fn: () => Promise<unknown>) => Promise<void>;
  role: "backer" | "player";
}) {
  const counterparty = role === "backer" ? d.player_name || "—" : d.backer_name || "—";
  const [repayUsd, setRepayUsd] = useState<number>(Math.round(d.stake_minor / 100));
  const disabled = busy === d.id;
  const iProposed = d.settle_proposed_by === me;

  return (
    <div className={cn(GLASS_PANEL, "p-4")}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm">
          <span className="font-semibold text-gold">{money(d.stake_minor)}</span>{" "}
          <span className="text-neutral-500">· {pctFromBps(d.markup_bps)}</span>
          {d.status !== "offered" && (
            <span className="text-muted">
              {" "}
              · {role === "backer" ? "backing" : "from"} {counterparty}
            </span>
          )}
        </p>
        <StatusPill status={d.status} />
      </div>
      {d.note && <p className="mt-1 text-xs text-neutral-500">{d.note}</p>}

      {/* offered: backer can cancel; a viewing player could decline (players see
          others' offers in the Open list, so decline lives there — here we only
          expose the backer's cancel on their own offer). */}
      {d.status === "offered" && role === "backer" && (
        <button
          onClick={() => act(d.id, () => stakingApi.cancel(d.id))}
          disabled={disabled}
          className="mt-3 rounded-lg border border-white/15 px-3 py-1.5 text-xs text-muted hover:border-white/30 hover:text-white disabled:opacity-50"
        >
          Cancel &amp; refund
        </button>
      )}

      {/* active: either party can propose a repayment amount. */}
      {d.status === "active" && (
        <div className="mt-3 flex items-center gap-2">
          <div className="flex items-center rounded-lg border border-white/10 bg-white/[0.02] px-2">
            <span className="text-xs text-muted">$</span>
            <input
              type="number"
              min={0}
              value={repayUsd}
              onChange={(e) => setRepayUsd(Math.max(0, Number(e.target.value)))}
              className="w-20 bg-transparent px-1 py-1.5 text-sm outline-none"
            />
          </div>
          <button
            onClick={() => act(d.id, () => stakingApi.proposeSettle(d.id, Math.round(repayUsd * 100)))}
            disabled={disabled}
            className={cn(BTN_GOLD, "rounded-lg px-3 py-1.5 text-xs disabled:opacity-50")}
          >
            Propose repay
          </button>
        </div>
      )}

      {/* settle_proposed: the proposer waits; the other party confirms or rejects. */}
      {d.status === "settle_proposed" && (
        <div className="mt-3">
          <p className="text-xs text-muted">
            Repay proposed: <span className="font-semibold text-foreground">{money(d.repay_minor)}</span>{" "}
            {iProposed ? "· waiting for the other party" : "· to the backer"}
          </p>
          {!iProposed ? (
            <div className="mt-2 flex gap-2">
              <button
                onClick={() => act(d.id, () => stakingApi.confirmSettle(d.id))}
                disabled={disabled}
                className={cn(BTN_GOLD, "rounded-lg px-3 py-1.5 text-xs disabled:opacity-50")}
              >
                Confirm &amp; settle
              </button>
              <button
                onClick={() => act(d.id, () => stakingApi.rejectSettle(d.id))}
                disabled={disabled}
                className="rounded-lg border border-white/15 px-3 py-1.5 text-xs text-muted hover:border-white/30 hover:text-white disabled:opacity-50"
              >
                Reject
              </button>
            </div>
          ) : (
            <button
              onClick={() => act(d.id, () => stakingApi.rejectSettle(d.id))}
              disabled={disabled}
              className="mt-2 rounded-lg border border-white/15 px-3 py-1.5 text-xs text-muted hover:border-white/30 hover:text-white disabled:opacity-50"
            >
              Withdraw proposal
            </button>
          )}
        </div>
      )}

      {d.status === "settled" && (
        <p className="mt-2 text-xs text-muted">
          Repaid <span className="font-semibold text-foreground">{money(d.repay_minor)}</span> to the backer.
        </p>
      )}
    </div>
  );
}
