// Premium character avatars for table seats.
//
// The portrait art (240×240 WebP) lives in `frontend-table/public/avatars/<id>.webp`.
// This catalog + colors are harvested from the HighRollersClub character set (neon /
// cyberpunk poker-boss style). Each character carries a display name, a rarity tier, and
// a neon border/glow color so the seat portrait ring matches the character.
//
// A player is assigned a stable character from their identity (user id / seat key) unless
// they pick their own. If a portrait file is ever missing, SeatCard falls back to a
// generated monogram gradient so the table still looks intentional.

export type AvatarTier = "legendary" | "epic" | "rare" | "common";

export interface AvatarDef {
  id: string;
  name: string;
  tier: AvatarTier;
  /** Neon ring color. */
  border: string;
  /** Soft glow color (rgba). */
  glow: string;
}

export const AVATARS: AvatarDef[] = [
  { id: "neon-viper", name: "Neon Viper", tier: "legendary", border: "#d4af37", glow: "rgba(212,175,55,0.55)" },
  { id: "chrome-siren", name: "Chrome Siren", tier: "legendary", border: "#b44dff", glow: "rgba(180,77,255,0.55)" },
  { id: "gold-phantom", name: "Gold Phantom", tier: "legendary", border: "#ffd700", glow: "rgba(255,215,0,0.55)" },
  { id: "shadow-king", name: "Shadow King", tier: "legendary", border: "#d4af37", glow: "rgba(212,175,55,0.55)" },
  { id: "void-witch", name: "Void Witch", tier: "legendary", border: "#a855f7", glow: "rgba(168,85,247,0.55)" },
  { id: "cyber-samurai", name: "Cyber Samurai", tier: "legendary", border: "#ef4444", glow: "rgba(239,68,68,0.55)" },
  { id: "red-wolf", name: "Red Wolf", tier: "epic", border: "#ff3366", glow: "rgba(255,51,102,0.5)" },
  { id: "ice-queen", name: "Ice Queen", tier: "epic", border: "#67e8f9", glow: "rgba(103,232,249,0.5)" },
  { id: "tech-monk", name: "Tech Monk", tier: "epic", border: "#d4af37", glow: "rgba(212,175,55,0.5)" },
  { id: "cyber-punk", name: "Cyber Punk", tier: "epic", border: "#ff69b4", glow: "rgba(255,105,180,0.5)" },
  { id: "oracle-seer", name: "Oracle Seer", tier: "epic", border: "#34d399", glow: "rgba(52,211,153,0.5)" },
  { id: "punk-duchess", name: "Punk Duchess", tier: "epic", border: "#f472b6", glow: "rgba(244,114,182,0.5)" },
  { id: "mech-pilot", name: "Mech Pilot", tier: "epic", border: "#fb923c", glow: "rgba(251,146,60,0.5)" },
  { id: "ghost-sniper", name: "Ghost Sniper", tier: "epic", border: "#94a3b8", glow: "rgba(148,163,184,0.5)" },
  { id: "steel-ghost", name: "Steel Ghost", tier: "rare", border: "#8ecae6", glow: "rgba(142,202,230,0.45)" },
  { id: "neon-fox", name: "Neon Fox", tier: "rare", border: "#ff8c00", glow: "rgba(255,140,0,0.45)" },
  { id: "dark-ace", name: "Dark Ace", tier: "rare", border: "#6366f1", glow: "rgba(99,102,241,0.45)" },
  { id: "bolt-runner", name: "Bolt Runner", tier: "rare", border: "#facc15", glow: "rgba(250,204,21,0.45)" },
  { id: "street-racer", name: "Street Racer", tier: "rare", border: "#22d3ee", glow: "rgba(34,211,238,0.45)" },
  { id: "dj-chrome", name: "DJ Chrome", tier: "rare", border: "#c084fc", glow: "rgba(192,132,252,0.45)" },
  { id: "iron-bull", name: "Iron Bull", tier: "rare", border: "#b45309", glow: "rgba(180,83,9,0.45)" },
  { id: "data-thief", name: "Data Thief", tier: "rare", border: "#10b981", glow: "rgba(16,185,129,0.45)" },
  { id: "neon-medic", name: "Neon Medic", tier: "rare", border: "#14b8a6", glow: "rgba(20,184,166,0.45)" },
  { id: "merchant-boss", name: "Merchant Boss", tier: "rare", border: "#d97706", glow: "rgba(217,119,6,0.45)" },
];

export const AVATAR_IDS = AVATARS.map((a) => a.id);

export type AvatarId = string;

const BY_ID: Record<string, AvatarDef> = Object.fromEntries(AVATARS.map((a) => [a.id, a]));

export function avatarSrc(id: string): string {
  return `/avatars/${id}.webp`;
}

function hash(key: string): number {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Stable avatar id for a given identity (user id or a seat key). */
export function avatarForKey(key: string): AvatarId {
  return AVATARS[hash(key) % AVATARS.length].id;
}

/** Look up a character definition by id (falls back to a stable pick for unknown ids). */
export function avatarDef(idOrKey: string): AvatarDef {
  return BY_ID[idOrKey] ?? AVATARS[hash(idOrKey) % AVATARS.length];
}

/** Deterministic fallback gradient (used when the portrait file is missing). */
export function avatarGradient(key: string): string {
  const hue = hash(key) % 360;
  return `linear-gradient(135deg, hsl(${hue} 72% 48%), hsl(${(hue + 45) % 360} 72% 26%))`;
}
