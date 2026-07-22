import { formatBps, formatMoney } from "./format";
import { orderedFields, type RpcSchema } from "./schemaTypes";

/** Command risk classes drive the confirm flow (UI review P0-3). */
export type RiskClass = "read" | "write" | "money" | "destructive";

const RISK: Record<string, RiskClass> = {
  balance_allocate: "money",
  tournament_create: "money",
  table_create: "write",
  rake_config_set: "write",
  club_owner_add: "write",
  club_member_role: "write",
  club_delete: "destructive",
  club_kick: "destructive",
  club_transfer_ownership: "destructive",
  prize_pool_add: "write",
  blind_level_add: "write",
  balancing_rule_set: "write",
};

/** Minor-unit amount at/above which an explicit typed confirmation is required. */
export const TYPED_CONFIRM_THRESHOLD_MINOR = 100000; // $1,000.00

export function riskOf(rpc: string): RiskClass {
  return RISK[rpc] ?? "write";
}

export function needsConfirm(rpc: string): boolean {
  const r = riskOf(rpc);
  return r === "money" || r === "destructive" || r === "write";
}

export interface ConfirmContext {
  clubName?: (clubId: string) => string | undefined;
  userName?: (userId: string) => string | undefined;
}

/** The largest money field in a payload — used to decide typed-confirm. */
export function maxMoneyMinor(schema: RpcSchema, values: Record<string, unknown>): number {
  let max = 0;
  for (const { name, field } of orderedFields(schema)) {
    if (field["x-unit"] === "money_minor") {
      const n = Number(values[name]) || 0;
      if (n > max) max = n;
    }
  }
  return max;
}

/**
 * Build a plain-language confirmation sentence from the schema + values, so the
 * operator reads real money and real names — not braces. E.g. balance_allocate:
 * "Credit $1,000.00 to @doug in Midnight Hold'em Society."
 */
export function describeSubmission(
  rpc: string,
  schema: RpcSchema,
  values: Record<string, unknown>,
  ctx: ConfirmContext = {},
): { title: string; sentence: string; lines: string[] } {
  const clubId = (values["club_id"] as string) || "";
  const userId = (values["user_id"] as string) || "";
  const clubLabel = (clubId && ctx.clubName?.(clubId)) || clubId || "—";
  const userLabel = (userId && ctx.userName?.(userId)) || userId || "—";

  const lines: string[] = [];
  for (const { name, field } of orderedFields(schema)) {
    const v = values[name];
    if (v === undefined || v === null || v === "") continue;
    if (name === "club_id" || name === "user_id") continue;
    let display: string;
    if (field["x-unit"] === "money_minor") display = formatMoney(Number(v) || 0);
    else if (field["x-unit"] === "bps") display = formatBps(Number(v) || 0);
    else if (field.type === "boolean") display = v ? "Yes" : "No";
    else display = String(v);
    lines.push(`${field.title ?? name}: ${display}`);
  }

  let title = "Confirm action";
  let sentence = `Run ${schema.title ?? rpc}?`;

  switch (rpc) {
    case "balance_allocate": {
      const amt = formatMoney(Number(values["balance"]) || 0, values["currency"] as string);
      title = "Confirm balance allocation";
      sentence = `Credit ${amt} to ${userLabel} in ${clubLabel}. This cannot be undone.`;
      break;
    }
    case "rake_config_set": {
      const pct = formatBps(Number(values["percent_bps"]) || 0);
      const cap = formatMoney(Number(values["cap_minor"]) || 0);
      title = "Confirm rake rule";
      sentence = `Set ${clubLabel} rake to ${pct}, capped at ${cap}. Applies to all future hands.`;
      break;
    }
    case "club_owner_add": {
      title = "Confirm owner change";
      sentence = `Grant ${userLabel} the ${String(values["role"] ?? "manager")} role in ${clubLabel}.`;
      break;
    }
    case "club_member_role": {
      title = "Confirm role change";
      sentence = `Set ${userLabel}'s role to ${String(values["role"] ?? "member")} in ${clubLabel}.`;
      break;
    }
    case "tournament_create": {
      const buyin = formatMoney(Number(values["buy_in_minor"]) || 0);
      const fee = formatMoney(Number(values["fee_minor"]) || 0);
      const stack = Number(values["starting_stack"]) || 0;
      title = "Confirm tournament";
      sentence = `Create "${String(values["name"] ?? "")}" — buy-in ${buyin} + fee ${fee}, players start with ${stack.toLocaleString()} chips.`;
      break;
    }
    case "table_create": {
      const sb = formatMoney(Number(values["small_blind"]) || 0);
      const bb = formatMoney(Number(values["big_blind"]) || 0);
      const buyin = formatMoney(Number(values["buy_in"]) || 0);
      title = "Confirm table";
      sentence = `Create table at ${sb}/${bb} blinds, ${buyin} buy-in.`;
      break;
    }
  }

  return { title, sentence, lines };
}
