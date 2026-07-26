import { useState } from "react";
import { motion } from "framer-motion";
import {
  ShieldCheck, CheckCircle, Copy, Eye, EyeOff,
  Download, Server, Smartphone, Link2, X,
  Clock, Loader2, AlertTriangle, ChevronDown, ChevronUp,
  Users, ExternalLink, Blocks,
} from "lucide-react";
import type { VerificationStatus, PlayerSeedStatus } from "@/lib/multiplayer-engine";

/** Escape a string for safe interpolation into HTML */
function escapeHtml(str: string | number | null | undefined): string {
  if (str == null) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

interface ProvablyFairPanelProps {
  onClose?: () => void;
  commitmentHash?: string | null;
  shuffleProof?: any | null;
  verificationStatus?: VerificationStatus;
  playerSeedStatus?: PlayerSeedStatus;
  onChainCommitTx?: string | null;
  onChainRevealTx?: string | null;
}

const STATUS_CONFIG = {
  pending: { color: "yellow", label: "Pending", icon: Clock, glow: "rgba(234,179,8,0.3)" },
  verifying: { color: "blue", label: "Verifying", icon: Loader2, glow: "rgba(59,130,246,0.3)" },
  verified: { color: "green", label: "Verified", icon: ShieldCheck, glow: "rgba(34,197,94,0.3)" },
  failed: { color: "red", label: "Failed", icon: AlertTriangle, glow: "rgba(239,68,68,0.3)" },
} as const;

export function ProvablyFairPanel({
  onClose,
  commitmentHash,
  shuffleProof,
  verificationStatus,
  playerSeedStatus,
  onChainCommitTx,
  onChainRevealTx,
}: ProvablyFairPanelProps) {
  const [seedRevealed, setSeedRevealed] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [showDeckOrder, setShowDeckOrder] = useState(false);
  const [showPlayerSeeds, setShowPlayerSeeds] = useState(false);

  const status = verificationStatus && STATUS_CONFIG[verificationStatus]
    ? STATUS_CONFIG[verificationStatus]
    : STATUS_CONFIG.pending;

  const StatusIcon = status.icon;
  const colorClasses: Record<string, { text: string; bg: string; border: string }> = {
    yellow: { text: "text-yellow-400", bg: "bg-yellow-500/15", border: "border-yellow-500/25" },
    blue: { text: "text-blue-400", bg: "bg-blue-500/15", border: "border-blue-500/25" },
    green: { text: "text-green-400", bg: "bg-green-500/15", border: "border-green-500/25" },
    red: { text: "text-red-400", bg: "bg-red-500/15", border: "border-red-500/25" },
  };
  const sc = colorClasses[status.color];

  const handleCopy = (text: string, field: string) => {
    navigator.clipboard.writeText(text).catch(() => {});
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const hasPlayerSeeds = shuffleProof?.playerSeeds && shuffleProof.playerSeeds.length > 0;
  const hasVRF = !!shuffleProof?.vrfRequestId;
  const hasOnChainProof = !!onChainCommitTx || !!onChainRevealTx;

  const handleDownload = () => {
    if (!shuffleProof) return;
    const version = shuffleProof.shuffleVersion || 1;
    // v2 uses rejection sampling with attempt counter in HMAC input
    const shuffleCode = version === 2
      ? `for(let i=deck.length-1;i>0;i--){const range=i+1;const max=Math.floor(0x100000000/range)*range;let attempt=0;let rand;do{const h=await hmacSha256(seed,"shuffle-index-"+i+"-"+attempt);rand=(h[0]<<24|h[1]<<16|h[2]<<8|h[3])>>>0;attempt++}while(rand>=max);const j=rand%range;[deck[i],deck[j]]=[deck[j],deck[i]]}`
      : `for(let i=deck.length-1;i>0;i--){const h=await hmacSha256(seed,"shuffle-index-"+i);const rand=(h[0]<<24|h[1]<<16|h[2]<<8|h[3])>>>0;const j=rand%(i+1);[deck[i],deck[j]]=[deck[j],deck[i]]}`;

    const onChainInfo = hasOnChainProof
      ? `\n<h3>On-Chain Proof</h3>\n<pre>Commitment TX: ${escapeHtml(onChainCommitTx || "N/A")}\nReveal TX: ${escapeHtml(onChainRevealTx || "N/A")}\nVerify on Polygonscan: https://amoy.polygonscan.com/tx/${escapeHtml(onChainCommitTx || "")}</pre>`
      : "";

    const playerSeedInfo = hasPlayerSeeds
      ? `\n<h3>Player Seeds (${escapeHtml(shuffleProof.playerSeeds.length)})</h3>\n<pre>${shuffleProof.playerSeeds.map((ps: any) => `Player ${escapeHtml(ps.playerId)}: seed=${escapeHtml(ps.seed || "hidden")} commit=${escapeHtml(ps.commitmentHash)}`).join("\n")}</pre>`
      : "";

    const html = `<!DOCTYPE html>
<html><head><title>Poker Hand Verification - Hand #${escapeHtml(shuffleProof.handNumber)}</title>
<style>body{font-family:monospace;background:#0a0a0a;color:#e0e0e0;padding:2rem;max-width:800px;margin:0 auto}
h1{color:#d4af37}pre{background:#111;padding:1rem;border-radius:8px;overflow-x:auto;border:1px solid #222}
.pass{color:#22c55e;font-weight:bold}.fail{color:#ef4444;font-weight:bold}button{background:#d4af37;color:#000;border:none;padding:0.75rem 1.5rem;border-radius:6px;font-weight:bold;cursor:pointer;font-size:1rem}button:hover{opacity:0.9}</style></head>
<body><h1>Provably Fair Verification (v${escapeHtml(version)})</h1>
<p>Hand #${escapeHtml(shuffleProof.handNumber)} | Table: ${escapeHtml(shuffleProof.tableId)}</p>
<h3>Proof Data</h3>
<pre>Server Seed: ${escapeHtml(shuffleProof.serverSeed)}
Commitment Hash: ${escapeHtml(shuffleProof.commitmentHash)}
Deck Order: ${escapeHtml(shuffleProof.deckOrder)}
Nonce: ${escapeHtml(shuffleProof.nonce)}
Timestamp: ${escapeHtml(shuffleProof.timestamp)}
Shuffle Version: ${escapeHtml(version)}${shuffleProof.vrfRandomWord ? `\nVRF Random Word: ${escapeHtml(shuffleProof.vrfRandomWord)}` : ""}</pre>${playerSeedInfo}${onChainInfo}
<button onclick="verify()">Run Verification</button>
<pre id="result"></pre>
<script>
async function hmacSha256(key,msg){const e=new TextEncoder();const k=await crypto.subtle.importKey("raw",e.encode(key),{name:"HMAC",hash:"SHA-256"},false,["sign"]);const s=await crypto.subtle.sign("HMAC",k,e.encode(msg));return new Uint8Array(s)}
async function sha256Hex(msg){const e=new TextEncoder();const h=await crypto.subtle.digest("SHA-256",e.encode(msg));return Array.from(new Uint8Array(h)).map(b=>b.toString(16).padStart(2,"0")).join("")}
async function verify(){const el=document.getElementById("result");el.textContent="Verifying...";
const suits=["hearts","diamonds","clubs","spades"];const ranks=["2","3","4","5","6","7","8","9","10","J","Q","K","A"];
const sh={hearts:"h",diamonds:"d",clubs:"c",spades:"s"};
const deck=[];for(const s of suits)for(const r of ranks)deck.push({suit:s,rank:r});
const seed="${escapeHtml(shuffleProof.serverSeed)}";
${shuffleCode}
const order=deck.map(c=>c.rank+sh[c.suit]).join(",");const hash=await sha256Hex(order);
const expected="${escapeHtml(shuffleProof.commitmentHash)}";
const valid=hash===expected;
el.innerHTML="Computed Hash: "+hash+"\\nExpected Hash: "+expected+"\\nDeck Order: "+order+"\\n\\nResult: "+(valid?'<span class="pass">VERIFIED \\u2713</span>':'<span class="fail">FAILED \\u2717</span>')}</script></body></html>`;
    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `hand-${shuffleProof.handNumber}-verify.html`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <motion.div
      initial={{ x: 320, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: 320, opacity: 0 }}
      transition={{ type: "spring", stiffness: 200, damping: 25 }}
      className="w-[320px] h-full flex flex-col z-40 pointer-events-auto relative overflow-hidden"
      style={{
        background: "linear-gradient(180deg, rgba(20,31,40,0.92) 0%, rgba(16,24,36,0.96) 100%)",
        borderLeft: "1px solid rgba(212,175,55,0.12)",
        boxShadow: "-8px 0 40px rgba(0,0,0,0.5)",
      }}
    >
      {/* Header */}
      <div className="p-5 relative" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        {onClose && (
          <button
            onClick={onClose}
            className="absolute top-3 right-3 p-1 rounded hover:bg-white/5 transition-colors"
          >
            <X className="w-4 h-4 text-gray-500" />
          </button>
        )}
        <div className="flex items-start gap-3">
          <div className="relative mt-0.5 shrink-0">
            <div className="absolute inset-0 blur-lg opacity-30 animate-pulse" style={{ background: status.glow }} />
            <div className={`w-10 h-10 rounded-lg ${sc.bg} border ${sc.border} flex items-center justify-center relative`}>
              <StatusIcon className={`w-5 h-5 ${sc.text} ${verificationStatus === "verifying" ? "animate-spin" : ""}`} />
            </div>
          </div>
          <div>
            <div className="text-xs font-bold text-gray-400 tracking-wider uppercase">
              Shuffle Status:
              <span className={`${sc.text} ml-1.5`}>{status.label}</span>
            </div>
            <div className="text-[0.5625rem] text-gray-600 font-mono mt-0.5">
              v2.0 | Casino-Grade Rejection Sampling
            </div>
          </div>
        </div>
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        <div className="p-5 space-y-5">

          {/* Entropy Sources */}
          <div>
            <div className="text-[0.625rem] font-bold uppercase tracking-wider text-white mb-3">
              Entropy Sources
            </div>
            <div className="space-y-2">
              {[
                { icon: Server, label: "Server CSPRNG", active: true, detail: "crypto.randomBytes(32)" },
                { icon: Smartphone, label: "UUID Nonce", active: true, detail: "crypto.randomUUID()" },
                {
                  icon: Users,
                  label: "Player Seeds",
                  active: hasPlayerSeeds || playerSeedStatus === "committed",
                  detail: hasPlayerSeeds
                    ? `${shuffleProof.playerSeeds.length} seed(s) verified`
                    : playerSeedStatus === "committed"
                      ? "Seed committed"
                      : "Multi-party entropy"
                },
                {
                  icon: Link2,
                  label: "Chainlink VRF",
                  active: hasVRF,
                  detail: hasVRF ? `RequestId: ${shuffleProof.vrfRequestId?.slice(0, 8)}...` : "Polygon blockchain"
                },
              ].map((source, i) => (
                <div key={i} className="flex items-center gap-2.5 group">
                  <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${
                    source.active
                      ? "bg-green-500/20 border border-green-500/30"
                      : "bg-gray-800 border border-gray-700"
                  }`}>
                    <CheckCircle className={`w-3 h-3 ${
                      source.active ? "text-green-400" : "text-gray-600"
                    }`} />
                  </div>
                  <div className="flex-1">
                    <span className="text-[0.6875rem] text-gray-300 font-medium">{source.label}</span>
                    <span className="text-[0.5625rem] text-gray-600 ml-1.5">{source.detail}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Player Seeds (collapsible, after showdown) */}
          {hasPlayerSeeds && shuffleProof && (
            <div>
              <button
                onClick={() => setShowPlayerSeeds(!showPlayerSeeds)}
                className="w-full flex items-center justify-between text-[0.625rem] font-bold uppercase tracking-wider text-white mb-2"
              >
                <span>Player Seeds ({shuffleProof.playerSeeds.length})</span>
                {showPlayerSeeds ? <ChevronUp className="w-3 h-3 text-gray-500" /> : <ChevronDown className="w-3 h-3 text-gray-500" />}
              </button>
              {showPlayerSeeds && (
                <div className="space-y-1.5">
                  {shuffleProof.playerSeeds.map((ps: any, idx: number) => (
                    <div
                      key={idx}
                      className="rounded-lg px-3 py-2 text-[0.5rem] font-mono"
                      style={{
                        background: "rgba(168,85,247,0.03)",
                        border: "1px solid rgba(168,85,247,0.08)",
                      }}
                    >
                      <div className="text-purple-400/70 truncate">
                        Player: {ps.playerId?.slice(0, 12)}...
                      </div>
                      <div className="text-gray-500 truncate mt-0.5">
                        Commit: {ps.commitmentHash?.slice(0, 20)}...
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* On-Chain Proof */}
          {hasOnChainProof && (
            <div>
              <div className="text-[0.625rem] font-bold uppercase tracking-wider text-white mb-2">
                On-Chain Proof
              </div>
              <div className="space-y-1.5">
                {onChainCommitTx && (
                  <div className="flex items-center gap-2">
                    <Blocks className="w-3 h-3 text-indigo-400 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-[0.5625rem] text-gray-500">Commitment TX</div>
                      <div className="text-[0.5rem] font-mono text-indigo-400/70 truncate">{onChainCommitTx}</div>
                    </div>
                    <a
                      href={`https://amoy.polygonscan.com/tx/${onChainCommitTx}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="shrink-0 p-1 rounded hover:bg-white/5"
                    >
                      <ExternalLink className="w-3 h-3 text-indigo-400" />
                    </a>
                  </div>
                )}
                {onChainRevealTx && (
                  <div className="flex items-center gap-2">
                    <Blocks className="w-3 h-3 text-indigo-400 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-[0.5625rem] text-gray-500">Reveal TX</div>
                      <div className="text-[0.5rem] font-mono text-indigo-400/70 truncate">{onChainRevealTx}</div>
                    </div>
                    <a
                      href={`https://amoy.polygonscan.com/tx/${onChainRevealTx}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="shrink-0 p-1 rounded hover:bg-white/5"
                    >
                      <ExternalLink className="w-3 h-3 text-indigo-400" />
                    </a>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Commitment Hash */}
          <div>
            <div className="text-[0.625rem] font-bold uppercase tracking-wider text-white mb-2">
              Commitment Hash
            </div>
            {commitmentHash ? (
              <div className="flex items-center gap-2">
                <div
                  className="flex-1 rounded-lg px-3 py-2.5 text-[0.5625rem] font-mono text-amber-400/80 truncate"
                  style={{
                    background: "rgba(212,175,55,0.04)",
                    border: "1px solid rgba(212,175,55,0.1)",
                  }}
                  title={commitmentHash}
                >
                  {commitmentHash.slice(0, 20)}...{commitmentHash.slice(-8)}
                </div>
                <button
                  onClick={() => handleCopy(commitmentHash, "hash")}
                  className="shrink-0 px-3 py-2.5 rounded-lg text-[0.5625rem] font-bold uppercase tracking-wider transition-all"
                  style={{
                    background: copiedField === "hash" ? "rgba(212,175,55,0.15)" : "rgba(212,175,55,0.08)",
                    border: `1px solid ${copiedField === "hash" ? "rgba(212,175,55,0.3)" : "rgba(212,175,55,0.15)"}`,
                    color: copiedField === "hash" ? "#d4af37" : "#8ecae6",
                  }}
                >
                  {copiedField === "hash" ? <CheckCircle className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                </button>
              </div>
            ) : (
              <div className="rounded-lg px-3 py-2.5 text-[0.5625rem] font-mono text-gray-600 italic"
                style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.04)" }}
              >
                Waiting for next hand...
              </div>
            )}
            <div className="text-[0.5rem] text-gray-600 mt-1">Pre-deal locked SHA-256 of deck order</div>
          </div>

          {/* Seed Reveal */}
          <div>
            <div className="text-[0.625rem] font-bold uppercase tracking-wider text-white mb-2">
              Server Seed
            </div>
            {shuffleProof ? (
              <div>
                <button
                  onClick={() => setSeedRevealed(!seedRevealed)}
                  className="w-full flex items-center gap-3 p-3 rounded-lg transition-all hover:bg-white/[0.02] group"
                  style={{
                    background: "rgba(255,255,255,0.01)",
                    border: "1px solid rgba(255,255,255,0.06)",
                  }}
                >
                  <div className="w-8 h-8 rounded-lg bg-purple-500/10 border border-purple-500/15 flex items-center justify-center shrink-0">
                    {seedRevealed ? <EyeOff className="w-4 h-4 text-purple-400" /> : <Eye className="w-4 h-4 text-purple-400" />}
                  </div>
                  <div className="text-left flex-1 min-w-0">
                    <div className="text-[0.6875rem] font-semibold text-white group-hover:text-purple-300 transition-colors">
                      {seedRevealed ? "Hide Seed" : "Reveal Seed"}
                    </div>
                    <div className="text-[0.5625rem] text-gray-600 truncate">
                      {seedRevealed ? shuffleProof.serverSeed.slice(0, 24) + "..." : "Click to reveal after showdown"}
                    </div>
                  </div>
                </button>
                {seedRevealed && (
                  <div className="mt-2 flex items-center gap-2">
                    <div
                      className="flex-1 rounded-lg px-3 py-2 text-[0.5rem] font-mono text-purple-400/80 break-all"
                      style={{
                        background: "rgba(168,85,247,0.04)",
                        border: "1px solid rgba(168,85,247,0.1)",
                      }}
                    >
                      {shuffleProof.serverSeed}
                    </div>
                    <button
                      onClick={() => handleCopy(shuffleProof.serverSeed, "seed")}
                      className="shrink-0 p-2 rounded-lg transition-all"
                      style={{
                        background: copiedField === "seed" ? "rgba(212,175,55,0.15)" : "rgba(168,85,247,0.08)",
                        border: `1px solid ${copiedField === "seed" ? "rgba(212,175,55,0.3)" : "rgba(168,85,247,0.15)"}`,
                        color: copiedField === "seed" ? "#d4af37" : "#a78bfa",
                      }}
                    >
                      {copiedField === "seed" ? <CheckCircle className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div
                className="flex items-center gap-3 p-3 rounded-lg opacity-50"
                style={{
                  background: "rgba(255,255,255,0.01)",
                  border: "1px solid rgba(255,255,255,0.04)",
                }}
              >
                <div className="w-8 h-8 rounded-lg bg-gray-800 border border-gray-700 flex items-center justify-center shrink-0">
                  <Eye className="w-4 h-4 text-gray-600" />
                </div>
                <div className="text-left">
                  <div className="text-[0.6875rem] font-semibold text-gray-500">Locked Until Showdown</div>
                  <div className="text-[0.5625rem] text-gray-700">Seed revealed after hand completes</div>
                </div>
              </div>
            )}
          </div>

          {/* Deck Order (collapsible) */}
          {shuffleProof && (
            <div>
              <button
                onClick={() => setShowDeckOrder(!showDeckOrder)}
                className="w-full flex items-center justify-between text-[0.625rem] font-bold uppercase tracking-wider text-white mb-2"
              >
                <span>Deck Order</span>
                {showDeckOrder ? <ChevronUp className="w-3 h-3 text-gray-500" /> : <ChevronDown className="w-3 h-3 text-gray-500" />}
              </button>
              {showDeckOrder && (
                <div
                  className="rounded-lg px-3 py-2 text-[0.5rem] font-mono text-amber-400/60 break-all max-h-32 overflow-y-auto custom-scrollbar"
                  style={{
                    background: "rgba(212,175,55,0.02)",
                    border: "1px solid rgba(212,175,55,0.06)",
                  }}
                >
                  {shuffleProof.deckOrder}
                </div>
              )}
            </div>
          )}

          {/* Verification Result */}
          {verificationStatus === "verified" && (
            <div
              className="flex items-center gap-3 p-3 rounded-lg"
              style={{
                background: "rgba(34,197,94,0.05)",
                border: "1px solid rgba(34,197,94,0.15)",
              }}
            >
              <CheckCircle className="w-5 h-5 text-green-400 shrink-0" />
              <div>
                <div className="text-[0.6875rem] font-semibold text-green-300">Client Verification Passed</div>
                <div className="text-[0.5625rem] text-gray-500">Re-shuffled locally, hashes match</div>
              </div>
            </div>
          )}

          {verificationStatus === "failed" && (
            <div
              className="flex items-center gap-3 p-3 rounded-lg"
              style={{
                background: "rgba(239,68,68,0.05)",
                border: "1px solid rgba(239,68,68,0.15)",
              }}
            >
              <AlertTriangle className="w-5 h-5 text-red-400 shrink-0" />
              <div>
                <div className="text-[0.6875rem] font-semibold text-red-300">Verification Failed</div>
                <div className="text-[0.5625rem] text-gray-500">Hash mismatch detected</div>
              </div>
            </div>
          )}

          {/* Download Verification Script */}
          <button
            onClick={handleDownload}
            disabled={!shuffleProof}
            className="w-full flex items-center gap-3 p-3 rounded-lg transition-all hover:bg-green-500/[0.03] group disabled:opacity-30 disabled:cursor-not-allowed"
            style={{
              background: "rgba(212,175,55,0.02)",
              border: "1px solid rgba(212,175,55,0.1)",
            }}
          >
            <div className="w-8 h-8 rounded-lg bg-green-500/10 border border-green-500/20 flex items-center justify-center shrink-0">
              <Download className="w-4 h-4 text-green-400" />
            </div>
            <div className="text-left">
              <div className="text-[0.6875rem] font-semibold text-green-300 group-hover:text-green-200 transition-colors">
                Download Verification
              </div>
              <div className="text-[0.5625rem] text-gray-600">Standalone HTML with proof + verify code</div>
            </div>
          </button>
        </div>
      </div>

      {/* Footer */}
      <div
        className="px-5 py-3 text-center"
        style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}
      >
        <div className="text-[0.5625rem] text-gray-600 font-mono">
          <span className="text-amber-500/60">HMAC-SHA256 Fisher-Yates</span>
          <span className="mx-1.5 text-gray-700">+</span>
          <span className="text-amber-500/60">SHA-512 Entropy</span>
          <span className="mx-1.5 text-gray-700">+</span>
          <span className="text-amber-500/60">Polygon</span>
        </div>
      </div>
    </motion.div>
  );
}
