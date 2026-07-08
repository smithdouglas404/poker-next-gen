import type { SyncConfig } from "./types.js";

/** Secrets are read from the environment only — never persisted to the state file. */
export interface Secrets {
  openProjectMcpToken?: string;
  openProjectApiToken?: string;
  anthropicApiKey?: string;
}

export interface RuntimeConfig {
  port: number;
  adminToken?: string;
  statePath: string;
}

function num(value: string | undefined, fallback: number): number {
  const n = value ? Number(value) : NaN;
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export const DEFAULT_MODEL = "claude-opus-4-8";
export const DEFAULT_INTERVAL_SECONDS = 3600;
/** Reasonable default; overridable in the MCP config once real tool names are known. */
export const DEFAULT_LIST_TOOL = "list_work_packages";

export function loadRuntimeConfig(env: NodeJS.ProcessEnv = process.env): RuntimeConfig {
  return {
    port: num(env.PORT, 8090),
    adminToken: env.OPENPROJECT_MCP_ADMIN_TOKEN,
    statePath: env.OPENPROJECT_MCP_STATE_PATH ?? "./data/state.json",
  };
}

export function loadSecrets(env: NodeJS.ProcessEnv = process.env): Secrets {
  return {
    openProjectMcpToken: env.OPENPROJECT_MCP_TOKEN || undefined,
    openProjectApiToken: env.OPENPROJECT_API_TOKEN || undefined,
    anthropicApiKey: env.ANTHROPIC_API_KEY || undefined,
  };
}

/** The config used the first time the service runs (before anything is saved). */
export function defaultConfig(env: NodeJS.ProcessEnv = process.env): SyncConfig {
  return {
    openProjectMcpUrl: env.OPENPROJECT_MCP_URL ?? "",
    openProjectApiBaseUrl: (env.OPENPROJECT_API_BASE_URL ?? "").replace(/\/$/, ""),
    intervalSeconds: num(env.OPENPROJECT_MCP_INTERVAL_SECONDS, DEFAULT_INTERVAL_SECONDS),
    enabled: true,
    model: env.OPENPROJECT_MCP_MODEL || DEFAULT_MODEL,
    listToolName: env.OPENPROJECT_MCP_LIST_TOOL || DEFAULT_LIST_TOOL,
    listToolArguments: { pageSize: 50, sortBy: [["updatedAt", "desc"]] },
    kgEnabled: env.FALKORDB_ENABLED !== "false",
    kgGraphName: env.FALKORDB_GRAPH || "openproject",
    kgRetrieveLimit: num(env.FALKORDB_RETRIEVE_LIMIT, 25),
  };
}

/** Validate and normalize a partial config patch coming from the Admin UI. */
export function sanitizeConfigPatch(patch: Record<string, unknown>): Partial<SyncConfig> {
  const out: Partial<SyncConfig> = {};
  if (typeof patch.openProjectMcpUrl === "string") {
    out.openProjectMcpUrl = patch.openProjectMcpUrl.trim();
  }
  if (typeof patch.openProjectApiBaseUrl === "string") {
    out.openProjectApiBaseUrl = patch.openProjectApiBaseUrl.trim().replace(/\/$/, "");
  }
  if (patch.intervalSeconds !== undefined) {
    const n = Number(patch.intervalSeconds);
    if (!Number.isFinite(n) || n < 60) {
      throw new Error("intervalSeconds must be a number >= 60");
    }
    out.intervalSeconds = Math.floor(n);
  }
  if (typeof patch.enabled === "boolean") out.enabled = patch.enabled;
  if (typeof patch.model === "string" && patch.model.trim()) out.model = patch.model.trim();
  if (typeof patch.listToolName === "string" && patch.listToolName.trim()) {
    out.listToolName = patch.listToolName.trim();
  }
  if (patch.listToolArguments && typeof patch.listToolArguments === "object") {
    out.listToolArguments = patch.listToolArguments as Record<string, unknown>;
  }
  if (typeof patch.kgEnabled === "boolean") out.kgEnabled = patch.kgEnabled;
  if (typeof patch.kgGraphName === "string" && patch.kgGraphName.trim()) {
    out.kgGraphName = patch.kgGraphName.trim();
  }
  if (patch.kgRetrieveLimit !== undefined) {
    const n = Number(patch.kgRetrieveLimit);
    if (!Number.isFinite(n) || n < 0) throw new Error("kgRetrieveLimit must be a number >= 0");
    out.kgRetrieveLimit = Math.floor(n);
  }
  return out;
}
