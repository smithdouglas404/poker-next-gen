"use client";

// Catalogs for the music picker + voice taunts (harvested from HighRollersClub).

export interface MusicTrack {
  id: string;
  title: string;
  url: string;
  /** Set when the track is not cleared for commercial use. */
  unlicensed?: boolean;
}

/**
 * Starter music library. These files live in `public/music/`.
 *
 * ⚠️ LICENSING: "Fever" and "Rather Be" are commercial recordings and are NOT
 * cleared for a paid product — replace them with licensed / royalty-free tracks
 * before charging members. Players can also add their own track via a URL, which
 * is the intended path for a real library. See public/music/README.md.
 */
export const MUSIC_TRACKS: MusicTrack[] = [
  { id: "soar", title: "Soar", url: "/music/soar.mp3" },
  { id: "fever", title: "Fever", url: "/music/fever.mp3", unlicensed: true },
  { id: "rather-be", title: "Rather Be", url: "/music/rather-be.mp3", unlicensed: true },
];

export interface Taunt {
  key: string;
  label: string;
  emoji: string;
}

/** Curated quick-taunt bar (each key has audio under public/sounds/taunts/). */
export const TAUNTS: Taunt[] = [
  { key: "ship-it", label: "Ship it!", emoji: "🚢" },
  { key: "nice-hand", label: "Nice hand", emoji: "👏" },
  { key: "the-nuts", label: "The nuts", emoji: "🥜" },
  { key: "bad-beat", label: "Bad beat", emoji: "💔" },
  { key: "all-day", label: "All day", emoji: "☀️" },
  { key: "lets-go", label: "Let's go", emoji: "🔥" },
  { key: "i-smell-bluff", label: "Smells like a bluff", emoji: "👃" },
  { key: "run-it", label: "Run it twice", emoji: "🎲" },
  { key: "respect", label: "Respect", emoji: "🤝" },
  { key: "gg", label: "GG", emoji: "🏆" },
];

const TAUNT_BY_KEY: Record<string, Taunt> = Object.fromEntries(TAUNTS.map((t) => [t.key, t]));

export function tauntByKey(key: string): Taunt | undefined {
  return TAUNT_BY_KEY[key];
}

/** Characters that ship a dedicated voice pack (others fall back to `default`). */
export const TAUNT_VOICE_CHARACTERS = new Set([
  "bolt-runner", "chrome-siren", "cyber-punk", "dark-ace", "gold-phantom",
  "ice-queen", "neon-fox", "neon-viper", "red-wolf", "shadow-king",
  "steel-ghost", "tech-monk",
]);

/** Candidate audio URLs for a taunt, most-specific first. */
export function tauntUrls(character: string, key: string): string[] {
  const urls: string[] = [];
  if (TAUNT_VOICE_CHARACTERS.has(character)) urls.push(`/sounds/taunts/${character}/${key}.mp3`);
  urls.push(`/sounds/taunts/default/${key}.mp3`);
  urls.push(`/sounds/taunts/${key}.mp3`);
  return urls;
}
