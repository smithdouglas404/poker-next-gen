import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronRight, Zap, Shield, Crown, Star, Trophy, Flame, User } from "lucide-react";

import lionLogo from "@assets/generated_images/lion_crest_gold_emblem.webp";

import avNeonViper from "@assets/generated_images/avatars/avatar_neon_viper.webp";
import avChromeSiren from "@assets/generated_images/avatars/avatar_chrome_siren.webp";
import avGoldPhantom from "@assets/generated_images/avatars/avatar_gold_phantom.webp";
import avShadowKing from "@assets/generated_images/avatars/avatar_shadow_king.webp";
import avRedWolf from "@assets/generated_images/avatars/avatar_red_wolf.webp";
import avIceQueen from "@assets/generated_images/avatars/avatar_ice_queen.webp";
import avTechMonk from "@assets/generated_images/avatars/avatar_tech_monk.webp";
import avCyberPunk from "@assets/generated_images/avatars/avatar_cyber_punk.webp";
import avSteelGhost from "@assets/generated_images/avatars/avatar_steel_ghost.webp";
import avNeonFox from "@assets/generated_images/avatars/avatar_neon_fox.webp";
import avDarkAce from "@assets/generated_images/avatars/avatar_dark_ace.webp";
import avBoltRunner from "@assets/generated_images/avatars/avatar_bolt_runner.webp";
import avVoidWitch from "@assets/generated_images/avatars/avatar_void_witch.webp";
import avOracleSeer from "@assets/generated_images/avatars/avatar_oracle_seer.webp";
import avPunkDuchess from "@assets/generated_images/avatars/avatar_punk_duchess.webp";
import avStreetRacer from "@assets/generated_images/avatars/avatar_street_racer.webp";
import avCyberSamurai from "@assets/generated_images/avatars/avatar_cyber_samurai.webp";
import avMechPilot from "@assets/generated_images/avatars/avatar_mech_pilot.webp";
import avGhostSniper from "@assets/generated_images/avatars/avatar_ghost_sniper.webp";
import avDjChrome from "@assets/generated_images/avatars/avatar_dj_chrome.webp";
import avIronBull from "@assets/generated_images/avatars/avatar_iron_bull.webp";
import avDataThief from "@assets/generated_images/avatars/avatar_data_thief.webp";
import avNeonMedic from "@assets/generated_images/avatars/avatar_neon_medic.webp";
import avMerchantBoss from "@assets/generated_images/avatars/avatar_merchant_boss.webp";

// Full-body 3D avatar imports (premium tiers only: 6 legendary + 2 epic)
import fullBody1 from "@/assets/avatars/avatar-full-1.png";
import fullBody2 from "@/assets/avatars/avatar-full-2.png";
import fullBody3 from "@/assets/avatars/avatar-full-3.png";
import fullBody4 from "@/assets/avatars/avatar-full-4.png";
import fullBody5 from "@/assets/avatars/avatar-full-5.png";
import fullBody6 from "@/assets/avatars/avatar-full-6.png";
import fullBody7 from "@/assets/avatars/avatar-full-7.png";
import fullBody8 from "@/assets/avatars/avatar-full-8.png";

export interface AvatarOption {
  id: string;
  name: string;
  image: string;
  fullBodyImage?: string;
  tier: "legendary" | "epic" | "rare" | "common";
  borderColor: string;
  glowColor: string;
}

export const AVATAR_OPTIONS: AvatarOption[] = [
  { id: "neon-viper",      name: "Neon Viper",      image: avNeonViper,      fullBodyImage: fullBody1, tier: "legendary", borderColor: "#d4af37", glowColor: "rgba(212,175,55,0.3)" },
  { id: "chrome-siren",    name: "Chrome Siren",    image: avChromeSiren,    fullBodyImage: fullBody2, tier: "legendary", borderColor: "#b44dff", glowColor: "rgba(180,77,255,0.3)" },
  { id: "gold-phantom",    name: "Gold Phantom",    image: avGoldPhantom,    fullBodyImage: fullBody3, tier: "legendary", borderColor: "#ffd700", glowColor: "rgba(255,215,0,0.3)" },
  { id: "shadow-king",     name: "Shadow King",     image: avShadowKing,     fullBodyImage: fullBody4, tier: "legendary", borderColor: "#d4af37", glowColor: "rgba(212,175,55,0.3)" },
  { id: "void-witch",      name: "Void Witch",      image: avVoidWitch,      fullBodyImage: fullBody5, tier: "legendary", borderColor: "#a855f7", glowColor: "rgba(168,85,247,0.3)" },
  { id: "cyber-samurai",   name: "Cyber Samurai",   image: avCyberSamurai,   fullBodyImage: fullBody6, tier: "legendary", borderColor: "#ef4444", glowColor: "rgba(239,68,68,0.3)" },
  { id: "red-wolf",        name: "Red Wolf",        image: avRedWolf,        fullBodyImage: fullBody7, tier: "epic", borderColor: "#ff3366", glowColor: "rgba(255,51,102,0.3)" },
  { id: "ice-queen",       name: "Ice Queen",       image: avIceQueen,       fullBodyImage: fullBody8, tier: "epic", borderColor: "#67e8f9", glowColor: "rgba(103,232,249,0.3)" },
  { id: "tech-monk",       name: "Tech Monk",       image: avTechMonk,       tier: "epic", borderColor: "#d4af37", glowColor: "rgba(212,175,55,0.3)" },
  { id: "cyber-punk",      name: "Cyber Punk",      image: avCyberPunk,      tier: "epic", borderColor: "#ff69b4", glowColor: "rgba(255,105,180,0.3)" },
  { id: "oracle-seer",     name: "Oracle Seer",     image: avOracleSeer,     tier: "epic", borderColor: "#34d399", glowColor: "rgba(52,211,153,0.3)" },
  { id: "punk-duchess",    name: "Punk Duchess",    image: avPunkDuchess,    tier: "epic", borderColor: "#f472b6", glowColor: "rgba(244,114,182,0.3)" },
  { id: "mech-pilot",      name: "Mech Pilot",      image: avMechPilot,      tier: "epic", borderColor: "#fb923c", glowColor: "rgba(251,146,60,0.3)" },
  { id: "ghost-sniper",    name: "Ghost Sniper",    image: avGhostSniper,    tier: "epic", borderColor: "#94a3b8", glowColor: "rgba(148,163,184,0.3)" },
  { id: "steel-ghost",     name: "Steel Ghost",     image: avSteelGhost,     tier: "rare", borderColor: "#8ecae6", glowColor: "rgba(142,202,230,0.25)" },
  { id: "neon-fox",        name: "Neon Fox",        image: avNeonFox,        tier: "rare", borderColor: "#ff8c00", glowColor: "rgba(255,140,0,0.25)" },
  { id: "dark-ace",        name: "Dark Ace",        image: avDarkAce,        tier: "rare", borderColor: "#6366f1", glowColor: "rgba(99,102,241,0.25)" },
  { id: "bolt-runner",     name: "Bolt Runner",     image: avBoltRunner,     tier: "rare", borderColor: "#facc15", glowColor: "rgba(250,204,21,0.25)" },
  { id: "street-racer",    name: "Street Racer",    image: avStreetRacer,    tier: "rare", borderColor: "#22d3ee", glowColor: "rgba(34,211,238,0.25)" },
  { id: "dj-chrome",       name: "DJ Chrome",       image: avDjChrome,       tier: "rare", borderColor: "#c084fc", glowColor: "rgba(192,132,252,0.25)" },
  { id: "iron-bull",       name: "Iron Bull",       image: avIronBull,       tier: "rare", borderColor: "#b45309", glowColor: "rgba(180,83,9,0.25)" },
  { id: "data-thief",      name: "Data Thief",      image: avDataThief,      tier: "rare", borderColor: "#10b981", glowColor: "rgba(16,185,129,0.25)" },
  { id: "neon-medic",      name: "Neon Medic",      image: avNeonMedic,      tier: "rare", borderColor: "#14b8a6", glowColor: "rgba(20,184,166,0.25)" },
  { id: "merchant-boss",   name: "Merchant Boss",   image: avMerchantBoss,   tier: "rare", borderColor: "#d97706", glowColor: "rgba(217,119,6,0.25)" },
];

const TIER_CONFIG: Record<string, { bg: string; text: string; label: string; icon: any }> = {
  legendary: { bg: "bg-amber-500/10 border-amber-500/20", text: "text-amber-400", label: "LEGENDARY", icon: Crown },
  epic:      { bg: "bg-purple-500/10 border-purple-500/20", text: "text-purple-400", label: "EPIC", icon: Star },
  rare:      { bg: "bg-amber-500/10 border-amber-500/20", text: "text-amber-400", label: "RARE", icon: Zap },
  common:    { bg: "bg-gray-500/10 border-gray-500/20", text: "text-gray-400", label: "COMMON", icon: Shield },
};

const TIER_FILTERS = ["all", "legendary", "epic", "rare"] as const;

interface AvatarSelectProps {
  onSelect: (avatar: AvatarOption, playerName: string) => void;
}

export function AvatarSelect({ onSelect }: AvatarSelectProps) {
  const [selected, setSelected] = useState<AvatarOption>(AVATAR_OPTIONS[0]);
  const [playerName, setPlayerName] = useState("");
  const [isReady, setIsReady] = useState(false);
  const [tierFilter, setTierFilter] = useState<string>("all");

  const filteredAvatars = tierFilter === "all"
    ? AVATAR_OPTIONS
    : AVATAR_OPTIONS.filter(a => a.tier === tierFilter);

  const handleJoin = () => {
    if (!playerName.trim()) return;
    setIsReady(true);
    setTimeout(() => onSelect(selected, playerName.trim()), 800);
  };

  return (
    <AnimatePresence>
      {!isReady ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, scale: 1.1 }}
          transition={{ duration: 0.5 }}
          className="min-h-screen bg-background text-white flex flex-col items-center justify-center relative overflow-hidden"
        >
          {/* Background */}
          <div className="absolute inset-0">
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(0,20,30,0.4)_0%,rgba(0,0,0,0.95)_70%)]" />
          </div>
          {/* Dynamic glow for selected avatar */}
          <div className="absolute inset-0 z-[2] pointer-events-none">
            <div
              className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[700px] rounded-full transition-all duration-700"
              style={{ background: `radial-gradient(circle, ${selected.glowColor} 0%, transparent 60%)` }}
            />
          </div>

          <div className="relative z-10 w-full max-w-4xl px-6 space-y-6">

            {/* ─── Header ─────────────────────────────────────── */}
            <motion.div
              initial={{ y: -20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              className="text-center space-y-2"
            >
              <div className="w-14 h-14 mx-auto relative">
                <div className="absolute inset-[-6px] bg-amber-500/20 blur-xl rounded-full animate-pulse" />
                <img src={lionLogo} alt="" className="w-full h-full object-contain relative z-10 drop-shadow-[0_0_12px_rgba(212,175,55,0.5)]" />
              </div>
              <h1 className="font-display text-xl font-bold tracking-[0.2em] gold-text">CHOOSE YOUR AVATAR</h1>
              <p className="text-xs text-gray-500">Your avatar carries your win history and total earnings</p>
            </motion.div>

            {/* ─── Tier Filter ─────────────────────────────────── */}
            <motion.div
              initial={{ y: 10, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.1 }}
              className="flex items-center justify-center gap-1"
            >
              {TIER_FILTERS.map((tier) => (
                <button
                  key={tier}
                  onClick={() => setTierFilter(tier)}
                  className={`px-3 py-1.5 rounded-lg text-[0.5625rem] font-bold uppercase tracking-wider transition-all ${
                    tierFilter === tier
                      ? tier === "all"
                        ? "bg-white/10 text-white border border-white/15"
                        : `${TIER_CONFIG[tier].bg} ${TIER_CONFIG[tier].text} border`
                      : "text-gray-600 hover:text-gray-400 border border-transparent"
                  }`}
                >
                  {tier === "all" ? "All" : TIER_CONFIG[tier].label}
                </button>
              ))}
            </motion.div>

            {/* ─── Avatar Grid ─────────────────────────────────── */}
            <motion.div
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.15 }}
              className="grid grid-cols-4 sm:grid-cols-6 gap-3"
            >
              {filteredAvatars.map((av, i) => {
                const isSelected = selected.id === av.id;
                const tier = TIER_CONFIG[av.tier];
                const TierIcon = tier.icon;
                return (
                  <motion.button
                    key={av.id}
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.05 + i * 0.03 }}
                    onClick={() => setSelected(av)}
                    className={`relative rounded-xl overflow-hidden transition-all duration-300 group ${
                      isSelected ? "scale-[1.05] z-10" : "opacity-70 hover:opacity-100 hover:scale-[1.02]"
                    }`}
                    style={{
                      border: isSelected ? `2px solid ${av.borderColor}` : "2px solid rgba(255,255,255,0.05)",
                      boxShadow: isSelected ? `0 0 25px ${av.glowColor}, 0 8px 25px rgba(0,0,0,0.4)` : "0 4px 15px rgba(0,0,0,0.3)",
                    }}
                  >
                    {/* Image */}
                    <div className="aspect-square relative">
                      <img
                        src={av.image}
                        alt={av.name}
                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />

                      {/* Selected indicator */}
                      {isSelected && (
                        <motion.div
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full flex items-center justify-center"
                          style={{ background: av.borderColor, boxShadow: `0 0 10px ${av.glowColor}` }}
                        >
                          <Zap className="w-3 h-3 text-black" />
                        </motion.div>
                      )}

                      {/* Tier badge */}
                      <div className="absolute top-1.5 left-1.5">
                        <div className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[7px] font-bold uppercase tracking-wider ${tier.bg} ${tier.text} border backdrop-blur-sm`}>
                          <TierIcon className="w-2 h-2" />
                          {av.tier === "legendary" ? "LEG" : av.tier === "epic" ? "EPIC" : "RARE"}
                        </div>
                      </div>

                      {/* Full Body badge */}
                      {av.fullBodyImage && (
                        <div className="absolute bottom-6 right-1.5">
                          <div className="flex items-center gap-0.5 px-1 py-0.5 rounded text-[6px] font-bold uppercase tracking-wider bg-amber-500/20 text-amber-300 border border-amber-500/40 backdrop-blur-sm">
                            <User className="w-2 h-2" />
                            3D
                          </div>
                        </div>
                      )}

                      {/* Name at bottom */}
                      <div className="absolute bottom-0 left-0 right-0 px-2 pb-1.5">
                        <div className="text-[0.625rem] font-bold text-white truncate drop-shadow-lg">{av.name}</div>
                      </div>
                    </div>
                  </motion.button>
                );
              })}
            </motion.div>

            {/* ─── Selected Avatar Detail ──────────────────────── */}
            <motion.div
              key={selected.id}
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-center justify-center gap-6"
            >
              <div className="flex items-center gap-3">
                <div
                  className="w-12 h-12 rounded-lg overflow-hidden"
                  style={{ border: `2px solid ${selected.borderColor}`, boxShadow: `0 0 15px ${selected.glowColor}` }}
                >
                  <img
                    src={selected.fullBodyImage || selected.image}
                    alt=""
                    className={`w-full h-full ${selected.fullBodyImage ? "object-cover object-top" : "object-cover"}`}
                  />
                </div>
                <div>
                  <div className="text-sm font-bold text-white flex items-center gap-1.5">
                    {selected.name}
                    {selected.fullBodyImage && (
                      <span className="px-1.5 py-0.5 rounded text-[7px] font-bold uppercase tracking-wider bg-amber-500/20 text-amber-300 border border-amber-500/40">
                        3D Full Body
                      </span>
                    )}
                  </div>
                  <div className={`text-[0.5625rem] font-bold uppercase tracking-wider ${TIER_CONFIG[selected.tier].text}`}>
                    {TIER_CONFIG[selected.tier].label}
                  </div>
                </div>
              </div>
              <div className="h-8 w-px bg-white/10" />
              {/* Mock stats for the avatar */}
              <div className="flex items-center gap-4">
                <div className="text-center">
                  <div className="text-xs font-bold text-white">0</div>
                  <div className="text-[0.5rem] text-gray-600 uppercase tracking-wider">Wins</div>
                </div>
                <div className="text-center">
                  <div className="text-xs font-bold text-amber-400">0</div>
                  <div className="text-[0.5rem] text-gray-600 uppercase tracking-wider">Chips Won</div>
                </div>
                <div className="text-center">
                  <div className="text-xs font-bold text-amber-400">0</div>
                  <div className="text-[0.5rem] text-gray-600 uppercase tracking-wider">Hands</div>
                </div>
              </div>
            </motion.div>

            {/* ─── Name Input & Join ──────────────────────────── */}
            <motion.div
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.3 }}
              className="flex items-center gap-3 max-w-lg mx-auto"
            >
              <div className="flex-1 relative">
                <input
                  type="text"
                  value={playerName}
                  onChange={(e) => setPlayerName(e.target.value.replace(/[^a-zA-Z0-9 _-]/g, "").slice(0, 16))}
                  onKeyDown={(e) => e.key === "Enter" && handleJoin()}
                  placeholder="Enter your player name..."
                  maxLength={16}
                  className="w-full rounded-xl px-4 py-3.5 text-sm text-white placeholder-gray-600 outline-none transition-all bg-white/[0.03] backdrop-blur-sm focus:bg-white/[0.05]"
                  style={{
                    border: playerName.trim() ? `1px solid ${selected.borderColor}40` : "1px solid rgba(255,255,255,0.06)",
                    boxShadow: playerName.trim() ? `0 0 15px ${selected.glowColor.replace("0.3", "0.1")}` : "none",
                  }}
                />
                <div className="absolute right-3 top-1/2 -translate-y-1/2 text-[0.625rem] text-gray-600 font-mono">
                  {playerName.length}/16
                </div>
              </div>

              <motion.button
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                onClick={handleJoin}
                disabled={!playerName.trim()}
                className={`rounded-xl px-7 py-3.5 font-bold text-sm uppercase tracking-wider flex items-center gap-2 transition-all ${
                  playerName.trim() ? "text-black" : "text-gray-600 bg-gray-800/50 cursor-not-allowed"
                }`}
                style={playerName.trim() ? {
                  background: `linear-gradient(135deg, ${selected.borderColor}, ${selected.borderColor}cc)`,
                  boxShadow: `0 0 25px ${selected.glowColor}, 0 4px 15px rgba(0,0,0,0.3)`,
                } : undefined}
              >
                <Flame className="w-4 h-4" />
                Join Table
                <ChevronRight className="w-4 h-4" />
              </motion.button>
            </motion.div>
          </div>
        </motion.div>
      ) : (
        <motion.div
          initial={{ opacity: 1 }}
          animate={{ opacity: 0, scale: 1.2 }}
          transition={{ duration: 0.8 }}
          className="min-h-screen bg-background flex items-center justify-center"
        >
          <motion.div
            initial={{ scale: 1 }}
            animate={{ scale: 0.5, opacity: 0 }}
            transition={{ duration: 0.6 }}
            className="text-center"
          >
            <div className="font-display text-xl tracking-widest" style={{ color: selected.borderColor }}>
              ENTERING TABLE...
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
