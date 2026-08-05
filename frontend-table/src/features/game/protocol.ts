export const OpSitDown = 1;
export const OpStandUp = 2;
export const OpAction = 3;
export const OpStartHand = 4;
export const OpChatSend = 5;
export const OpHostAction = 6;
export const OpMoveSeat = 10;
export const OpSitOut = 11;
export const OpUseTimeBank = 12;
export const OpAddChips = 13;

export const OpChat = 111;
export const OpSessionKey = 112;

export const OpSnapshot = 100;
export const OpHandStart = 101;
export const OpDealPrivate = 102;
export const OpBoard = 103;
export const OpActionApplied = 104;
export const OpActionRequired = 105;
export const OpShowdown = 106;
export const OpSeatUpdate = 107;
export const OpError = 108;
export const OpBlindUpdate = 109;
export const OpTableMoved = 114;

export const MIN_BUY_IN_CENTS = 10_000;
export const MAX_BUY_IN_CENTS = 100_000;
export const INITIAL_WALLET_CENTS = 100_000;

export const DEFAULT_SMALL_BLIND_CENTS = 100;
export const DEFAULT_BIG_BLIND_CENTS = 200;
export const DEFAULT_MAX_SEATS = 6;
export const MIN_SEATS = 2;
// Physical seat cap — must match backend protocol.MaxSeats (opcodes.go:39). 10-max.
export const MAX_SEATS = 10;

export interface CardView {
  code: string;
  face_up: boolean;
}

export interface SeatView {
  index: number;
  user_id?: string;
  username?: string;
  stack: number;
  status: string;
  last_action?: string;
  is_hero?: boolean;
  /** AI seat — always disclosed to every player. */
  is_bot?: boolean;
  /** Equipped 3D model GLB URL (from cosmetics), when the player has one. */
  model_url?: string;
  /** Chips committed on the current street (in front of the seat). */
  bet?: number;
  /** Sitting out in place (kept seat, not dealt in). */
  sitting_out?: boolean;
  /** Owes a post to return before their natural big blind. */
  owes_post?: boolean;
}

export interface TableSnapshot {
  match_id: string;
  room_id: string;
  phase: string;
  seats: SeatView[];
  board: CardView[];
  pot: number;
  current_bet: number;
  action_seat: number;
  button_seat: number;
  small_blind: number;
  big_blind: number;
  max_seats?: number;
  min_buy_in?: number;
  max_buy_in?: number;
  accepts_global_wallet?: boolean;
  /** Present only on CLUB tables. Distinguishes a club table whose available
   *  balance is 0 from a table with no club behind it. */
  club_id?: string;
  /** AVAILABLE club balance (allocated - locked). While the hero is seated
   *  this EXCLUDES the chips already carried to the table — those sit in
   *  their stack until SettleSeat runs at stand-up. */
  hero_club_balance?: number;
  hand_no: number;
  hero_wallet_cents?: number;
  deck_commit_hash?: string;
  /** "holdem" | "plo"; absent => holdem. */
  variant?: string;
  /** Owner-chosen table look: "2.5d" | "3d". Absent => per-device renderMode. */
  render_style?: string;
  /**
   * DEAD FIELD — kept only so the wire stays compatible with servers that still
   * send it. Nothing renders it.
   *
   * It was the id of a "baked plate": a pre-rendered table backdrop for the R3F
   * scene that was deleted months ago. The server still accepts it, stores it on
   * the match and echoes it back in every snapshot, but no client has read it
   * since that scene went. The picker that wrote it (a "Choose a Table" section
   * offering "Cinematic — Default 3D felt") advertised a renderer that no longer
   * exists, and bakedTable.ts alongside it. Both are now removed.
   *
   * Do not wire this back up. `/table` has exactly one renderer.
   */
  table_art?: string;
  host_user_id?: string;
  host_paused?: boolean;
  ai_host_enabled?: boolean;
}

export interface TableMovedMessage {
  new_match_id: string;
}

export interface DealPrivateMessage {
  seat: number;
  cards?: CardView[];
  /** base64(nonce || AES-256-GCM ciphertext) of {"cards":[...]}. */
  enc?: string;
}

export interface ActionRequiredMessage {
  seat: number;
  valid_actions: string[];
  to_call: number;
  min_raise: number;
  max_raise: number;
  pot: number;
  deadline_tick: number;
  /** Server-authoritative shot clock: base seconds to act. */
  action_secs?: number;
  /** Remaining time-bank seconds, burned after action_secs lapses. */
  time_bank_secs?: number;
}

export interface ShowdownMessage {
  pot: number;
  winners?: Array<{ seat: number; username?: string; hand?: string; pot?: number }>;
  side_pots?: number;
  hands?: Record<string, CardView[]>;
  /** Provably-fair reveal: the pre-deal commit and the now-revealed seed. */
  deck_commit?: string;
  reveal_seed?: string;
}

export interface TableListItem {
  match_id: string;
  room_id?: string;
  label?: string;
  seated?: number;
  open_seats?: number;
}

export interface GameLogEntry {
  id: string;
  at: string;
  message: string;
  level: "info" | "action" | "pot" | "error";
}

export interface ChatMessage {
  user_id: string;
  username: string;
  text: string;
  kind: "player" | "dealer" | "ai_host";
  seat: number;
  hand_no: number;
}

export interface PlayerProfile {
  userId: string;
  username: string;
  walletCents: number;
}

export interface GameState {
  connected: boolean;
  matchId: string | null;
  roomId: string | null;
  profile: PlayerProfile;
  snapshot: TableSnapshot | null;
  holeCards: CardView[];
  actionRequired: ActionRequiredMessage | null;
  showdown: ShowdownMessage | null;
  error: string | null;
  buyInCents: number;
  gameLog: GameLogEntry[];
  matchmakerSearching: boolean;
  openTables: TableListItem[];
  dealTrigger: number;
  maxSeats: number;
  chatMessages: ChatMessage[];
}
