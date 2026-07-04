import type { CommandDefinition } from "./types";

/** All poker network commands — live RPCs and planned roadmap actions. */
export const COMMAND_REGISTRY: CommandDefinition[] = [
  // Platform
  {
    id: "healthz",
    title: "Check Backend Health",
    description: "Ping the Nakama backend-core plugin and verify the server is online.",
    category: "platform",
    status: "live",
    rpc: "healthz",
    icon: "◉",
  },
  {
    id: "auth_sign_in",
    title: "Sign In / Create Account",
    description: "Authenticate with Nakama using device or email credentials.",
    category: "platform",
    status: "planned",
    icon: "◎",
    example: { device_id: "player-001", username: "AceHigh" },
  },
  {
    id: "auth_profile",
    title: "View Player Profile",
    description: "Load account metadata, avatar, and display name.",
    category: "platform",
    status: "planned",
    icon: "◌",
  },

  // Community & Clubs
  {
    id: "club_create",
    title: "Create Community",
    description: "Spin up a private club (community) with name, slug, and currency.",
    category: "community",
    status: "live",
    rpc: "club_create",
    icon: "♣",
    example: {
      name: "Midnight Hold'em Society",
      slug: "midnight-holdem",
      description: "Invite-only high stakes club",
      currency: "USD",
    },
  },
  {
    id: "club_list",
    title: "Browse Communities",
    description: "List all active clubs you belong to or can discover.",
    category: "community",
    status: "planned",
    icon: "♣",
  },
  {
    id: "club_owner_add",
    title: "Add Club Owner",
    description: "Grant owner, manager, or agent role with equity split.",
    category: "community",
    status: "planned",
    icon: "♦",
    example: { club_id: "...", user_id: "...", role: "manager", equity_bps: 2500 },
  },
  {
    id: "balance_allocate",
    title: "Allocate Player Balance",
    description: "Credit chips to a player inside a club ledger.",
    category: "community",
    status: "planned",
    icon: "♠",
    example: { club_id: "...", user_id: "...", balance: 100000, currency: "USD" },
  },
  {
    id: "rake_config_set",
    title: "Configure Rake Rules",
    description: "Set percent rake, cap, and no-flop-no-drop policy for a club.",
    category: "community",
    status: "planned",
    icon: "♥",
    example: { club_id: "...", name: "Standard", percent_bps: 500, cap_minor: 500 },
  },

  // Cash Games
  {
    id: "game_create",
    title: "Create Cash Game",
    description: "Open a new 6-max Texas Hold'em table with blinds and buy-in.",
    category: "game",
    status: "live",
    rpc: "table_create",
    href: "/table",
    icon: "▶",
    example: { variant: "texas-holdem", small_blind: 100, big_blind: 200, buy_in: 100000 },
  },
  {
    id: "game_join",
    title: "Join Cash Game",
    description: "Take a seat at an open cash game table.",
    category: "game",
    status: "live",
    href: "/table",
    icon: "▷",
  },
  {
    id: "game_leave",
    title: "Leave Table",
    description: "Stand up and cash out from the current game.",
    category: "game",
    status: "planned",
    icon: "◁",
  },

  // Tournaments
  {
    id: "tournament_create",
    title: "Create Tournament",
    description: "Schedule a multi-table tournament with buy-in, fee, and starting stack.",
    category: "tournament",
    status: "planned",
    icon: "🏆",
    example: {
      name: "Sunday Million",
      variant: "texas-holdem",
      buy_in_minor: 10000,
      fee_minor: 1000,
      starting_stack: 10000,
      max_players: 180,
      max_seats_per_table: 6,
    },
  },
  {
    id: "tournament_list",
    title: "Browse Tournaments",
    description: "View registering, running, and finished MTT events.",
    category: "tournament",
    status: "planned",
    icon: "☰",
  },
  {
    id: "tournament_register",
    title: "Register for Tournament",
    description: "Buy in and reserve a seat before the tournament starts.",
    category: "tournament",
    status: "planned",
    icon: "✚",
  },
  {
    id: "tournament_blinds",
    title: "View Blind Structure",
    description: "Inspect blind levels, antes, and break schedule.",
    category: "tournament",
    status: "planned",
    icon: "⏱",
    example: { level: 1, small_blind: 50, big_blind: 100, duration_secs: 600 },
  },
  {
    id: "tournament_prizes",
    title: "View Prize Pool",
    description: "See payout tiers and guaranteed prize distribution.",
    category: "tournament",
    status: "planned",
    icon: "💰",
    example: { rank_from: 1, rank_to: 3, payout_bps: 5000 },
  },

  // Table canvas
  {
    id: "table_open",
    title: "Open Table Canvas",
    description: "Launch the premium Pixi.js WebGPU poker table surface.",
    category: "table",
    status: "live",
    href: "/table",
    icon: "▣",
  },
  {
    id: "table_deal",
    title: "Deal Hole Cards",
    description: "Animate two card backs from center to all six seats.",
    category: "table",
    status: "live",
    href: "/table",
    icon: "🃏",
  },
];

export function commandsByCategory(category: CommandDefinition["category"]): CommandDefinition[] {
  return COMMAND_REGISTRY.filter((cmd) => cmd.category === category);
}

export function getCommand(id: string): CommandDefinition | undefined {
  return COMMAND_REGISTRY.find((cmd) => cmd.id === id);
}
