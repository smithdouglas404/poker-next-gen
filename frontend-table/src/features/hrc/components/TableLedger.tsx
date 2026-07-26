import { useState, useEffect } from "react";
import { TrendingUp, TrendingDown, ArrowRight, CheckCircle, DollarSign, Users, Hash, Loader2, ExternalLink, ShieldCheck } from "lucide-react";

interface LedgerSession {
  id: string;
  userId: string;
  displayName: string;
  buyInTotal: number;
  cashOutTotal: number;
  netResult: number;
  handsPlayed: number;
  startedAt: string;
  endedAt: string | null;
  settled: boolean;
}

interface Settlement {
  from: string;
  fromName: string;
  to: string;
  toName: string;
  amount: number;
}

interface LedgerSummary {
  results: Array<{ userId: string; displayName: string; buyIn: number; cashOut: number; net: number }>;
  settlements: Settlement[];
  totalPot: number;
  totalRake: number;
  playerCount: number;
  handsPlayed: number;
}

function formatChips(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

/**
 * In-game ledger panel — shows live session P&L for all players at the table.
 * Visible to all players. Settlement section only for table creator/club owner.
 */
export function TableLedger({ tableId, isOwner }: { tableId: string; isOwner: boolean }) {
  const [sessions, setSessions] = useState<LedgerSession[]>([]);
  const [summary, setSummary] = useState<LedgerSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [settling, setSettling] = useState(false);
  const [settled, setSettled] = useState(false);
  const [settlementProof, setSettlementProof] = useState<{ settlementHash?: string; settlementTxHash?: string; explorerUrl?: string } | null>(null);

  const fetchLedger = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/tables/${tableId}/ledger`);
      if (res.ok) {
        const data = await res.json();
        setSessions(data.sessions || []);
        setSummary(data.summary || null);
      }
    } catch {} finally { setLoading(false); }
  };

  useEffect(() => { fetchLedger(); }, [tableId]);

  const handleSettle = async () => {
    setSettling(true);
    try {
      const res = await fetch(`/api/tables/${tableId}/ledger/settle`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
      if (res.ok) {
        const data = await res.json();
        setSettled(true);
        setSettlementProof({ settlementHash: data.settlementHash, settlementTxHash: data.settlementTxHash, explorerUrl: data.explorerUrl });
        fetchLedger();
      }
    } catch {} finally { setSettling(false); }
  };

  if (loading) {
    return <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-3 text-xs">
      <h3 className="text-[10px] font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
        <DollarSign className="w-3.5 h-3.5" /> Session Ledger
      </h3>

      {/* Player Results */}
      {summary && summary.results.length > 0 ? (
        <div className="space-y-1.5">
          {summary.results.map((r, i) => (
            <div key={r.userId} className="flex items-center justify-between px-2.5 py-2 rounded-lg" style={{ background: "rgba(15,15,20,0.6)" }}>
              <div className="flex items-center gap-2">
                <span className="text-gray-500 font-mono text-[10px] w-4">{i + 1}</span>
                <span className="text-white font-bold text-[11px]">{r.displayName}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-gray-500 text-[10px]">In: {formatChips(r.buyIn)}</span>
                <span className="text-gray-500 text-[10px]">Out: {formatChips(r.cashOut)}</span>
                <span className={`font-bold text-[11px] flex items-center gap-0.5 ${r.net >= 0 ? "text-green-400" : "text-red-400"}`}>
                  {r.net >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                  {r.net >= 0 ? "+" : ""}{formatChips(r.net)}
                </span>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-gray-600 text-center py-4">No completed sessions yet</p>
      )}

      {/* Stats */}
      {summary && summary.results.length > 0 && (
        <div className="flex items-center gap-4 px-2 text-[10px] text-gray-500">
          <span className="flex items-center gap-1"><Users className="w-3 h-3" /> {summary.playerCount} players</span>
          <span className="flex items-center gap-1"><Hash className="w-3 h-3" /> {summary.handsPlayed} hands</span>
          {summary.totalRake > 0 && <span>Rake: {formatChips(summary.totalRake)}</span>}
        </div>
      )}

      {/* Settlements — Who Owes Who */}
      {summary && summary.settlements.length > 0 && (
        <div className="rounded-lg p-3" style={{ background: "rgba(212,175,55,0.05)", border: "1px solid rgba(212,175,55,0.15)" }}>
          <h4 className="text-[10px] font-bold text-amber-400 uppercase tracking-wider mb-2">Settlement — Who Owes Who</h4>
          <div className="space-y-1.5">
            {summary.settlements.map((s, i) => (
              <div key={i} className="flex items-center gap-2 text-[11px]">
                <span className="text-red-400 font-bold truncate max-w-[80px]">{s.fromName}</span>
                <ArrowRight className="w-3 h-3 text-amber-400 shrink-0" />
                <span className="text-green-400 font-bold truncate max-w-[80px]">{s.toName}</span>
                <span className="ml-auto text-amber-400 font-bold">{formatChips(s.amount)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Settle Button (owner only) */}
      {isOwner && summary && summary.results.length > 0 && !settled && (
        <button onClick={handleSettle} disabled={settling}
          className="w-full py-2 rounded-lg bg-amber-500/10 text-amber-400 font-bold text-[11px] border border-amber-500/20 hover:bg-amber-500/20 transition-all disabled:opacity-50 flex items-center justify-center gap-1.5">
          {settling ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle className="w-3 h-3" />}
          {settling ? "Settling..." : "Mark All Sessions as Settled"}
        </button>
      )}
      {settled && (
        <div className="rounded-lg p-3 space-y-2" style={{ background: "rgba(34,197,94,0.05)", border: "1px solid rgba(34,197,94,0.15)" }}>
          <div className="text-center text-green-400 text-[10px] font-bold flex items-center justify-center gap-1">
            <CheckCircle className="w-3 h-3" /> All sessions settled
          </div>
          {settlementProof && (
            <div className="space-y-1">
              {settlementProof.settlementHash && (
                <div className="text-[9px] text-gray-500">
                  <span className="text-gray-400">Hash:</span>{" "}
                  <span className="font-mono text-purple-400">{settlementProof.settlementHash.slice(0, 20)}...</span>
                </div>
              )}
              {settlementProof.explorerUrl ? (
                <a href={settlementProof.explorerUrl} target="_blank" rel="noopener noreferrer"
                  className="flex items-center justify-center gap-1 text-[10px] text-purple-400 hover:text-purple-300 font-bold">
                  <ShieldCheck className="w-3 h-3" /> Verified on Polygon
                  <ExternalLink className="w-3 h-3" />
                </a>
              ) : (
                <div className="text-[9px] text-gray-600 text-center">Settlement hash recorded locally (blockchain not configured)</div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
