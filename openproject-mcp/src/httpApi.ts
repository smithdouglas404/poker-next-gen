import express, { type Express, type NextFunction, type Request, type Response } from "express";

import { sanitizeConfigPatch, type RuntimeConfig, type Secrets } from "./config.js";
import type { Scheduler } from "./scheduler.js";
import type { Store } from "./store.js";

export interface ApiContext {
  store: Store;
  scheduler: Scheduler;
  secrets: Secrets;
  runtime: RuntimeConfig;
  onConfigChange: () => void;
}

/** Which secrets/connections are present, so the Admin UI can show readiness. */
function readiness(ctx: ApiContext) {
  return {
    openProjectMcpUrl: !!ctx.store.config.openProjectMcpUrl,
    openProjectMcpToken: !!ctx.secrets.openProjectMcpToken,
    openProjectApiBaseUrl: !!ctx.store.config.openProjectApiBaseUrl,
    openProjectApiToken: !!ctx.secrets.openProjectApiToken,
    anthropicApiKey: !!ctx.secrets.anthropicApiKey,
  };
}

export function createApp(ctx: ApiContext): Express {
  const app = express();
  app.use(express.json({ limit: "1mb" }));

  app.get("/health", (_req, res) => {
    res.json({
      ok: true,
      service: "openproject-mcp",
      running: ctx.scheduler.isRunning,
      kgEnabled: ctx.store.config.kgEnabled,
    });
  });

  // Bearer-token auth for everything under /api.
  const auth = (req: Request, res: Response, next: NextFunction) => {
    if (!ctx.runtime.adminToken) {
      res.status(503).json({ error: "OPENPROJECT_MCP_ADMIN_TOKEN is not configured" });
      return;
    }
    const header = req.header("authorization") ?? "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : "";
    if (token !== ctx.runtime.adminToken) {
      res.status(401).json({ error: "unauthorized" });
      return;
    }
    next();
  };

  app.get("/api/config", auth, (_req, res) => {
    res.json({ config: ctx.store.config });
  });

  app.put("/api/config", auth, async (req, res) => {
    try {
      const patch = sanitizeConfigPatch((req.body ?? {}) as Record<string, unknown>);
      const config = await ctx.store.setConfig(patch);
      ctx.onConfigChange();
      res.json({ config });
    } catch (e) {
      res.status(400).json({ error: e instanceof Error ? e.message : "invalid config" });
    }
  });

  app.get("/api/status", auth, (_req, res) => {
    const s = ctx.store.snapshot;
    res.json({
      config: s.config,
      cursor: s.cursor,
      lastRun: s.lastRun,
      running: ctx.scheduler.isRunning,
      readiness: readiness(ctx),
    });
  });

  app.get("/api/reviews", auth, (_req, res) => {
    res.json({ reviews: ctx.store.snapshot.reviews });
  });

  app.post("/api/review-now", auth, async (_req, res) => {
    try {
      const run = await ctx.scheduler.trigger("manual");
      if (!run) {
        res.status(409).json({ error: "a sync run is already in progress" });
        return;
      }
      res.json({ run });
    } catch (e) {
      res.status(500).json({ error: e instanceof Error ? e.message : "review-now failed" });
    }
  });

  return app;
}
