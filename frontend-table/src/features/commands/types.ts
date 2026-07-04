export type CommandStatus = "live" | "planned";

export type CommandCategory =
  | "platform"
  | "community"
  | "game"
  | "tournament"
  | "math"
  | "coaching"
  | "security"
  | "audit"
  | "table";

export interface CommandDefinition {
  id: string;
  title: string;
  description: string;
  category: CommandCategory;
  status: CommandStatus;
  rpc?: string;
  href?: string;
  icon: string;
  /** Example payload shown in the UI for planned or live RPC commands. */
  example?: Record<string, unknown>;
}

export interface CommandResult {
  ok: boolean;
  commandId: string;
  message: string;
  data?: unknown;
  at: string;
}

export const CATEGORY_META: Record<
  CommandCategory,
  { label: string; subtitle: string; accent: string }
> = {
  platform: {
    label: "Platform",
    subtitle: "Connection, auth, and system health",
    accent: "border-sky-500/40 bg-sky-950/30",
  },
  community: {
    label: "Community & Clubs",
    subtitle: "Private clubs, owners, balances, rake",
    accent: "border-amber-500/40 bg-amber-950/20",
  },
  game: {
    label: "Cash Games",
    subtitle: "Create and join live tables",
    accent: "border-emerald-500/40 bg-emerald-950/30",
  },
  tournament: {
    label: "Tournaments",
    subtitle: "MTT brackets, blinds, and prize pools",
    accent: "border-violet-500/40 bg-violet-950/30",
  },
  math: {
    label: "Math & GTO",
    subtitle: "rs_poker equity, Omaha, and GTO advice",
    accent: "border-cyan-500/40 bg-cyan-950/30",
  },
  coaching: {
    label: "Coaching",
    subtitle: "Smart HUD tips and mistake alerts",
    accent: "border-yellow-500/40 bg-yellow-950/20",
  },
  security: {
    label: "Security",
    subtitle: "Anti-bot pattern monitoring",
    accent: "border-rose-500/40 bg-rose-950/30",
  },
  audit: {
    label: "Audit & Verify",
    subtitle: "Hand history, hash chain, deck proofs",
    accent: "border-orange-500/40 bg-orange-950/30",
  },
  table: {
    label: "Table Canvas",
    subtitle: "Visual poker surface and animations",
    accent: "border-teal-500/40 bg-teal-950/30",
  },
};
