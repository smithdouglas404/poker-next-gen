// Auto-form synthesis for commands that don't have a generated JSON Schema.
//
// The Command Center is an OPERATOR tool — no one should ever see or hand-edit a
// raw JSON payload. Commands with a reflected schema already render a real form;
// this builds an equivalent RpcSchema on the fly from a command's `example`
// payload so EVERY command gets labelled fields (money in dollars, id fields as
// entity pickers, plain-English titles) instead of a JSON textarea.

import type { FieldSchema, JsonType, RpcSchema } from "./schemaTypes";

// Field carries a couple of local extensions the synth path uses.
type SynthField = FieldSchema & { "x-array"?: boolean };

// Keys that hold money in minor units (cents), even without a _cents/_minor suffix.
const MONEY_KEYS = new Set([
  "amount", "balance", "buy_in", "min_buy_in", "max_buy_in", "small_blind",
  "big_blind", "ante", "cap_minor", "starting_stack", "credit_limit_cents",
  "delta_cents", "buy_in_cents", "price_cents",
]);

const ENUMS: Record<string, string[]> = {
  role: ["member", "manager", "agent", "admin", "owner"],
  currency: ["USD", "EUR", "GBP", "CHIPS", "USDT"],
  variant: ["holdem", "plo"],
  strategy: ["balanced", "aggressive", "passive"],
  action: ["approve", "deny", "accept", "decline"],
};

function isMoney(key: string): boolean {
  const k = key.toLowerCase();
  return k.endsWith("_cents") || k.endsWith("_minor") || MONEY_KEYS.has(k);
}

/** "club_id" → "Club", "small_blind" → "Small Blind", "payout_bps" → "Payout %". */
function humanize(key: string): string {
  if (key === "club_id") return "Club";
  if (key === "user_id") return "Player";
  if (key === "tournament_id") return "Tournament";
  let k = key.replace(/_(cents|minor)$/i, "").replace(/_bps$/i, " %").replace(/_id$/i, "");
  k = k.replace(/_/g, " ").trim();
  return k.replace(/\b\w/g, (c) => c.toUpperCase());
}

function fieldFor(key: string, value: unknown, order: number): SynthField {
  const base: SynthField = { title: humanize(key), type: "string", "x-order": order };
  // Entity references → dropdown / typeahead pickers.
  if (key === "club_id") return { ...base, "x-ref": "club" };
  if (key === "user_id") return { ...base, "x-ref": "user" };
  if (key === "tournament_id") return { ...base, "x-ref": "tournament" };
  // Money → dollar input.
  if (typeof value === "number" && isMoney(key)) {
    return { ...base, type: "integer", "x-unit": "money_minor", default: value };
  }
  // Basis points → percent input.
  if (typeof value === "number" && key.toLowerCase().endsWith("_bps")) {
    return { ...base, type: "integer", "x-unit": "bps", default: value };
  }
  if (typeof value === "number") {
    return { ...base, type: Number.isInteger(value) ? "integer" : "number", "x-unit": "count", default: value };
  }
  if (typeof value === "boolean") return { ...base, type: "boolean", default: value };
  // String arrays (card notation etc.) → one comma-separated text field.
  if (Array.isArray(value) && value.every((v) => typeof v === "string")) {
    return { ...base, type: "string", "x-array": true, default: (value as string[]).join(", "),
      description: "Separate multiple values with commas." };
  }
  // Enums by conventional key name.
  const en = ENUMS[key.toLowerCase()];
  if (en && typeof value === "string") return { ...base, enum: en, default: value };
  // Plain string.
  return { ...base, default: typeof value === "string" ? value : "" };
}

/** Build a form schema from a command's example payload. Nested objects and
 *  arrays-of-objects are skipped (sent through unchanged from the example). */
export function schemaFromExample(rpc: string, example: Record<string, unknown> | undefined): RpcSchema {
  const properties: Record<string, FieldSchema> = {};
  let order = 0;
  for (const [key, value] of Object.entries(example ?? {})) {
    if (value !== null && typeof value === "object" && !Array.isArray(value)) continue; // nested object
    if (Array.isArray(value) && value.some((v) => v !== null && typeof v === "object")) continue; // object array
    properties[key] = fieldFor(key, value, order++);
  }
  return { type: "object", properties, "x-rpc": rpc };
}

/** Coerce synth form values back to wire shape: split x-array text fields into
 *  arrays, and carry through any example keys the form didn't cover (nested). */
export function coerceSynthPayload(
  schema: RpcSchema,
  values: Record<string, unknown>,
  example: Record<string, unknown> | undefined,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...(example ?? {}) };
  for (const [key, field] of Object.entries(schema.properties)) {
    const v = values[key];
    if ((field as SynthField)["x-array"]) {
      out[key] = String(v ?? "").split(/[\s,]+/).map((s) => s.trim()).filter(Boolean);
    } else if (v !== undefined) {
      out[key] = v;
    }
  }
  return out;
}
