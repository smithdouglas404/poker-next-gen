// Auto-form synthesis for commands that don't have a generated JSON Schema.
//
// The Command Center is an OPERATOR tool — no one should ever see or hand-edit a
// raw JSON payload, and free-text boxes are a last resort. This builds an
// RpcSchema on the fly from a command's `example` payload and, via FIELD_META,
// upgrades each field to the richest control it can: entity pickers (club/user/
// tournament) bound to live data, a 52-card visual picker, dropdowns for known
// choices, sliders for bounded numbers, dollar/percent inputs for money and rake.
// Every field also carries a plain-English label and a one-line "what to enter".

import type { FieldSchema, RpcSchema } from "./schemaTypes";

// Field carries a couple of local extensions the synth path uses.
type SynthField = FieldSchema & { "x-array"?: boolean };

// Keys that hold money in minor units (cents), even without a _cents/_minor suffix.
const MONEY_KEYS = new Set([
  "amount", "balance", "buy_in", "min_buy_in", "max_buy_in", "small_blind",
  "big_blind", "ante", "cap_minor", "starting_stack", "credit_limit_cents",
  "delta_cents", "buy_in_cents", "price_cents",
]);

// Per-field presentation: friendly label, help line, and the control to render.
interface FieldMeta {
  title?: string;
  description?: string;
  placeholder?: string;
  enum?: string[];
  slider?: { min: number; max: number; step: number };
  bpsSlider?: { min: number; max: number; step: number };
  cards?: number; // single card group, max N cards
  hands?: number; // array of card groups, N cards each (0 = derive from example)
}

const FIELD_META: Record<string, FieldMeta> = {
  // Identity / structural.
  name: { title: "Name", placeholder: "Friday Night 100" },
  slug: { title: "URL Slug", description: "Lower-case id used in links, e.g. friday-night.", placeholder: "friday-night" },
  config_name: { title: "Config Name", placeholder: "Standard" },

  // Choice fields → dropdowns.
  currency: { title: "Currency", enum: ["USD", "EUR", "GBP", "CHIPS", "USDT"] },
  variant: { title: "Game Type", enum: ["holdem", "plo", "texas-holdem", "omaha"] },
  role: { title: "Role", enum: ["member", "manager", "agent", "admin", "owner"] },
  action: { title: "Action", enum: ["approve", "deny", "accept", "decline"] },
  strategy: { title: "Balancing Strategy", enum: ["balanced", "aggressive", "passive"] },
  last_action: { title: "Villain's Last Action", enum: ["fold", "check", "call", "bet", "raise"] },
  street: { title: "Street", enum: ["preflop", "flop", "turn", "river"] },

  // Card fields → 52-card visual picker.
  board: { title: "Community Cards", description: "Shared cards on the table (flop/turn/river). Leave empty pre-flop.", cards: 5 },
  cards: { title: "Cards to Rank", description: "Pick the cards to evaluate.", cards: 7 },
  hole: { title: "Your Four Cards (Omaha)", description: "An Omaha hand is four down cards.", cards: 4 },
  hero_hole: { title: "Your Hole Cards", description: "Your two down cards.", cards: 2 },
  holes: { title: "Players' Hole Cards", description: "One card group per player in the hand.", hands: 0 },
  villain_holes: { title: "Opponents' Hole Cards", description: "One card group per opponent.", hands: 0 },

  // Bounded numbers → sliders.
  iterations: { title: "Simulation Accuracy", description: "More run-outs = more precise, slightly slower.", slider: { min: 500, max: 10000, step: 500 } },
  max_players: { title: "Max Players", description: "Total entrants allowed across all tables.", slider: { min: 2, max: 1000, step: 1 } },
  min_players: { title: "Min Players", description: "Fewest entrants needed to start.", slider: { min: 2, max: 100, step: 1 } },
  max_seats_per_table: { title: "Seats Per Table", slider: { min: 2, max: 10, step: 1 } },
  max_seat_difference: { title: "Max Seat Imbalance", description: "Largest allowed gap in seat counts between tables before rebalancing.", slider: { min: 1, max: 9, step: 1 } },
  break_table_at_or_below: { title: "Break Table At/Below", description: "Break a table once it drops to this many players.", slider: { min: 2, max: 9, step: 1 } },
  level: { title: "Blind Level #", slider: { min: 1, max: 40, step: 1 } },
  rank_from: { title: "Finish Place — From", description: "Top of this payout band (1 = winner).", slider: { min: 1, max: 100, step: 1 } },
  rank_to: { title: "Finish Place — To", description: "Bottom of this payout band.", slider: { min: 1, max: 100, step: 1 } },
  duration_secs: { title: "Level Length", description: "How long each blind level lasts.", slider: { min: 60, max: 3600, step: 60 } },

  // Basis-point (%) fields → percent sliders.
  percent_bps: { title: "Rake", description: "Percent taken from each pot.", bpsSlider: { min: 0, max: 1000, step: 25 } },
  payout_bps: { title: "Payout Share", description: "Share of the prize pool for this place.", bpsSlider: { min: 0, max: 10000, step: 100 } },
  equity_bps: { title: "Equity", bpsSlider: { min: 0, max: 10000, step: 100 } },

  // Chip-count solver inputs (kept numeric — no natural max).
  pot: { title: "Current Pot (chips)", description: "Total chips in the pot." },
  to_call: { title: "Amount to Call (chips)", description: "Chips needed to continue." },
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

/** Cards per hand, derived from an example hand string like "AhAsKhKs" → 4. */
function cardsPerHand(value: unknown): number {
  if (Array.isArray(value) && typeof value[0] === "string") {
    const n = Math.floor((value[0] as string).replace(/[^a-z0-9]/gi, "").length / 2);
    if (n > 0) return n;
  }
  return 2;
}

function fieldFor(key: string, value: unknown, order: number): SynthField {
  const meta = FIELD_META[key.toLowerCase()];
  const base: SynthField = { title: meta?.title ?? humanize(key), type: "string", "x-order": order };
  let f: SynthField;

  // Entity references → live-data pickers.
  if (key === "club_id") f = { ...base, "x-ref": "club" };
  else if (key === "user_id") f = { ...base, "x-ref": "user" };
  else if (key === "tournament_id") f = { ...base, "x-ref": "tournament" };
  // Card fields → visual picker.
  else if (meta?.cards != null) f = { ...base, "x-widget": "cards", "x-max": meta.cards, default: typeof value === "string" ? value : "" };
  else if (meta?.hands != null) f = { ...base, "x-widget": "hands", "x-array": true, "x-max": meta.hands || cardsPerHand(value), default: Array.isArray(value) ? value : [] };
  // Percent sliders.
  else if (meta?.bpsSlider && typeof value === "number") f = { ...base, type: "integer", "x-unit": "bps", "x-widget": "slider", minimum: meta.bpsSlider.min, maximum: meta.bpsSlider.max, step: meta.bpsSlider.step, default: value };
  // Money → dollar input.
  else if (typeof value === "number" && isMoney(key)) f = { ...base, type: "integer", "x-unit": "money_minor", default: value };
  // Basis points without a slider config → percent input.
  else if (typeof value === "number" && key.toLowerCase().endsWith("_bps")) f = { ...base, type: "integer", "x-unit": "bps", default: value };
  // Numeric sliders.
  else if (meta?.slider && typeof value === "number") f = { ...base, type: Number.isInteger(value) ? "integer" : "number", "x-unit": key.toLowerCase() === "duration_secs" ? "seconds" : "count", "x-widget": "slider", minimum: meta.slider.min, maximum: meta.slider.max, step: meta.slider.step, default: value };
  // Plain numbers.
  else if (typeof value === "number") f = { ...base, type: Number.isInteger(value) ? "integer" : "number", "x-unit": "count", default: value };
  else if (typeof value === "boolean") f = { ...base, type: "boolean", default: value };
  // String arrays → comma text (fallback).
  else if (Array.isArray(value) && value.every((v) => typeof v === "string")) f = { ...base, type: "string", "x-array": true, default: (value as string[]).join(", "), description: "Separate multiple values with commas." };
  // Enum by meta or conventional key name.
  else if (meta?.enum && typeof value === "string") f = { ...base, enum: ensureIncludes(meta.enum, value), default: value };
  else f = { ...base, default: typeof value === "string" ? value : "" };

  // Overlay help text / placeholder from meta (meta wins for description).
  if (meta?.description) f.description = meta.description;
  if (meta?.placeholder) f["x-placeholder"] = meta.placeholder;
  return f;
}

/** Keep a dropdown honest: if the example value isn't in the option list, add it. */
function ensureIncludes(options: string[], value: string): string[] {
  return options.includes(value) ? options : [value, ...options];
}

/**
 * Upgrade a single field (from EITHER a generated schema or the synth path) to a
 * richer control when FIELD_META knows a better one — a dropdown for a known
 * choice, a slider for a bounded number, a card picker, plus a friendly label and
 * help line. Only ADDS controls; never overrides an entity picker, an explicit
 * enum, or a title the generator already set. This is what makes "more dropdowns
 * and sliders" reach every command, not just the auto-generated ones.
 */
export function enrichField(name: string, field: FieldSchema): FieldSchema {
  const meta = FIELD_META[name.toLowerCase()];
  if (!meta) return field;
  const out: SynthField = { ...field };

  if (meta.title && (!out.title || out.title === name)) out.title = meta.title;
  if (meta.description && !out.description) out.description = meta.description;
  if (meta.placeholder && !out["x-placeholder"]) out["x-placeholder"] = meta.placeholder;

  // Already an entity picker or already a rich widget → leave the control alone.
  if (out["x-ref"] || out["x-widget"]) return out;

  if (meta.cards != null) {
    out["x-widget"] = "cards";
    out["x-max"] = meta.cards;
  } else if (meta.hands != null) {
    out["x-widget"] = "hands";
    out["x-array"] = true;
    out["x-max"] = meta.hands || 2;
  } else if (meta.bpsSlider && (out["x-unit"] === "bps" || name.toLowerCase().endsWith("_bps"))) {
    out["x-widget"] = "slider";
    out["x-unit"] = "bps";
    out.minimum = out.minimum ?? meta.bpsSlider.min;
    out.maximum = out.maximum ?? meta.bpsSlider.max;
    out.step = out.step ?? meta.bpsSlider.step;
  } else if (meta.slider && (out.type === "integer" || out.type === "number")) {
    out["x-widget"] = "slider";
    out.minimum = out.minimum ?? meta.slider.min;
    out.maximum = out.maximum ?? meta.slider.max;
    out.step = out.step ?? meta.slider.step;
    if (name.toLowerCase() === "duration_secs") out["x-unit"] = "seconds";
  } else if (meta.enum && (!out.enum || out.enum.length === 0) && out.type === "string") {
    out.enum = out.default != null ? ensureIncludes(meta.enum, String(out.default)) : meta.enum;
  }
  return out;
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

/** Coerce synth form values back to wire shape: arrays pass through, x-array text
 *  fields split into arrays, and any example keys the form didn't cover (nested)
 *  carry through unchanged. */
export function coerceSynthPayload(
  schema: RpcSchema,
  values: Record<string, unknown>,
  example: Record<string, unknown> | undefined,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...(example ?? {}) };
  for (const [key, field] of Object.entries(schema.properties)) {
    const v = values[key];
    if (Array.isArray(v)) {
      out[key] = v; // hands widget / already-array value
    } else if ((field as SynthField)["x-array"]) {
      out[key] = String(v ?? "").split(/[\s,]+/).map((s) => s.trim()).filter(Boolean);
    } else if (v !== undefined) {
      out[key] = v;
    }
  }
  return out;
}
