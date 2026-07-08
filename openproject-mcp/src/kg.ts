import type { GroundingFact, Review, WorkPackage } from "./types.js";

/**
 * Minimal graph query surface (a thin slice of the FalkorDB client), so the KG
 * grounding/ingest logic can be unit-tested without a live database.
 */
export interface GraphQuerier {
  query(cypher: string, params?: Record<string, unknown>): Promise<GraphResult>;
  close(): Promise<void>;
}

export interface GraphResult {
  data?: Array<Record<string, unknown>>;
}

export interface KgClient {
  /** Pull the relevant subgraph for a work package as grounding facts. */
  retrieve(wp: WorkPackage, limit: number): Promise<GroundingFact[]>;
  /** Write a completed review back into the graph as new nodes/edges. */
  ingest(review: Review, wp: WorkPackage, at: string): Promise<void>;
  close(): Promise<void>;
}

/** Default Cypher: find nodes referencing the work package (by id or subject text)
 *  and their immediate neighbours. Adjust to match your FalkorDB schema. */
export const RETRIEVE_CYPHER = `
MATCH (n)
WHERE n.workPackageId = $wpId OR n.id = $wpId OR n.op_id = $wpId
   OR (n.name IS NOT NULL AND toLower(toString(n.name)) CONTAINS toLower($term))
   OR (n.title IS NOT NULL AND toLower(toString(n.title)) CONTAINS toLower($term))
OPTIONAL MATCH (n)-[r]-(m)
RETURN n, r, m
LIMIT $limit
`.trim();

/** Default Cypher: upsert the work package node and attach the review. */
export const INGEST_CYPHER = `
MERGE (w:WorkPackage {id: $wpId})
SET w.subject = $subject, w.lastReviewedAt = $at
CREATE (r:Review {reviewId: $reviewId, at: $at, insight: $insight,
                  recommendation: $recommendation, methodology: $methodology})
MERGE (w)-[:HAS_REVIEW]->(r)
`.trim();

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

/** Turn a graph node (FalkorDB Node-ish) into a readable "Label {k: v}" string. */
export function nodeText(value: unknown): string | null {
  if (!isRecord(value)) return null;
  const labels = value.labels;
  const props = (isRecord(value.properties) ? value.properties : value) as Record<string, unknown>;
  const label = Array.isArray(labels) && labels.length ? labels.join(":") : "Node";
  const entries = Object.entries(props)
    .filter(([k]) => k !== "labels" && k !== "properties" && k !== "id")
    .slice(0, 8)
    .map(([k, v]) => `${k}: ${JSON.stringify(v)}`);
  return `(${label} {${entries.join(", ")}})`;
}

function relText(value: unknown): string | null {
  if (!isRecord(value)) return null;
  const type = value.relation ?? value.relationshipType ?? value.type;
  return typeof type === "string" ? `-[:${type}]-` : null;
}

/** Convert graph result rows into deduplicated, readable grounding facts. */
export function rowsToFacts(rows: Array<Record<string, unknown>> | undefined): GroundingFact[] {
  if (!rows) return [];
  const seen = new Set<string>();
  const facts: GroundingFact[] = [];
  for (const row of rows) {
    const n = nodeText(row.n ?? row.node);
    const r = relText(row.r ?? row.rel);
    const m = nodeText(row.m);
    let text: string | null = null;
    if (n && r && m) text = `${n} ${r} ${m}`;
    else if (n) text = n;
    else if (m) text = m;
    if (text && !seen.has(text)) {
      seen.add(text);
      facts.push({ text, source: "falkordb" });
    }
  }
  return facts;
}

function firstTerm(subject: string): string {
  return (subject.split(/\s+/).find((w) => w.length > 2) ?? subject).slice(0, 64);
}

/** KG client backed by a GraphQuerier (FalkorDB in prod, a fake in tests). */
export function createKgClient(querier: GraphQuerier): KgClient {
  return {
    async retrieve(wp, limit) {
      if (limit <= 0) return [];
      const res = await querier.query(RETRIEVE_CYPHER, {
        wpId: wp.id,
        term: firstTerm(wp.subject),
        limit,
      });
      return rowsToFacts(res.data);
    },
    async ingest(review, wp, at) {
      await querier.query(INGEST_CYPHER, {
        wpId: wp.id,
        subject: wp.subject,
        at,
        reviewId: `${wp.id}:${at}`,
        insight: review.insight,
        recommendation: review.recommendation,
        methodology: review.methodology,
      });
    },
    async close() {
      await querier.close();
    },
  };
}

/** Used when KG grounding is disabled or unconfigured — grounds on nothing. */
export const noopKgClient: KgClient = {
  async retrieve() {
    return [];
  },
  async ingest() {
    /* no-op */
  },
  async close() {
    /* no-op */
  },
};

/** Build FalkorDB connection options from the environment. */
export function loadFalkorConnection(
  env: NodeJS.ProcessEnv = process.env,
): Record<string, unknown> {
  if (env.FALKORDB_URL) return { url: env.FALKORDB_URL };
  const socket: Record<string, unknown> = {
    host: env.FALKORDB_HOST || "localhost",
    port: env.FALKORDB_PORT ? Number(env.FALKORDB_PORT) : 6379,
  };
  const opts: Record<string, unknown> = { socket };
  if (env.FALKORDB_USERNAME) opts.username = env.FALKORDB_USERNAME;
  if (env.FALKORDB_PASSWORD) opts.password = env.FALKORDB_PASSWORD;
  return opts;
}

/** Connect a real FalkorDB-backed KG client. Imported lazily so the dependency
 *  is only loaded when KG grounding is actually enabled. */
export async function connectFalkorDb(
  connection: Record<string, unknown>,
  graphName: string,
): Promise<KgClient> {
  const { FalkorDB } = await import("falkordb");
  const client = await FalkorDB.connect(connection as never);
  const graph = client.selectGraph(graphName);
  const querier: GraphQuerier = {
    async query(cypher, params) {
      const res = await graph.query(cypher, params ? ({ params } as never) : undefined);
      return res as GraphResult;
    },
    async close() {
      await client.close();
    },
  };
  return createKgClient(querier);
}
