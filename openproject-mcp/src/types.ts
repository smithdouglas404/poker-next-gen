/** A work package surfaced by the OpenProject MCP server. */
export interface WorkPackage {
  id: string;
  subject: string;
  updatedAt: string | null;
  /** OpenProject lockVersion — increments on every change. Primary change signal. */
  lockVersion: number | null;
  status?: string;
  type?: string;
  priority?: string;
  percentageDone?: number;
  description?: string;
  /** The raw element as returned by the MCP server, for prompt grounding. */
  raw?: unknown;
}

/** The three-part assessment the Claude agent produces for a changed record. */
export interface Review {
  workPackageId: string;
  subject: string;
  insight: string;
  recommendation: string;
  methodology: string;
}

/** A persisted review, including whether it was posted back to OpenProject. */
export interface ReviewRecord extends Review {
  id: string;
  at: string;
  posted: boolean;
  error?: string;
}

/** User-editable sync configuration (persisted; secrets are NOT stored here). */
export interface SyncConfig {
  /** OpenProject MCP endpoint, e.g. https://openproject.example.com/mcp */
  openProjectMcpUrl: string;
  /** OpenProject instance base URL for REST write-back (no trailing /api/v3). */
  openProjectApiBaseUrl: string;
  /** Sync cadence in seconds. This is the value the "MCP config" page edits. */
  intervalSeconds: number;
  /** Whether the scheduled hourly sync is active. */
  enabled: boolean;
  /** Claude model used for the review. */
  model: string;
  /** Name of the OpenProject MCP tool used to list work packages. Configurable
   *  because the official server does not publish stable verbatim tool names. */
  listToolName: string;
  /** Arguments passed to the list tool (filters, page size, etc.). */
  listToolArguments: Record<string, unknown>;
  /** Whether to ground reviews on the FalkorDB knowledge graph. */
  kgEnabled: boolean;
  /** FalkorDB graph key to query/ingest against. */
  kgGraphName: string;
  /** Max grounding facts (graph rows) to pull into the review prompt. */
  kgRetrieveLimit: number;
}

/** A single fact retrieved from the knowledge graph, used to ground a review. */
export interface GroundingFact {
  text: string;
  source?: string;
}

/** Outcome of a single sync run. */
export interface LastRun {
  at: string;
  trigger: "schedule" | "manual";
  fetched: number;
  changed: number;
  reviewed: number;
  posted: number;
  errors: string[];
}

/** The full persisted state. */
export interface State {
  config: SyncConfig;
  cursor: { lastSyncAt: string | null };
  /** workPackageId -> the change key (lockVersion or updatedAt) last reviewed. */
  reviewedVersions: Record<string, string>;
  reviews: ReviewRecord[];
  lastRun: LastRun | null;
}
