// Shared types for the Avatar Creator studio.

export interface Cosmetic {
  id: string;
  kind: string;
  name: string;
  rarity: string;
  asset_ref: string;
  preview_ref: string;
  price_cents?: number;
  /** Client-only marker: true for offline demo items (never live data). */
  demo?: boolean;
}

export interface Loadout {
  id: string;
  name: string;
  slots_json: string;
  created_at?: string;
  demo?: boolean;
}

export type JobStatus = "running" | "success" | "failed";

export interface GenerationJob {
  id: string;
  prompt: string;
  status: JobStatus;
  progress: number;
  cosmeticId?: string;
  demo?: boolean;
  startedAt: number;
}

export type EquippedMap = Record<string, string>;
