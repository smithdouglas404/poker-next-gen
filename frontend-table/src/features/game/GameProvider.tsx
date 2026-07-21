"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import {
  DEFAULT_BIG_BLIND_CENTS,
  DEFAULT_MAX_SEATS,
  DEFAULT_SMALL_BLIND_CENTS,
  INITIAL_WALLET_CENTS,
  MAX_BUY_IN_CENTS,
  MAX_SEATS,
  MIN_BUY_IN_CENTS,
  MIN_SEATS,
  OpAction,
  OpBoard,
  OpChat,
  OpChatSend,
  OpDealPrivate,
  OpError,
  OpHandStart,
  OpSessionKey,
  OpShowdown,
  OpSitDown,
  OpSnapshot,
  OpStandUp,
  OpStartHand,
  OpActionRequired,
  type ActionRequiredMessage,
  type CardView,
  type ChatMessage,
  type DealPrivateMessage,
  type GameLogEntry,
  type GameState,
  type ShowdownMessage,
  type TableListItem,
  type TableSnapshot,
} from "./protocol";
import { ensureSession } from "@/lib/nakama/auth";
import { createNakamaClient, type Session, type Socket } from "@/lib/nakama/client";
import { callSessionRpc } from "@/lib/nakama/sessionRpc";
import { decryptCards, importSessionKey } from "@/lib/nakama/cardCrypto";
import { soundManager } from "@/features/sound/soundManager";
import { tauntByKey, tauntUrls } from "@/features/sound/library";
import { avatarForKey } from "@/features/table/avatars";

/** Voice taunts ride the chat channel using a printable marker (control chars
 *  are stripped server-side, so this survives sanitization). */
const TAUNT_MARKER = /^::taunt:([a-z0-9-]{1,32})::$/;
function parseTauntMarker(text: string): { key: string } | null {
  const m = TAUNT_MARKER.exec(text.trim());
  return m ? { key: m[1] } : null;
}

interface GameContextValue extends GameState {
  connect: () => Promise<void>;
  refreshWallet: () => Promise<void>;
  listTables: () => Promise<void>;
  createRoom: (opts?: {
    name?: string;
    buyIn?: number;
    smallBlind?: number;
    bigBlind?: number;
    maxSeats?: number;
    numBots?: number;
    variant?: string;
    durationMins?: number;
  }) => Promise<void>;
  joinRoom: (matchId: string) => Promise<void>;
  sitDown: (seat: number, buyIn?: number) => Promise<void>;
  standUp: () => Promise<void>;
  startHand: () => Promise<void>;
  sendAction: (type: string, amount: number) => Promise<void>;
  findMatch: () => Promise<void>;
  setBuyInCents: (cents: number) => void;
  setPreviewSeats: (n: number) => void;
  sendChat: (text: string) => Promise<void>;
  sendTaunt: (key: string) => Promise<void>;
  addBot: () => Promise<void>;
}

const GameContext = createContext<GameContextValue | null>(null);

function logEntry(message: string, level: GameLogEntry["level"] = "info"): GameLogEntry {
  return { id: `${Date.now()}-${Math.random()}`, at: new Date().toISOString(), message, level };
}

export function GameProvider({ children }: { children: ReactNode }) {
  const clientRef = useRef(createNakamaClient());
  const sessionRef = useRef<Session | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const sessionKeyRef = useRef<CryptoKey | null>(null);

  const [connected, setConnected] = useState(false);
  const [matchId, setMatchId] = useState<string | null>(null);
  const [roomId, setRoomId] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<TableSnapshot | null>(null);
  const [holeCards, setHoleCards] = useState<CardView[]>([]);
  const [actionRequired, setActionRequired] = useState<ActionRequiredMessage | null>(null);
  const [showdown, setShowdown] = useState<ShowdownMessage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [buyInCents, setBuyInCentsState] = useState(INITIAL_WALLET_CENTS);
  const [maxSeats, setMaxSeats] = useState(DEFAULT_MAX_SEATS);
  const [gameLog, setGameLog] = useState<GameLogEntry[]>([]);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [matchmakerSearching, setMatchmakerSearching] = useState(false);
  const [openTables, setOpenTables] = useState<TableListItem[]>([]);
  const [dealTrigger, setDealTrigger] = useState(0);
  const [profile, setProfile] = useState({
    userId: "",
    username: "Guest",
    walletCents: INITIAL_WALLET_CENTS,
  });

  const pushLog = useCallback((message: string, level: GameLogEntry["level"] = "info") => {
    setGameLog((prev) => [logEntry(message, level), ...prev.slice(0, 49)]);
  }, []);

  const refreshWallet = useCallback(async () => {
    try {
      const data = (await callSessionRpc("wallet_get", {})) as { balance_cents?: number };
      if (data.balance_cents !== undefined) {
        setProfile((p) => ({ ...p, walletCents: data.balance_cents! }));
      }
    } catch {
      /* ignore */
    }
  }, []);

  const wireSocket = useCallback(
    (socket: Socket) => {
      socket.onmatchdata = (md) => {
        const payload = md.data ? JSON.parse(new TextDecoder().decode(md.data)) : null;
        switch (md.op_code) {
          case OpSnapshot: {
            const snap = payload as TableSnapshot;
            setSnapshot(snap);
            if (snap.hero_wallet_cents !== undefined) {
              setProfile((p) => ({ ...p, walletCents: snap.hero_wallet_cents! }));
            }
            break;
          }
          case OpHandStart:
            pushLog(`Hand #${(payload as TableSnapshot)?.hand_no ?? "?"} started`, "action");
            const commit = (payload as TableSnapshot)?.deck_commit_hash;
            if (commit) {
              pushLog(`Deck commit ${commit.slice(0, 10)}…`, "info");
            }
            setShowdown(null);
            setDealTrigger((n) => n + 1);
            break;
          case OpSessionKey: {
            const key = (payload as { key?: string }).key;
            if (key) {
              void importSessionKey(key)
                .then((k) => {
                  sessionKeyRef.current = k;
                })
                .catch(() => {
                  sessionKeyRef.current = null;
                });
            }
            break;
          }
          case OpDealPrivate: {
            const dp = payload as DealPrivateMessage;
            if (dp.enc) {
              // Encrypted hole cards: decrypt in memory with the session key.
              const key = sessionKeyRef.current;
              if (key) {
                void decryptCards(key, dp.enc)
                  .then((json) => {
                    const parsed = JSON.parse(json) as { cards: CardView[] };
                    setHoleCards(parsed.cards ?? []);
                  })
                  .catch(() => setHoleCards([]));
              }
            } else if (dp.cards) {
              setHoleCards(dp.cards);
            }
            pushLog("Hole cards dealt", "info");
            break;
          }
          case OpBoard:
            pushLog(`Board: ${(payload.phase as string)?.toUpperCase()}`, "pot");
            setSnapshot((prev) =>
              prev ? { ...prev, board: payload.board, phase: payload.phase } : prev,
            );
            break;
          case OpActionRequired:
            setActionRequired(payload as ActionRequiredMessage);
            break;
          case OpShowdown: {
            const sd = payload as ShowdownMessage;
            setShowdown(sd);
            const winners = sd.winners?.map((w) => w.username ?? `Seat ${w.seat}`).join(", ");
            pushLog(`Showdown — pot ${formatCents(sd.pot)}${winners ? ` · ${winners} wins` : ""}`, "pot");
            break;
          }
          case OpChat: {
            const chat = payload as ChatMessage;
            const taunt = parseTauntMarker(chat.text);
            if (taunt) {
              // A voice taunt piggybacked on chat: play the sender's character
              // voice for everyone, and show a friendly emote line instead of the
              // raw marker.
              const character = avatarForKey(chat.user_id || `seat-${chat.seat}`);
              soundManager.playTaunt(tauntUrls(character, taunt.key));
              const meta = tauntByKey(taunt.key);
              const nice: ChatMessage = {
                ...chat,
                text: meta ? `${meta.emoji} ${meta.label}` : taunt.key,
              };
              setChatMessages((prev) => [...prev.slice(-99), nice]);
            } else {
              setChatMessages((prev) => [...prev.slice(-99), chat]);
            }
            break;
          }
          case OpError:
            setError(payload.message ?? "Game error");
            pushLog(payload.message ?? "Error", "error");
            break;
          default:
            break;
        }
      };
    },
    [pushLog],
  );

  const connect = useCallback(async () => {
    const client = clientRef.current;
    const session = await ensureSession();
    sessionRef.current = session;

    let walletCents = INITIAL_WALLET_CENTS;
    let username = session.username ?? "Player";
    const prof = (await callSessionRpc("profile_get", {})) as {
      balance_cents?: number;
      username?: string;
    };
    if (prof.balance_cents !== undefined) walletCents = prof.balance_cents;
    if (prof.username) username = prof.username;

    setProfile({ userId: session.user_id ?? "", username, walletCents });
    const socket = client.createSocket(client.useSSL, false);
    await socket.connect(session, true);
    socketRef.current = socket;
    wireSocket(socket);
    setConnected(true);
    pushLog("Connected to Nakama realtime", "info");
  }, [wireSocket, pushLog]);

  useEffect(() => {
    void connect().catch((e) => setError(e instanceof Error ? e.message : "Connect failed"));
  }, [connect]);

  const listTables = useCallback(async () => {
    try {
      const data = (await callSessionRpc("table_list", {})) as { matches?: TableListItem[] };
      setOpenTables(data.matches ?? []);
      pushLog(`Found ${data.matches?.length ?? 0} open tables`, "info");
    } catch (e) {
      pushLog(e instanceof Error ? e.message : "List tables failed", "error");
    }
  }, [pushLog]);

  const joinRoom = useCallback(
    async (id: string) => {
      const socket = socketRef.current;
      if (!socket) return;
      await socket.joinMatch(id);
      setMatchId(id);
      setHoleCards([]);
      setActionRequired(null);
      setShowdown(null);
      pushLog(`Joined match ${id.slice(0, 8)}…`, "info");
    },
    [pushLog],
  );

  const createRoom = useCallback(
    async (opts?: {
      name?: string;
      buyIn?: number;
      smallBlind?: number;
      bigBlind?: number;
      maxSeats?: number;
      numBots?: number;
      variant?: string;
      durationMins?: number;
    }) => {
      const buyIn = opts?.buyIn ?? buyInCents;
      const smallBlind = Math.max(1, Math.round(opts?.smallBlind ?? DEFAULT_SMALL_BLIND_CENTS));
      const bigBlind = Math.max(smallBlind, Math.round(opts?.bigBlind ?? DEFAULT_BIG_BLIND_CENTS));
      const seats = Math.min(MAX_SEATS, Math.max(MIN_SEATS, Math.round(opts?.maxSeats ?? maxSeats)));
      const numBots = Math.min(seats - 1, Math.max(0, Math.round(opts?.numBots ?? 0)));
      const variant = opts?.variant === "plo" ? "plo" : "holdem";
      const durationMins = Math.max(0, Math.round(opts?.durationMins ?? 0));
      const res = await fetch("/api/nakama/table/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: opts?.name ?? (variant === "plo" ? "PLO Table" : "Hold'em Table"),
          small_blind: smallBlind,
          big_blind: bigBlind,
          buy_in: buyIn,
          max_seats: seats,
          num_bots: numBots,
          variant,
          duration_mins: durationMins,
        }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error ?? "Create room failed");
      setRoomId(json.data.room_id);
      setMaxSeats(seats);
      pushLog(
        `Room created · buy-in ${formatCents(buyIn)} · blinds ${formatCents(smallBlind)}/${formatCents(bigBlind)} · ${seats} seats${numBots ? ` · ${numBots} bot${numBots > 1 ? "s" : ""}` : ""}`,
        "info",
      );
      await joinRoom(json.data.match_id);
    },
    [buyInCents, maxSeats, joinRoom, pushLog],
  );

  const sendMatch = useCallback(
    async (opCode: number, body: unknown) => {
      const socket = socketRef.current;
      if (!socket || !matchId) return;
      const data = new TextEncoder().encode(JSON.stringify(body));
      await socket.sendMatchState(matchId, opCode, data);
    },
    [matchId],
  );

  const sitDown = useCallback(
    async (seat: number, buyIn?: number) => {
      const amount = Math.min(
        MAX_BUY_IN_CENTS,
        Math.max(MIN_BUY_IN_CENTS, buyIn ?? buyInCents),
        profile.walletCents,
      );
      await sendMatch(OpSitDown, { seat, buy_in: amount });
      pushLog(`Sitting seat ${seat + 1} with ${formatCents(amount)}`, "action");
      await refreshWallet();
    },
    [sendMatch, buyInCents, profile.walletCents, pushLog, refreshWallet],
  );

  const standUp = useCallback(async () => {
    await sendMatch(OpStandUp, {});
    setHoleCards([]);
    pushLog("Stood up from table", "action");
    await refreshWallet();
  }, [sendMatch, pushLog, refreshWallet]);

  const startHand = useCallback(async () => {
    await sendMatch(OpStartHand, {});
    pushLog("Starting hand…", "action");
  }, [sendMatch, pushLog]);

  const sendAction = useCallback(
    async (type: string, amount: number) => {
      await sendMatch(OpAction, { type, amount });
      pushLog(`${type.toUpperCase()}${amount ? ` ${formatCents(amount)}` : ""}`, "action");
      setActionRequired(null);
    },
    [sendMatch, pushLog],
  );

  const sendChat = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || !matchId) return;
      await sendMatch(OpChatSend, { text: trimmed });
    },
    [sendMatch, matchId],
  );

  const sendTaunt = useCallback(
    async (key: string) => {
      if (!matchId) return;
      await sendMatch(OpChatSend, { text: `::taunt:${key}::` });
    },
    [sendMatch, matchId],
  );

  const findMatch = useCallback(async () => {
    const socket = socketRef.current;
    if (!socket) return;
    setMatchmakerSearching(true);
    pushLog("Searching for match…", "info");
    try {
      const params = (await callSessionRpc("matchmaker_enqueue", {
        min_players: 2,
        max_players: 6,
        buy_in_cents: Math.min(buyInCents, profile.walletCents),
      })) as {
        query?: string;
        min_count?: number;
        max_count?: number;
        string_properties?: Record<string, string>;
      };
      const ticket = await socket.addMatchmaker(
        params.query ?? "+properties.mode:holdem_cash_6max",
        params.min_count ?? 2,
        params.max_count ?? 6,
        params.string_properties ?? { mode: "holdem_cash_6max" },
      );
      const ticketId = typeof ticket === "string" ? ticket : ticket.ticket;
      socket.onmatchmakermatched = async (matched) => {
        setMatchmakerSearching(false);
        if (matched.match_id) await joinRoom(matched.match_id);
        try {
          await socket.removeMatchmaker(ticketId);
        } catch {
          /* consumed */
        }
      };
    } catch (e) {
      setMatchmakerSearching(false);
      pushLog(e instanceof Error ? e.message : "Matchmaker failed", "error");
    }
  }, [buyInCents, profile.walletCents, joinRoom, pushLog]);

  const setBuyInCents = useCallback((cents: number) => {
    setBuyInCentsState(Math.min(MAX_BUY_IN_CENTS, Math.max(MIN_BUY_IN_CENTS, cents)));
  }, []);

  // Live table preview: updating the create-form seat count re-renders the seat
  // ring immediately (before the table is created).
  const setPreviewSeats = useCallback((n: number) => {
    setMaxSeats(Math.min(MAX_SEATS, Math.max(MIN_SEATS, Math.round(n))));
  }, []);

  const addBot = useCallback(async () => {
    if (!matchId) {
      pushLog("Join or create a table before adding a bot", "error");
      return;
    }
    try {
      await callSessionRpc("table_add_bot", { match_id: matchId });
      pushLog("Added a bot to the table", "info");
    } catch (e) {
      pushLog(e instanceof Error ? e.message : "Add bot failed", "error");
    }
  }, [matchId, pushLog]);

  const value = useMemo<GameContextValue>(
    () => ({
      connected,
      matchId,
      roomId,
      profile,
      snapshot,
      holeCards,
      actionRequired,
      showdown,
      error,
      buyInCents,
      gameLog,
      matchmakerSearching,
      openTables,
      dealTrigger,
      maxSeats,
      chatMessages,
      connect,
      refreshWallet,
      listTables,
      createRoom,
      joinRoom,
      sitDown,
      standUp,
      startHand,
      sendAction,
      findMatch,
      setBuyInCents,
      setPreviewSeats,
      sendChat,
      sendTaunt,
      addBot,
    }),
    [
      connected,
      matchId,
      roomId,
      profile,
      snapshot,
      holeCards,
      actionRequired,
      showdown,
      error,
      buyInCents,
      gameLog,
      matchmakerSearching,
      openTables,
      dealTrigger,
      maxSeats,
      chatMessages,
      connect,
      refreshWallet,
      listTables,
      createRoom,
      joinRoom,
      sitDown,
      standUp,
      startHand,
      sendAction,
      findMatch,
      setBuyInCents,
      setPreviewSeats,
      sendChat,
      sendTaunt,
      addBot,
    ],
  );

  return <GameContext.Provider value={value}>{children}</GameContext.Provider>;
}

export function useGame(): GameContextValue {
  const ctx = useContext(GameContext);
  if (!ctx) throw new Error("useGame must be used within GameProvider");
  return ctx;
}

function formatCents(cents: number): string {
  return `$${(cents / 100).toLocaleString(undefined, { minimumFractionDigits: 0 })}`;
}

export { formatCents };
