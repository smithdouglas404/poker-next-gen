import type { KgClient } from "./kg.js";
import type { McpCaller } from "./mcpClient.js";
import { readWorkPackages } from "./mcpClient.js";
import type { RestClient } from "./openproject.js";
import { formatReviewComment, type Reviewer } from "./reviewer.js";
import type { Store } from "./store.js";
import type { LastRun, ReviewRecord, WorkPackage } from "./types.js";

export interface Logger {
  info(msg: string): void;
  warn(msg: string): void;
  error(msg: string): void;
}

const noopLogger: Logger = { info() {}, warn() {}, error() {} };

export interface SyncDeps {
  store: Store;
  /** Opens a fresh MCP connection per run (closed in finally). */
  connectReader: () => Promise<McpCaller>;
  rest: RestClient;
  reviewer: Reviewer;
  kg: KgClient;
  now?: () => Date;
  logger?: Logger;
}

/** The change key: prefer lockVersion (monotonic), fall back to updatedAt. */
export function changeKey(wp: WorkPackage): string {
  if (wp.lockVersion !== null && wp.lockVersion !== undefined) return `v${wp.lockVersion}`;
  return wp.updatedAt ?? "";
}

/**
 * One sync cycle: list work packages via the OpenProject MCP server, detect
 * which have changed since we last reviewed them, review each (grounded on the
 * FalkorDB knowledge graph), post the review back via REST, and ingest the
 * review into the graph. Idempotent — an unchanged work package is skipped.
 */
export async function runSync(
  deps: SyncDeps,
  trigger: "schedule" | "manual",
): Promise<LastRun> {
  const logger = deps.logger ?? noopLogger;
  const now = deps.now ?? (() => new Date());
  const config = deps.store.config;
  const errors: string[] = [];
  let fetched: WorkPackage[] = [];

  const reader = await deps.connectReader();
  try {
    fetched = await readWorkPackages(reader, config);
    logger.info(`sync: fetched ${fetched.length} work package(s) from MCP`);
  } finally {
    await reader.close().catch((e) => logger.warn(`sync: MCP close failed: ${e}`));
  }

  const changed = fetched.filter((wp) => deps.store.reviewedKey(wp.id) !== changeKey(wp));
  logger.info(`sync: ${changed.length} changed since last review`);

  let reviewed = 0;
  let posted = 0;

  for (const wp of changed) {
    const key = changeKey(wp);
    const at = now().toISOString();
    try {
      const grounding = await deps.kg.retrieve(wp, config.kgRetrieveLimit);
      const review = await deps.reviewer.review(wp, grounding);
      reviewed += 1;

      const comment = formatReviewComment(review, grounding);
      await deps.rest.postComment(wp.id, comment);
      posted += 1;

      const record: ReviewRecord = { ...review, id: `${wp.id}:${at}`, at, posted: true };
      await deps.store.recordReview(record, key);

      try {
        await deps.kg.ingest(review, wp, at);
      } catch (e) {
        const msg = `KG ingest failed for #${wp.id}: ${e instanceof Error ? e.message : e}`;
        logger.warn(`sync: ${msg}`);
        errors.push(msg);
      }
    } catch (e) {
      const msg = `review/post failed for #${wp.id}: ${e instanceof Error ? e.message : e}`;
      logger.error(`sync: ${msg}`);
      errors.push(msg);
      const record: ReviewRecord = {
        workPackageId: wp.id,
        subject: wp.subject,
        insight: "",
        recommendation: "",
        methodology: "",
        id: `${wp.id}:${at}`,
        at,
        posted: false,
        error: e instanceof Error ? e.message : String(e),
      };
      await deps.store.recordReview(record, key);
    }
  }

  const maxUpdatedAt = fetched
    .map((wp) => wp.updatedAt)
    .filter((v): v is string => !!v)
    .sort()
    .at(-1);
  await deps.store.setCursor(maxUpdatedAt ?? now().toISOString());

  const run: LastRun = {
    at: now().toISOString(),
    trigger,
    fetched: fetched.length,
    changed: changed.length,
    reviewed,
    posted,
    errors,
  };
  await deps.store.setLastRun(run);
  logger.info(`sync: done reviewed=${reviewed} posted=${posted} errors=${errors.length}`);
  return run;
}
