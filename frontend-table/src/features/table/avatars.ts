// Premium character avatars for table seats.
//
// Drop transparent portrait PNGs into `frontend-table/public/avatars/<id>.png`
// (e.g. the cyberpunk/mafia poker-boss style art) and they render automatically.
// Until a real image exists, SeatCard falls back to a generated monogram
// portrait so the table still looks intentional.

export const AVATAR_IDS = [
  "boss",
  "cyber",
  "queen",
  "ace",
  "shark",
  "phantom",
  "duchess",
  "maverick",
  "oracle",
] as const;

export type AvatarId = (typeof AVATAR_IDS)[number];

export function avatarSrc(id: string): string {
  return `/avatars/${id}.png`;
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
  return AVATAR_IDS[hash(key) % AVATAR_IDS.length];
}

/** Deterministic fallback gradient (used when the PNG is missing). */
export function avatarGradient(key: string): string {
  const hue = hash(key) % 360;
  return `linear-gradient(135deg, hsl(${hue} 72% 48%), hsl(${(hue + 45) % 360} 72% 26%))`;
}
