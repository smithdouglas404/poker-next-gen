import { loadRuntimeConfig, loadSecrets } from "./config.js";
import { createApp } from "./httpApi.js";
import {
  connectFalkorDb,
  loadFalkorConnection,
  noopKgClient,
  type KgClient,
} from "./kg.js";
import { connectOpenProjectMcp } from "./mcpClient.js";
import { createRestClient } from "./openproject.js";
import { createClaudeReviewer } from "./reviewer.js";
import { Scheduler } from "./scheduler.js";
import { Store } from "./store.js";
import { runSync, type Logger } from "./sync.js";

const logger: Logger = {
  info: (m) => console.log(`[info] ${m}`),
  warn: (m) => console.warn(`[warn] ${m}`),
  error: (m) => console.error(`[error] ${m}`),
};

async function main(): Promise<void> {
  const runtime = loadRuntimeConfig();
  const secrets = loadSecrets();
  const store = await Store.open(runtime.statePath);

  const reviewer = createClaudeReviewer({
    apiKey: secrets.anthropicApiKey,
    model: store.config.model,
  });

  // KG client is (re)built per run so config/enable changes take effect and a
  // dropped FalkorDB connection doesn't wedge the scheduler.
  async function openKg(): Promise<KgClient> {
    if (!store.config.kgEnabled) return noopKgClient;
    try {
      return await connectFalkorDb(loadFalkorConnection(), store.config.kgGraphName);
    } catch (e) {
      logger.warn(`KG connect failed, grounding disabled for this run: ${e instanceof Error ? e.message : e}`);
      return noopKgClient;
    }
  }

  const scheduler = new Scheduler(
    async (trigger) => {
      const kg = await openKg();
      try {
        return await runSync(
          {
            store,
            connectReader: () =>
              connectOpenProjectMcp(store.config.openProjectMcpUrl, secrets.openProjectMcpToken),
            rest: createRestClient({
              baseUrl: store.config.openProjectApiBaseUrl,
              token: secrets.openProjectApiToken ?? "",
            }),
            reviewer,
            kg,
            logger,
          },
          trigger,
        );
      } finally {
        await kg.close().catch(() => {});
      }
    },
    () => store.config.intervalSeconds,
    () => store.config.enabled,
    logger,
  );

  const app = createApp({
    store,
    scheduler,
    secrets,
    runtime,
    onConfigChange: () => scheduler.reschedule(),
  });

  app.listen(runtime.port, () => {
    logger.info(`openproject-mcp listening on :${runtime.port}`);
    logger.info(`sync interval=${store.config.intervalSeconds}s enabled=${store.config.enabled} kg=${store.config.kgEnabled}`);
  });
  scheduler.start();
}

main().catch((e) => {
  logger.error(`fatal: ${e instanceof Error ? e.stack ?? e.message : e}`);
  process.exit(1);
});
