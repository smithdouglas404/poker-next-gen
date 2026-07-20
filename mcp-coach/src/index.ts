#!/usr/bin/env node
/**
 * mcp-coach — the agentic layer for poker-next-gen (Phase 2 of
 * docs/CAPABILITY-WIRING.md).
 *
 * A stdio MCP server exposing two Claude-backed tools:
 *
 *   1. analyze_spot — grounds a coaching explanation in the REAL engine.
 *      It first calls engine-math (rs_poker): /gto/solve for the CFR-optimal
 *      action, /equity for Monte-Carlo equity, and /gto/advise for pot-odds /
 *      EV-of-call. Claude then EXPLAINS those numbers — it never invents poker
 *      math (Golden Rule #4). Returns a concise coaching note + mistake alert.
 *
 *   2. flag_bot — an agent that reasons over a player's timing / sizing /
 *      frequency patterns and returns a structured bot-likelihood verdict.
 *      Complements the statistical scorer in backend-core/antibot.
 *
 * The engine computes; Claude explains. If engine-math is down, analyze_spot
 * fails loudly rather than fabricating equity.
 */

import Anthropic from "@anthropic-ai/sdk";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import {
  cfrSolve,
  equity,
  engineMathBaseUrl,
  gtoAdvise,
  type CfrAdvice,
  type EquityResponse,
  type GtoAdvice,
} from "./engineMath.js";

// Agent model. claude-opus-4-8 is the default; claude-sonnet-5 is a lower-cost
// alternative — both use adaptive thinking. Override via COACH_MODEL.
const COACH_MODEL = process.env.COACH_MODEL ?? "claude-opus-4-8";

/** Lazily construct the Anthropic client so the server can start without a key
 *  (a tool call without ANTHROPIC_API_KEY returns a clear error instead). */
let anthropic: Anthropic | null = null;
function anthropicClient(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error(
      "ANTHROPIC_API_KEY is not set. mcp-coach reads it from the environment at " +
        "call time; export it before invoking a tool.",
    );
  }
  if (!anthropic) anthropic = new Anthropic();
  return anthropic;
}

/** Collect the text blocks of a non-streaming Messages response. */
function messageText(message: Anthropic.Message): string {
  return message.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
}

async function askClaude(system: string, user: string): Promise<string> {
  const message = await anthropicClient().messages.create({
    model: COACH_MODEL,
    max_tokens: 4096,
    thinking: { type: "adaptive" },
    system,
    messages: [{ role: "user", content: user }],
  });
  if (message.stop_reason === "refusal") {
    return "The model declined to answer this request.";
  }
  return messageText(message) || "(no response text)";
}

// ---------------------------------------------------------------------------
// analyze_spot
// ---------------------------------------------------------------------------

const analyzeSpotShape = {
  hero_hole: z
    .string()
    .describe("Hero's two hole cards, rs_poker notation, e.g. 'AsKh' (no spaces)."),
  villain_hole: z
    .string()
    .describe(
      "Villain's two hole cards, e.g. 'QdQc'. A concrete hand is required for the " +
        "exact CFR solve and equity (engine-math has no range endpoint yet). For a " +
        "range read, pass the single most representative combo.",
    ),
  board: z
    .string()
    .default("")
    .describe("Community cards so far, e.g. 'Jh Ts 2c' or 'JhTs2c'. Empty preflop."),
  pot: z.number().nonnegative().describe("Current pot size in chips."),
  to_call: z.number().nonnegative().describe("Amount hero must call (0 if checked to)."),
  hero_stack: z
    .number()
    .positive()
    .default(100)
    .describe("Hero's remaining stack in chips (drives CFR bet sizing)."),
  villain_stack: z
    .number()
    .positive()
    .default(100)
    .describe("Villain's remaining stack in chips."),
  deadline_ms: z
    .number()
    .int()
    .positive()
    .default(5000)
    .describe("Wall-clock budget for the CFR solve. Higher => more likely to converge."),
} as const;

interface SpotEngineData {
  cfr: CfrAdvice | { error: string };
  equity: EquityResponse | { error: string };
  gto: GtoAdvice | { error: string };
}

async function gatherSpot(args: {
  hero_hole: string;
  villain_hole: string;
  board: string;
  pot: number;
  to_call: number;
  hero_stack: number;
  villain_stack: number;
  deadline_ms: number;
}): Promise<SpotEngineData> {
  const board = args.board.trim();
  const [cfr, eq, gto] = await Promise.allSettled([
    cfrSolve({
      hero_hole: args.hero_hole,
      villain_hole: args.villain_hole,
      board,
      hero_stack: args.hero_stack,
      villain_stack: args.villain_stack,
      pot: args.pot,
      to_call: args.to_call,
      deadline_ms: args.deadline_ms,
    }),
    equity({ holes: [args.hero_hole, args.villain_hole], board }),
    gtoAdvise({
      hero_hole: args.hero_hole,
      villain_holes: [args.villain_hole],
      board,
      pot: args.pot,
      to_call: args.to_call,
    }),
  ]);

  const unwrap = <T>(r: PromiseSettledResult<T>): T | { error: string } =>
    r.status === "fulfilled" ? r.value : { error: (r.reason as Error).message };

  return { cfr: unwrap(cfr), equity: unwrap(eq), gto: unwrap(gto) };
}

const ANALYZE_SYSTEM = `You are a world-class Texas Hold'em coach embedded in a live poker client.

You are given ground-truth numbers already computed by the rs_poker engine
(a real CFR/GTO solver plus Monte-Carlo equity). Your job is to EXPLAIN them,
not to recompute them. NEVER invent equity, pot odds, or an action that
contradicts the engine — if you want to cite a number, cite the engine's.

Rules:
- Treat engine-math output as authoritative. If the CFR solve reports
  converged=false, say the read is low-confidence (a truncated solve biases to
  fold) and lean on equity/pot-odds instead.
- If an engine call returned an error, work with what remains and say plainly
  which input was unavailable — do not fabricate a substitute.

Respond in three short sections, plain text, no markdown headers:
1. Read — 1-2 sentences on the situation and hero's standing.
2. Recommendation — the engine's suggested action, restated with the "why"
   (equity vs pot odds / EV). One or two sentences.
3. Mistake alert — if a plausible human line (e.g. calling wide, folding a
   value hand, over-bluffing) diverges from the engine, flag it in one sentence.
   If there's no notable trap, say "No major leak here." Keep it terse.`;

// ---------------------------------------------------------------------------
// flag_bot
// ---------------------------------------------------------------------------

const actionSchema = z
  .object({
    street: z
      .string()
      .optional()
      .describe("Betting street, e.g. 'preflop', 'flop', 'turn', 'river'."),
    action: z
      .string()
      .describe("Action taken, e.g. 'raise', 'call', 'fold', 'check', 'bet'."),
    sizing_bb: z
      .number()
      .optional()
      .describe("Bet/raise size in big blinds (omit for check/fold/call)."),
    pot_fraction: z
      .number()
      .optional()
      .describe("Bet size as a fraction of pot, e.g. 0.75 for a 3/4-pot bet."),
    decision_ms: z
      .number()
      .optional()
      .describe("Time taken to act, in milliseconds. Bots are often near-constant."),
  })
  .describe("One observed action in the sequence.");

const flagBotShape = {
  player_id: z.string().describe("Opaque identifier for the player under review."),
  hands_observed: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("How many hands the sample covers (context for confidence)."),
  actions: z
    .array(actionSchema)
    .min(1)
    .describe("Chronological sequence of the player's actions (timing, sizing, frequency)."),
  notes: z
    .string()
    .optional()
    .describe("Optional free-text context, e.g. multi-tabling count, session length."),
} as const;

const FLAG_BOT_SYSTEM = `You are an anti-bot analyst for an online poker network. You reason about
whether a player is likely an automated bot based on behavioral evidence:
timing regularity, bet-sizing granularity, action-frequency patterns, and
consistency across spots. You COMPLEMENT a separate statistical scorer, so
focus on qualitative reasoning a fixed score would miss.

Signals that raise bot-likelihood: near-constant decision times regardless of
spot complexity; robotic uniform sizings (always exactly 2.5x, always exactly
75% pot); superhuman consistency; instant actions in spots humans deliberate;
frequencies that match a solver too tightly. Signals that lower it: variable
timing correlated with decision difficulty, mixed/irregular sizings, human
tells like tanking then snap-folding, small samples.

Be calibrated and cite the specific evidence. A small sample must lower your
confidence. Do not accuse on thin evidence.

Return ONLY a JSON object (no prose, no code fences) with this exact shape:
{
  "verdict": "human" | "likely_bot" | "uncertain",
  "confidence": <number 0.0-1.0>,
  "bot_likelihood": <number 0.0-1.0>,
  "signals": [ { "signal": <string>, "direction": "bot" | "human", "weight": "low"|"medium"|"high" } ],
  "reasoning": <string, 1-3 sentences>,
  "recommended_action": "none" | "monitor" | "flag_for_review" | "restrict"
}`;

// ---------------------------------------------------------------------------
// Server wiring
// ---------------------------------------------------------------------------

function buildServer(): McpServer {
  const server = new McpServer({
    name: "mcp-coach",
    version: "0.1.0",
  });

  server.registerTool(
    "analyze_spot",
    {
      title: "Analyze poker spot",
      description:
        "Coach a specific hold'em decision. Calls engine-math (rs_poker) for the " +
        "CFR-optimal action, Monte-Carlo equity, and pot-odds/EV, then has Claude " +
        "produce a concise coaching explanation + mistake alert grounded in those " +
        "engine numbers. Requires the engine-math sidecar and ANTHROPIC_API_KEY.",
      inputSchema: analyzeSpotShape,
    },
    async (args) => {
      let engineData: SpotEngineData;
      try {
        engineData = await gatherSpot(args);
      } catch (err) {
        return {
          isError: true,
          content: [{ type: "text", text: `engine-math call failed: ${(err as Error).message}` }],
        };
      }

      // If every engine call failed, don't spend a Claude call inventing math.
      const allFailed =
        "error" in engineData.cfr &&
        "error" in engineData.equity &&
        "error" in engineData.gto;
      if (allFailed) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text:
                `engine-math (${engineMathBaseUrl()}) returned no usable data — cannot ` +
                `ground a coaching answer.\n` +
                `cfr: ${(engineData.cfr as { error: string }).error}\n` +
                `equity: ${(engineData.equity as { error: string }).error}\n` +
                `gto: ${(engineData.gto as { error: string }).error}`,
            },
          ],
        };
      }

      const userPrompt =
        `Spot:\n` +
        `  hero_hole: ${args.hero_hole}\n` +
        `  villain_hole: ${args.villain_hole}\n` +
        `  board: ${args.board.trim() || "(preflop)"}\n` +
        `  pot: ${args.pot}\n` +
        `  to_call: ${args.to_call}\n` +
        `  hero_stack: ${args.hero_stack}, villain_stack: ${args.villain_stack}\n\n` +
        `Engine results (rs_poker — authoritative):\n` +
        `  /gto/solve (CFR): ${JSON.stringify(engineData.cfr)}\n` +
        `  /equity: ${JSON.stringify(engineData.equity)}  (index 0 = hero, 1 = villain)\n` +
        `  /gto/advise: ${JSON.stringify(engineData.gto)}\n\n` +
        `Explain this spot to the player.`;

      let coaching: string;
      try {
        coaching = await askClaude(ANALYZE_SYSTEM, userPrompt);
      } catch (err) {
        return {
          isError: true,
          content: [{ type: "text", text: `Claude call failed: ${(err as Error).message}` }],
        };
      }

      return {
        content: [{ type: "text", text: coaching }],
        structuredContent: {
          coaching,
          engine: engineData,
        },
      };
    },
  );

  server.registerTool(
    "flag_bot",
    {
      title: "Flag likely bot",
      description:
        "Assess whether a player is likely an automated bot by reasoning over a " +
        "sequence of their actions (timing, sizing, frequency). Returns a structured " +
        "verdict with confidence, weighted signals, and a recommended action. " +
        "Complements the statistical scorer in backend-core/antibot. Requires " +
        "ANTHROPIC_API_KEY (no engine-math dependency).",
      inputSchema: flagBotShape,
    },
    async (args) => {
      const userPrompt =
        `Player under review: ${args.player_id}\n` +
        (args.hands_observed ? `Hands observed: ${args.hands_observed}\n` : "") +
        (args.notes ? `Context: ${args.notes}\n` : "") +
        `\nAction sequence (chronological):\n${JSON.stringify(args.actions, null, 2)}\n\n` +
        `Produce the bot-likelihood verdict as specified.`;

      let raw: string;
      try {
        raw = await askClaude(FLAG_BOT_SYSTEM, userPrompt);
      } catch (err) {
        return {
          isError: true,
          content: [{ type: "text", text: `Claude call failed: ${(err as Error).message}` }],
        };
      }

      // Try to parse the JSON verdict for structuredContent; always return text.
      let structured: unknown = undefined;
      try {
        const jsonText = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
        structured = JSON.parse(jsonText);
      } catch {
        // Leave structured undefined if the model didn't return clean JSON.
      }

      return {
        content: [{ type: "text", text: raw }],
        ...(structured !== undefined ? { structuredContent: { verdict: structured } } : {}),
      };
    },
  );

  return server;
}

async function main(): Promise<void> {
  const server = buildServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // stdout is the MCP transport — log to stderr only.
  console.error(
    `mcp-coach ready (model=${COACH_MODEL}, engine-math=${engineMathBaseUrl()})`,
  );
}

main().catch((err) => {
  console.error("mcp-coach fatal:", err);
  process.exit(1);
});
