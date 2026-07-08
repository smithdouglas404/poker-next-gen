import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import { defaultConfig } from "./config.js";
import type { LastRun, ReviewRecord, State, SyncConfig } from "./types.js";

const MAX_REVIEWS = 100;

function emptyState(env?: NodeJS.ProcessEnv): State {
  return {
    config: defaultConfig(env),
    cursor: { lastSyncAt: null },
    reviewedVersions: {},
    reviews: [],
    lastRun: null,
  };
}

/** Merge a loaded (possibly partial/old) state onto fresh defaults. */
function normalize(loaded: Partial<State>, env?: NodeJS.ProcessEnv): State {
  const base = emptyState(env);
  return {
    config: { ...base.config, ...(loaded.config ?? {}) },
    cursor: { ...base.cursor, ...(loaded.cursor ?? {}) },
    reviewedVersions: loaded.reviewedVersions ?? {},
    reviews: Array.isArray(loaded.reviews) ? loaded.reviews : [],
    lastRun: loaded.lastRun ?? null,
  };
}

/**
 * In-memory state with JSON-file persistence. Single-process; each mutation
 * schedules a write, and writes are serialized so they can't interleave.
 */
export class Store {
  private state: State;
  private writeChain: Promise<void> = Promise.resolve();

  private constructor(
    private readonly path: string,
    state: State,
  ) {
    this.state = state;
  }

  static async open(path: string, env: NodeJS.ProcessEnv = process.env): Promise<Store> {
    let state: State;
    try {
      const raw = await readFile(path, "utf8");
      state = normalize(JSON.parse(raw) as Partial<State>, env);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
      state = emptyState(env);
    }
    return new Store(path, state);
  }

  get config(): SyncConfig {
    return this.state.config;
  }

  get snapshot(): State {
    return this.state;
  }

  async setConfig(patch: Partial<SyncConfig>): Promise<SyncConfig> {
    this.state.config = { ...this.state.config, ...patch };
    await this.persist();
    return this.state.config;
  }

  reviewedKey(workPackageId: string): string | undefined {
    return this.state.reviewedVersions[workPackageId];
  }

  async recordReview(record: ReviewRecord, changeKey: string): Promise<void> {
    this.state.reviews.unshift(record);
    if (this.state.reviews.length > MAX_REVIEWS) {
      this.state.reviews.length = MAX_REVIEWS;
    }
    if (record.posted) {
      this.state.reviewedVersions[record.workPackageId] = changeKey;
    }
    await this.persist();
  }

  async setCursor(lastSyncAt: string | null): Promise<void> {
    this.state.cursor.lastSyncAt = lastSyncAt;
    await this.persist();
  }

  async setLastRun(run: LastRun): Promise<void> {
    this.state.lastRun = run;
    await this.persist();
  }

  private async persist(): Promise<void> {
    const payload = JSON.stringify(this.state, null, 2);
    this.writeChain = this.writeChain.then(async () => {
      await mkdir(dirname(this.path), { recursive: true });
      await writeFile(this.path, payload, "utf8");
    });
    return this.writeChain;
  }
}
