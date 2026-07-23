export const OpSitDown = 1;
export const OpStandUp = 2;
export const OpAction = 3;
export const OpStartHand = 4;
export const OpChatSend = 5;
export const OpHostAction = 6;

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

export const MIN_BUY_IN_CENTS = 10_000;
export const MAX_BUY_IN_CENTS = 100_000;
export const INITIAL_WALLET_CENTS = 100_000;

export const DEFAULT_SMALL_BLIND_CENTS = 100;
export const DEFAULT_BIG_BLIND_CENTS = 200;
export const DEFAULT_MAX_SEATS = 6;
export const MIN_SEATS = 2;
export const MAX_SEATS = 9;

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
  /** Equipped 3D model GLB URL (from cosmetics), when the player has one. */
  model_url?: string;
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
  hero_club_balance?: number;
  hand_no: number;
  hero_wallet_cents?: number;
  deck_commit_hash?: string;
  /** "holdem" | "plo"; absent => holdem. */
  variant?: string;
  host_user_id?: string;
  host_paused?: boolean;
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
  kind: "player" | "dealer";
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
