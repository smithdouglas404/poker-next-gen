/**
 * Typed fetch client for the engine-math (rs_poker) HTTP sidecar.
 *
 * Golden Rule #4: shuffle, hand rank, showdown, and equity ALWAYS go through
 * engine-math (rs_poker). This client never computes poker math locally — it is
 * a thin, typed transport over the endpoints defined in
 * `engine-math/src/server.rs`. If the sidecar is unreachable, calls throw and
 * the MCP tool surfaces the failure rather than inventing a number.
 *
 * Endpoints mirrored here (all POST, JSON in/out):
 *   - /gto/solve   -> real CFR (PCFR+) solve for the exact heads-up spot
 *   - /equity      -> Monte-Carlo equity for known hole cards + board
 *   - /gto/advise  -> equity-heuristic advice (pot odds / EV of call)
 *   - /health      -> liveness (GET)
 *
 * NOTE: `/outs` and `/equity/range` are named in the Phase-2 brief but are
 * Phase-1b follow-ups that do not yet exist in engine-math (see
 * docs/CAPABILITY-WIRING.md). They are intentionally omitted here so the client
 * only calls endpoints that actually exist; add them once the Rust sidecar
 * exposes them.
 */

const DEFAULT_ENGINE_MATH_URL = "http://localhost:8080";

export function engineMathBaseUrl(): string {
  return (process.env.ENGINE_MATH_URL ?? DEFAULT_ENGINE_MATH_URL).replace(/\/+$/, "");
}

/** Request body for POST /gto/solve (server.rs: CfrAdviseRequest). */
export interface CfrSolveRequest {
  hero_hole: string;
  villain_hole: string;
  board?: string;
  hero_stack: number;
  villain_stack: number;
  pot?: number;
  to_call?: number;
  deadline_ms?: number;
  iterations?: number;
}

/** Response body for POST /gto/solve (lib.rs: CfrAdvice). */
export interface CfrAdvice {
  suggested_action: string;
  amount: number;
  hero_equity: number;
  nodes_explored: number;
  iterations: number;
  deadline_ms: number;
  /** false => solve was truncated and biases toward fold; treat as low confidence. */
  converged: boolean;
  engine: string;
  solver: string;
  note: string;
}

/** Request body for POST /equity (server.rs: EquityRequest). */
export interface EquityRequest {
  holes: string[];
  board: string;
  iterations?: number;
}

/** Response body for POST /equity (server.rs: EquityResponse). */
export interface EquityResponse {
  equity: number[];
  iterations: number;
}

/** Request body for POST /gto/advise (server.rs: GtoAdviseRequest). */
export interface GtoAdviseRequest {
  hero_hole: string;
  villain_holes: string[];
  board: string;
  pot: number;
  to_call: number;
  iterations?: number;
}

/** Response body for POST /gto/advise (lib.rs: GtoAdvice). */
export interface GtoAdvice {
  suggested_action: string;
  hero_equity: number;
  pot_odds: number;
  ev_call: number;
  engine: string;
  note: string;
  rationale: string;
}

export interface HealthResponse {
  status: string;
  engine: string;
  library: string;
}

/** Raised when the engine-math sidecar is unreachable or returns non-2xx. */
export class EngineMathError extends Error {
  constructor(
    message: string,
    readonly endpoint: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "EngineMathError";
  }
}

async function postJson<TReq, TRes>(path: string, body: TReq): Promise<TRes> {
  const url = `${engineMathBaseUrl()}${path}`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (err) {
    throw new EngineMathError(
      `engine-math unreachable at ${url}: ${(err as Error).message}. ` +
        `Is the rs_poker sidecar running? Set ENGINE_MATH_URL if it is elsewhere.`,
      path,
    );
  }
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new EngineMathError(
      `engine-math ${path} returned ${res.status}${detail ? `: ${detail}` : ""}`,
      path,
      res.status,
    );
  }
  return (await res.json()) as TRes;
}

/** Real CFR solve for the exact heads-up spot. */
export function cfrSolve(req: CfrSolveRequest): Promise<CfrAdvice> {
  return postJson<CfrSolveRequest, CfrAdvice>("/gto/solve", req);
}

/** Monte-Carlo equity for known hole cards + board. Index i => equity of holes[i]. */
export function equity(req: EquityRequest): Promise<EquityResponse> {
  return postJson<EquityRequest, EquityResponse>("/equity", req);
}

/** Equity-heuristic advice (pot odds / EV of call) against one or more villains. */
export function gtoAdvise(req: GtoAdviseRequest): Promise<GtoAdvice> {
  return postJson<GtoAdviseRequest, GtoAdvice>("/gto/advise", req);
}

/** Liveness probe (GET /health). */
export async function health(): Promise<HealthResponse> {
  const url = `${engineMathBaseUrl()}/health`;
  let res: Response;
  try {
    res = await fetch(url, { method: "GET" });
  } catch (err) {
    throw new EngineMathError(
      `engine-math unreachable at ${url}: ${(err as Error).message}`,
      "/health",
    );
  }
  if (!res.ok) {
    throw new EngineMathError(`engine-math /health returned ${res.status}`, "/health", res.status);
  }
  return (await res.json()) as HealthResponse;
}
