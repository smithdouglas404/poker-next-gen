import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

import type { SyncConfig, WorkPackage } from "./types.js";

/** Minimal surface of an MCP tool caller, so sync can be tested without a real server. */
export interface McpCaller {
  listToolNames(): Promise<string[]>;
  callTool(name: string, args: Record<string, unknown>): Promise<unknown>;
  close(): Promise<void>;
}

function asString(v: unknown): string | undefined {
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  return undefined;
}

function pick(obj: Record<string, unknown>, ...keys: string[]): unknown {
  for (const k of keys) {
    if (obj[k] !== undefined && obj[k] !== null) return obj[k];
  }
  return undefined;
}

/** Extract a nested embedded name, e.g. { status: { name } } or { _links: { status: { title } } }. */
function embeddedName(el: Record<string, unknown>, key: string): string | undefined {
  const embedded = el["_embedded"] as Record<string, unknown> | undefined;
  const fromEmbedded = embedded?.[key] as Record<string, unknown> | undefined;
  if (fromEmbedded && typeof fromEmbedded.name === "string") return fromEmbedded.name;
  const links = el["_links"] as Record<string, unknown> | undefined;
  const fromLinks = links?.[key] as Record<string, unknown> | undefined;
  if (fromLinks && typeof fromLinks.title === "string") return fromLinks.title;
  return asString(el[key]);
}

function elementToWorkPackage(el: Record<string, unknown>): WorkPackage | null {
  const id = asString(pick(el, "id", "workPackageId", "work_package_id"));
  if (!id) return null;
  const description = el["description"];
  const descText =
    typeof description === "string"
      ? description
      : asString((description as Record<string, unknown> | undefined)?.raw);
  return {
    id,
    subject: asString(pick(el, "subject", "title", "name")) ?? `#${id}`,
    updatedAt: asString(pick(el, "updatedAt", "updated_at", "updatedOn")) ?? null,
    lockVersion: ((): number | null => {
      const lv = pick(el, "lockVersion", "lock_version");
      return typeof lv === "number" ? lv : lv !== undefined ? Number(lv) : null;
    })(),
    status: embeddedName(el, "status"),
    type: embeddedName(el, "type"),
    priority: embeddedName(el, "priority"),
    percentageDone: ((): number | undefined => {
      const p = pick(el, "percentageDone", "percentage_done");
      return typeof p === "number" ? p : undefined;
    })(),
    description: descText,
    raw: el,
  };
}

/**
 * Normalize whatever the OpenProject MCP list tool returns into WorkPackages.
 * Handles the common shapes: a bare array, { workPackages: [...] },
 * OpenProject's HAL { _embedded: { elements: [...] } }, or JSON-encoded text
 * content blocks. Pure and unit-tested.
 */
export function parseWorkPackages(payload: unknown): WorkPackage[] {
  let root: unknown = payload;

  // MCP tool results wrap output as { structuredContent, content: [{type,text}] }.
  if (root && typeof root === "object" && !Array.isArray(root)) {
    const obj = root as Record<string, unknown>;
    if (obj.structuredContent !== undefined) {
      root = obj.structuredContent;
    } else if (Array.isArray(obj.content)) {
      const textBlock = (obj.content as Array<Record<string, unknown>>).find(
        (b) => b.type === "text" && typeof b.text === "string",
      );
      if (textBlock) {
        try {
          root = JSON.parse(textBlock.text as string);
        } catch {
          /* not JSON — fall through */
        }
      }
    }
  }

  const elements = extractElements(root);
  const out: WorkPackage[] = [];
  for (const el of elements) {
    if (el && typeof el === "object") {
      const wp = elementToWorkPackage(el as Record<string, unknown>);
      if (wp) out.push(wp);
    }
  }
  return out;
}

function extractElements(root: unknown): unknown[] {
  if (Array.isArray(root)) return root;
  if (root && typeof root === "object") {
    const obj = root as Record<string, unknown>;
    const embedded = obj["_embedded"] as Record<string, unknown> | undefined;
    if (embedded && Array.isArray(embedded.elements)) return embedded.elements;
    for (const key of ["workPackages", "work_packages", "elements", "results", "items", "data"]) {
      if (Array.isArray(obj[key])) return obj[key] as unknown[];
    }
  }
  return [];
}

/** Call the configured list tool and parse the result into work packages. */
export async function readWorkPackages(
  caller: McpCaller,
  config: SyncConfig,
): Promise<WorkPackage[]> {
  const payload = await caller.callTool(config.listToolName, config.listToolArguments ?? {});
  return parseWorkPackages(payload);
}

/** Open a real MCP client against the OpenProject Streamable HTTP endpoint. */
export async function connectOpenProjectMcp(
  url: string,
  token?: string,
): Promise<McpCaller> {
  if (!url) throw new Error("OpenProject MCP URL is not configured");
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;

  const transport = new StreamableHTTPClientTransport(new URL(url), {
    requestInit: { headers },
  });
  const client = new Client(
    { name: "openproject-review-agent", version: "0.1.0" },
    { capabilities: {} },
  );
  await client.connect(transport);

  return {
    async listToolNames() {
      const res = await client.listTools();
      return res.tools.map((t) => t.name);
    },
    async callTool(name, args) {
      return client.callTool({ name, arguments: args });
    },
    async close() {
      await client.close();
    },
  };
}
