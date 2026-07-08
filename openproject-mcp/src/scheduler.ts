import type { LastRun } from "./types.js";
import type { Logger } from "./sync.js";

type RunFn = (trigger: "schedule" | "manual") => Promise<LastRun>;

/**
 * Chained-timeout scheduler. The interval is read fresh before each tick, so
 * editing it in the MCP config takes effect on the next cycle. Overlapping runs
 * are prevented — a trigger while a run is in flight is reported as skipped.
 */
export class Scheduler {
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    private readonly runFn: RunFn,
    private readonly getIntervalSeconds: () => number,
    private readonly isEnabled: () => boolean,
    private readonly logger: Logger,
  ) {}

  start(): void {
    this.schedule();
  }

  /** Re-arm the timer (call after the interval changes). */
  reschedule(): void {
    this.schedule();
  }

  stop(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
  }

  get isRunning(): boolean {
    return this.running;
  }

  /** Run now. Returns null if a run is already in progress. */
  async trigger(source: "schedule" | "manual"): Promise<LastRun | null> {
    if (this.running) {
      this.logger.warn(`scheduler: ${source} trigger skipped — a run is already in progress`);
      return null;
    }
    this.running = true;
    try {
      return await this.runFn(source);
    } catch (e) {
      this.logger.error(`scheduler: run failed: ${e instanceof Error ? e.message : e}`);
      throw e;
    } finally {
      this.running = false;
    }
  }

  private schedule(): void {
    if (this.timer) clearTimeout(this.timer);
    const seconds = Math.max(60, this.getIntervalSeconds());
    this.timer = setTimeout(() => void this.tick(), seconds * 1000);
  }

  private async tick(): Promise<void> {
    if (this.isEnabled()) {
      await this.trigger("schedule").catch(() => {});
    }
    this.schedule();
  }
}
