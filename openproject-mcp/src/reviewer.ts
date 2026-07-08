import Anthropic from "@anthropic-ai/sdk";

import type { GroundingFact, Review, WorkPackage } from "./types.js";

export interface Reviewer {
  review(wp: WorkPackage, grounding: GroundingFact[]): Promise<Review>;
}

/** JSON schema the model output is constrained to (structured outputs). */
const REVIEW_JSON_SCHEMA = {
  type: "object",
  properties: {
    insight: {
      type: "string",
      description: "What changed and what it means, grounded in the KG facts.",
    },
    recommendation: {
      type: "string",
      description: "Concrete next step(s) for this work package.",
    },
    methodology: {
      type: "string",
      description: "Recommended method/process/framework to apply, grounded in the KG facts.",
    },
  },
  required: ["insight", "recommendation", "methodology"],
  additionalProperties: false,
} as const;

export const REVIEW_SYSTEM = `You are a project delivery analyst reviewing a change to an OpenProject work package.
You are given the current state of the work package and a set of grounding facts retrieved from a knowledge graph (FalkorDB).
Ground every claim in the provided facts and the work package fields. Do not invent facts that are not supported.
When a fact informs a statement, refer to it explicitly (e.g. "per the knowledge graph, ...").
If the grounding facts are empty, say so and keep the review conservative and generic.
Produce three concise, actionable parts: an insight, a recommendation, and a methodology recommendation.`;

/** Build the user prompt for a single work-package review. Pure + testable. */
export function buildReviewPrompt(wp: WorkPackage, grounding: GroundingFact[]): string {
  const facts = grounding.length
    ? grounding.map((f, i) => `[KG-${i + 1}] ${f.text}`).join("\n")
    : "(no grounding facts were retrieved from the knowledge graph)";

  const fields = [
    `id: ${wp.id}`,
    `subject: ${wp.subject}`,
    wp.status ? `status: ${wp.status}` : null,
    wp.type ? `type: ${wp.type}` : null,
    wp.priority ? `priority: ${wp.priority}` : null,
    wp.percentageDone !== undefined ? `percentageDone: ${wp.percentageDone}` : null,
    wp.updatedAt ? `updatedAt: ${wp.updatedAt}` : null,
    wp.lockVersion !== null ? `lockVersion: ${wp.lockVersion}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  return `WORK PACKAGE (current state):
${fields}

DESCRIPTION:
${wp.description?.trim() || "(no description)"}

KNOWLEDGE GRAPH GROUNDING FACTS:
${facts}

Review this change. Ground your insight, recommendation, and methodology in the work package fields and the grounding facts above.`;
}

/** Adapt a bare generate function into a Reviewer (used for tests + custom backends). */
export function reviewerFromGenerator(
  generate: (wp: WorkPackage, grounding: GroundingFact[]) => Promise<Omit<Review, "workPackageId" | "subject">>,
): Reviewer {
  return {
    async review(wp, grounding) {
      const parts = await generate(wp, grounding);
      return { workPackageId: wp.id, subject: wp.subject, ...parts };
    },
  };
}

/** Reviewer backed by the Claude API with structured output. */
export function createClaudeReviewer(opts: {
  apiKey?: string;
  model: string;
  client?: Anthropic;
}): Reviewer {
  const client = opts.client ?? new Anthropic(opts.apiKey ? { apiKey: opts.apiKey } : {});
  return reviewerFromGenerator(async (wp, grounding) => {
    const res = await client.messages.create({
      model: opts.model,
      max_tokens: 16000,
      system: REVIEW_SYSTEM,
      messages: [{ role: "user", content: buildReviewPrompt(wp, grounding) }],
      output_config: { format: { type: "json_schema", schema: REVIEW_JSON_SCHEMA } },
    } as Anthropic.MessageCreateParamsNonStreaming);

    if (res.stop_reason === "refusal") {
      throw new Error("Claude refused to review this work package");
    }
    const text = res.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();
    if (!text) {
      throw new Error(`Claude returned no text (stop_reason=${res.stop_reason})`);
    }
    let parsed: { insight?: string; recommendation?: string; methodology?: string };
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new Error("Claude review output was not valid JSON");
    }
    if (!parsed.insight || !parsed.recommendation || !parsed.methodology) {
      throw new Error("Claude review output was missing required fields");
    }
    return {
      insight: parsed.insight,
      recommendation: parsed.recommendation,
      methodology: parsed.methodology,
    };
  });
}

/** Format a review as the Markdown comment posted back to the OpenProject record. */
export function formatReviewComment(review: Review, grounding: GroundingFact[]): string {
  const groundingNote = grounding.length
    ? `\n\n_Grounded on ${grounding.length} fact(s) from the knowledge graph (FalkorDB)._`
    : "\n\n_No knowledge-graph grounding facts were available for this review._";
  return [
    "**🤖 AI review of the latest change**",
    "",
    `**Insight** — ${review.insight}`,
    "",
    `**Recommendation** — ${review.recommendation}`,
    "",
    `**Methodology** — ${review.methodology}`,
    groundingNote,
  ].join("\n");
}
