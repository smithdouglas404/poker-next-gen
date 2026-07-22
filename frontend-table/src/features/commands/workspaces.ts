// Operator-job IA for the Command Center (UI review P1-1).
//
// The flat grid mirrors backend domains (Platform / Community / Cash / …); an
// operator instead thinks in JOBS: set up my club, run tonight's games, move
// money, manage players, use tools. This maps every command to one of those
// workspaces so the default view is organized around what the operator is
// trying to do. The flat grid stays available as a "Console".

import type { CommandCategory, CommandDefinition } from "./types";

export type Workspace = "my_club" | "run_games" | "money" | "players" | "tools" | "system";

export const WORKSPACE_ORDER: Workspace[] = [
  "my_club",
  "run_games",
  "money",
  "players",
  "tools",
  "system",
];

export const WORKSPACE_META: Record<
  Workspace,
  { label: string; subtitle: string; icon: string; accent: string }
> = {
  my_club: {
    label: "My Club",
    subtitle: "Set up and run your club — rake, roles, invites",
    icon: "♣",
    accent: "border-gold/25",
  },
  run_games: {
    label: "Run Games",
    subtitle: "Open cash tables and build tournaments",
    icon: "▶",
    accent: "border-green/25",
  },
  money: {
    label: "Money",
    subtitle: "Balances, allocations, rake, and ledgers",
    icon: "◆",
    accent: "border-gold/25",
  },
  players: {
    label: "Players",
    subtitle: "Balances, stats, verification, and integrity",
    icon: "◎",
    accent: "border-cyan/25",
  },
  tools: {
    label: "Tools",
    subtitle: "Equity, hand analysis, and provable fairness",
    icon: "◇",
    accent: "border-white/[0.08]",
  },
  system: {
    label: "System",
    subtitle: "Account, health, and admin",
    icon: "⬡",
    accent: "border-white/[0.08]",
  },
};

// Per-command overrides where the category alone would misfile it (money and
// player actions live in the community/security domains but belong to their own
// operator jobs).
const ID_TO_WORKSPACE: Record<string, Workspace> = {
  // Money
  balance_allocate: "money",
  balance_get: "money",
  wallet_get: "money",
  rake_config_get: "money",
  rake_config_set: "money",
  rake_ledger_get: "money",
  club_rake_report: "money",
  rakeback_status: "money",
  loyalty: "money",
  // Players
  kyc: "players",
  player_stats: "players",
  club_member_stats: "players",
  antibot_score: "players",
  collusion_list: "players",
  // Account/system
  healthz: "system",
  stack_health: "system",
  auth_sign_in: "system",
  auth_profile: "system",
};

const CATEGORY_TO_WORKSPACE: Record<CommandCategory, Workspace> = {
  platform: "system",
  community: "my_club",
  game: "run_games",
  tournament: "run_games",
  math: "tools",
  coaching: "tools",
  security: "players",
  audit: "tools",
  table: "run_games",
};

export function workspaceForCommand(cmd: CommandDefinition): Workspace {
  return ID_TO_WORKSPACE[cmd.id] ?? CATEGORY_TO_WORKSPACE[cmd.category] ?? "system";
}
