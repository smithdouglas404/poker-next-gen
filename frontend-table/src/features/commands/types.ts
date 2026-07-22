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
  /**
   * Role required to SEE this action. Omitted = everyone (player/game host).
   * The backend still enforces every action; this only controls visibility.
   */
  requires?: "platform_admin" | "club_admin";
  /**
   * Verification capability required to SEE this action (only enforced when a
   * KYC provider is live). "guest" = visible to unregistered guests. Omitted =
   * requires registration (email). "biometric"/"kyc_aml" require those checks.
   */
  capability?: "guest" | "email" | "biometric" | "kyc_aml";
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
    accent: "border-white/[0.06] bg-[#1c2128]",
  },
  community: {
    label: "Community & Clubs",
    subtitle: "Private clubs, owners, balances, rake",
    accent: "border-gold/25 bg-[#1c2128]",
  },
  game: {
    label: "Cash Games",
    subtitle: "Create and join live tables",
    accent: "border-green/25 bg-[#1c2128]",
  },
  tournament: {
    label: "Tournaments",
    subtitle: "MTT brackets, blinds, and prize pools",
    accent: "border-brand/25 bg-[#1c2128]",
  },
  math: {
    label: "Math & GTO",
    subtitle: "rs_poker equity, Omaha, and GTO advice",
    accent: "border-cyan/25 bg-[#1c2128]",
  },
  coaching: {
    label: "Coaching",
    subtitle: "Smart HUD tips and mistake alerts",
    accent: "border-gold/25 bg-[#1c2128]",
  },
  security: {
    label: "Security",
    subtitle: "Anti-bot pattern monitoring",
    accent: "border-brand/25 bg-[#1c2128]",
  },
  audit: {
    label: "Audit & Verify",
    subtitle: "Hand history, hash chain, deck proofs",
    accent: "border-white/[0.06] bg-[#1c2128]",
  },
  table: {
    label: "Table Canvas",
    subtitle: "Visual poker surface and animations",
    accent: "border-green/25 bg-[#1c2128]",
  },
};
