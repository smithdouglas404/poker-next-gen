import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { X, TrendingUp, TrendingDown, Gamepad2, Trophy, DollarSign, Target, BarChart2, Loader2 } from "lucide-react";

interface PlayerGameReportProps {
  tableId: string;
  playerId: string;
  playerName: string;
  onClose: () => void;
}

function formatChips(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

export function PlayerGameReport({ tableId, playerId, playerName, onClose }: PlayerGameReportProps) {
  const [stats, setStats] = useState<any>(null);
  const [hands, setHands] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch(`/api/player-stats/${playerId}`).then(r => r.ok ? r.json() : null).catch(() => null),
      fetch(`/api/tables/${tableId}/hands?limit=10`).then(r => r.ok ? r.json() : []).catch(() => []),
    ]).then(([s, h]) => {
      setStats(s);
      setHands(h);
    }).finally(() => setLoading(false));
  }, [tableId, playerId]);

  if (loading) {
    return (
      <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
        <div className="flex items-center gap-3 p-8"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
      </motion.div>
    );
  }

  const netProfit = stats?.totalWinnings || 0;
  const handsPlayed = stats?.handsPlayed || 0;
  const potsWon = stats?.potsWon || 0;
  const winRate = handsPlayed > 0 ? Math.round((potsWon / handsPlayed) * 100) : 0;
  const vpip = stats?.vpip || 0;
  const pfr = stats?.pfr || 0;
  const biggestPot = stats?.biggestPotWon || 0;

  return (
    <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl overflow-hidden" style={{ background: "rgba(10,14,22,0.95)", border: "1px solid rgba(212,175,55,0.2)" }}
        onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="px-6 py-4 flex items-center justify-between" style={{ background: "linear-gradient(135deg, rgba(212,175,55,0.1), rgba(168,85,247,0.05))" }}>
          <div>
            <h2 className="text-lg font-display font-black text-white">Player Game Report</h2>
            <p className="text-xs text-gray-400">{playerName}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/10"><X className="w-4 h-4 text-gray-400" /></button>
        </div>

        {/* Stats Grid */}
        <div className="px-6 py-4 grid grid-cols-3 gap-3">
          <div className="rounded-xl p-3 text-center" style={{ background: "rgba(255,255,255,0.03)" }}>
            <div className={`text-xl font-black ${netProfit >= 0 ? "text-green-400" : "text-red-400"}`}>
              {netProfit >= 0 ? "+" : ""}{formatChips(netProfit)}
            </div>
            <div className="text-[10px] text-gray-500 uppercase mt-1 flex items-center justify-center gap-1">
              {netProfit >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />} Net Profit
            </div>
          </div>
          <div className="rounded-xl p-3 text-center" style={{ background: "rgba(255,255,255,0.03)" }}>
            <div className="text-xl font-black text-cyan-400">{potsWon} / {handsPlayed}</div>
            <div className="text-[10px] text-gray-500 uppercase mt-1 flex items-center justify-center gap-1">
              <Target className="w-3 h-3" /> Win Rate: {winRate}%
            </div>
          </div>
          <div className="rounded-xl p-3 text-center" style={{ background: "rgba(255,255,255,0.03)" }}>
            <div className="text-xl font-black text-amber-400">{formatChips(biggestPot)}</div>
            <div className="text-[10px] text-gray-500 uppercase mt-1 flex items-center justify-center gap-1">
              <Trophy className="w-3 h-3" /> Biggest Pot
            </div>
          </div>
        </div>

        {/* Play Style */}
        <div className="px-6 pb-3">
          <div className="flex items-center gap-4 text-xs">
            <div className="flex-1 rounded-lg p-2" style={{ background: "rgba(255,255,255,0.03)" }}>
              <div className="flex justify-between mb-1"><span className="text-gray-500">VPIP</span><span className="text-primary font-bold">{vpip}%</span></div>
              <div className="w-full h-1.5 rounded-full bg-white/5"><div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(vpip, 100)}%` }} /></div>
            </div>
            <div className="flex-1 rounded-lg p-2" style={{ background: "rgba(255,255,255,0.03)" }}>
              <div className="flex justify-between mb-1"><span className="text-gray-500">PFR</span><span className="text-purple-400 font-bold">{pfr}%</span></div>
              <div className="w-full h-1.5 rounded-full bg-white/5"><div className="h-full rounded-full bg-purple-400" style={{ width: `${Math.min(pfr, 100)}%` }} /></div>
            </div>
          </div>
        </div>

        {/* Recent Hand History */}
        <div className="px-6 pb-4">
          <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-1">
            <Gamepad2 className="w-3 h-3" /> Recent Hands at This Table
          </h3>
          <div className="space-y-1 max-h-40 overflow-y-auto">
            {hands.length > 0 ? hands.slice(0, 8).map((h: any, i: number) => (
              <div key={h.id || i} className="flex items-center justify-between px-2 py-1.5 rounded text-xs" style={{ background: "rgba(255,255,255,0.02)" }}>
                <span className="text-gray-400">Hand #{h.handNumber}</span>
                <span className="text-amber-400 font-bold">{formatChips(h.potTotal || 0)} pot</span>
                <span className="text-gray-600">{h.createdAt ? new Date(h.createdAt).toLocaleTimeString() : ""}</span>
              </div>
            )) : <p className="text-gray-600 text-[10px] text-center py-3">No hands recorded yet</p>}
          </div>
        </div>

        {/* Return Button */}
        <div className="px-6 pb-5">
          <button onClick={onClose}
            className="w-full py-2.5 rounded-lg font-bold text-sm text-amber-400 border border-amber-500/30 hover:bg-amber-500/10 transition-all"
            style={{ background: "rgba(212,175,55,0.05)" }}>
            Return to Table
          </button>
        </div>
      </div>
    </motion.div>
  );
}
