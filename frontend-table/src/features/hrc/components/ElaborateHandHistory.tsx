import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, DollarSign, Trophy, ChevronDown, ChevronRight, Play, Loader2, Hash, ExternalLink } from "lucide-react";

interface HandHistoryProps {
  tableId: string;
  onClose: () => void;
}

function formatChips(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

export function ElaborateHandHistory({ tableId, onClose }: HandHistoryProps) {
  const [hands, setHands] = useState<any[]>([]);
  const [players, setPlayers] = useState<Map<string, any[]>>(new Map());
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [summary, setSummary] = useState<{ totalPot: number; totalRake: number; handsCount: number }>({ totalPot: 0, totalRake: 0, handsCount: 0 });
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const PAGE_SIZE = 30;

  const fetchHands = (currentOffset: number, append: boolean) => {
    const setLoadingFn = append ? setLoadingMore : setLoading;
    setLoadingFn(true);
    fetch(`/api/tables/${tableId}/hands?limit=${PAGE_SIZE}&offset=${currentOffset}`).then(r => r.ok ? r.json() : [])
      .then((data: any[]) => {
        const newHands = append ? [...hands, ...data] : data;
        setHands(newHands);
        const totalPot = newHands.reduce((s: number, h: any) => s + (h.potTotal || 0), 0);
        const totalRake = newHands.reduce((s: number, h: any) => s + (h.totalRake || 0), 0);
        setSummary({ totalPot, totalRake, handsCount: newHands.length });
        setHasMore(data.length >= PAGE_SIZE);
      })
      .catch(() => {})
      .finally(() => setLoadingFn(false));
  };

  useEffect(() => {
    fetchHands(0, false);
  }, [tableId]);

  const handleLoadMore = () => {
    const newOffset = offset + PAGE_SIZE;
    setOffset(newOffset);
    fetchHands(newOffset, true);
  };

  const loadHandPlayers = async (handId: string) => {
    if (players.has(handId)) return;
    try {
      const res = await fetch(`/api/hands/${handId}/players`);
      if (res.ok) {
        const data = await res.json();
        setPlayers(prev => new Map(prev).set(handId, data));
      }
    } catch {}
  };

  const toggleExpand = (handId: string) => {
    if (expanded === handId) { setExpanded(null); return; }
    setExpanded(handId);
    loadHandPlayers(handId);
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <motion.div initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }}
        className="w-full max-w-2xl max-h-[80vh] rounded-2xl overflow-hidden flex flex-col"
        style={{ background: "rgba(10,14,22,0.95)", border: "1px solid rgba(212,175,55,0.2)" }}
        onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="px-6 py-4 flex items-center justify-between shrink-0" style={{ background: "linear-gradient(135deg, rgba(212,175,55,0.1), rgba(168,85,247,0.05))" }}>
          <div>
            <h2 className="text-lg font-display font-black text-white">Hand History Log</h2>
            <p className="text-xs text-gray-400">Complete hand-by-hand replay</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/10"><X className="w-4 h-4 text-gray-400" /></button>
        </div>

        {/* Financial Summary */}
        <div className="px-6 py-3 grid grid-cols-3 gap-3 shrink-0 border-b border-white/5">
          <div className="text-center">
            <div className="text-sm font-black text-amber-400">{formatChips(summary.totalPot)}</div>
            <div className="text-[10px] text-gray-500">Total Chips in Play</div>
          </div>
          <div className="text-center">
            <div className="text-sm font-black text-purple-400">{formatChips(summary.totalRake)}</div>
            <div className="text-[10px] text-gray-500">Total Rake Collected</div>
          </div>
          <div className="text-center">
            <div className="text-sm font-black text-cyan-400">{summary.handsCount}</div>
            <div className="text-[10px] text-gray-500">Hands Played</div>
          </div>
        </div>

        {/* Hand List */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
          ) : hands.length === 0 ? (
            <p className="text-gray-500 text-sm text-center py-12">No hands recorded at this table</p>
          ) : (
            <div className="divide-y divide-white/5">
              {hands.map((hand: any) => (
                <div key={hand.id}>
                  <button onClick={() => toggleExpand(hand.id)} className="w-full flex items-center gap-3 px-6 py-3 hover:bg-white/[0.02] text-left">
                    {expanded === hand.id ? <ChevronDown className="w-3.5 h-3.5 text-gray-500 shrink-0" /> : <ChevronRight className="w-3.5 h-3.5 text-gray-500 shrink-0" />}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-white">Hand #{hand.handNumber}</span>
                        {hand.commitmentHash && <Hash className="w-3 h-3 text-purple-400" />}
                        {hand.onChainCommitTx && (
                          <span className="px-1 py-0.5 rounded text-[8px] font-bold bg-green-500/10 text-green-400">VERIFIED</span>
                        )}
                      </div>
                      <div className="text-[10px] text-gray-600">{hand.createdAt ? new Date(hand.createdAt).toLocaleString() : ""}</div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-sm font-bold text-amber-400">{formatChips(hand.potTotal || 0)}</div>
                      {hand.totalRake > 0 && <div className="text-[10px] text-gray-500">rake: {formatChips(hand.totalRake)}</div>}
                    </div>
                  </button>

                  <AnimatePresence>
                    {expanded === hand.id && (
                      <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                        <div className="px-6 pb-4 ml-6 space-y-2">
                          {/* Community cards */}
                          {hand.communityCards && (hand.communityCards as any[]).length > 0 && (
                            <div className="flex items-center gap-1.5">
                              <span className="text-[10px] text-gray-500 w-16">Board:</span>
                              {(hand.communityCards as any[]).map((c: any, i: number) => (
                                <span key={i} className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold" style={{ background: "rgba(255,255,255,0.05)", color: c.suit === "hearts" || c.suit === "diamonds" ? "#ef4444" : "#e8eaed" }}>
                                  {c.rank}{c.suit === "hearts" ? "♥" : c.suit === "diamonds" ? "♦" : c.suit === "clubs" ? "♣" : "♠"}
                                </span>
                              ))}
                            </div>
                          )}

                          {/* Player results */}
                          {players.get(hand.id) ? (
                            <div className="space-y-1">
                              {players.get(hand.id)!.map((p: any, i: number) => (
                                <div key={p.userId || i} className="flex items-center justify-between px-2 py-1.5 rounded text-xs" style={{ background: "rgba(255,255,255,0.02)" }}>
                                  <div className="flex items-center gap-2">
                                    {p.isWinner && <Trophy className="w-3 h-3 text-amber-400" />}
                                    <span className={`font-bold ${p.isWinner ? "text-amber-400" : "text-gray-300"}`}>{p.userId?.slice(0, 8) || "Player"}</span>
                                    <span className="text-gray-600">Seat {p.seatIndex}</span>
                                  </div>
                                  <div className="flex items-center gap-3">
                                    {p.holeCards && (p.holeCards as any[]).length > 0 && (
                                      <div className="flex gap-0.5">
                                        {(p.holeCards as any[]).map((c: any, ci: number) => (
                                          <span key={ci} className="px-1 py-0.5 rounded text-[9px] font-mono font-bold" style={{ background: "rgba(255,255,255,0.05)", color: c.suit === "hearts" || c.suit === "diamonds" ? "#ef4444" : "#e8eaed" }}>
                                            {c.rank}{c.suit === "hearts" ? "♥" : c.suit === "diamonds" ? "♦" : c.suit === "clubs" ? "♣" : "♠"}
                                          </span>
                                        ))}
                                      </div>
                                    )}
                                    <span className={`font-bold ${(p.netResult || 0) >= 0 ? "text-green-400" : "text-red-400"}`}>
                                      {(p.netResult || 0) >= 0 ? "+" : ""}{formatChips(p.netResult || 0)}
                                    </span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="flex justify-center py-2"><Loader2 className="w-4 h-4 animate-spin text-gray-500" /></div>
                          )}

                          {/* Replay link */}
                          <div className="flex items-center gap-2 pt-1">
                            <a href={`/hands/${hand.id}`} className="flex items-center gap-1 text-[10px] text-primary hover:text-primary/80 font-bold">
                              <Play className="w-3 h-3" /> Full Replay
                            </a>
                            {hand.onChainCommitTx && (
                              <a href={`https://amoy.polygonscan.com/tx/${hand.onChainCommitTx}`} target="_blank" rel="noopener noreferrer"
                                className="flex items-center gap-1 text-[10px] text-purple-400 hover:text-purple-300 font-bold">
                                <ExternalLink className="w-3 h-3" /> Chain Proof
                              </a>
                            )}
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              ))}
            </div>
          )}
          {hasMore && (
            <div className="flex justify-center py-4 border-t border-white/5">
              <button
                onClick={handleLoadMore}
                disabled={loadingMore}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary/10 border border-primary/30 text-primary text-xs font-bold hover:bg-primary/20 transition-colors disabled:opacity-50"
              >
                {loadingMore ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                {loadingMore ? "Loading..." : "Load More"}
              </button>
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}
