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
  INITIAL_WALLET_CENTS,
  OpAction,
  OpDealPrivate,
  OpBoard,
  OpActionRequired,
  OpSnapshot,
  OpStartHand,
  OpSitDown,
  OpStandUp,
  OpError,
  type ActionRequiredMessage,
  type CardView,
  type DealPrivateMessage,
  type GameState,
  type TableSnapshot,
} from "./protocol";
import { createNakamaClient, type Session, type Socket } from "@/lib/nakama/client";

interface GameContextValue extends GameState {
  connect: () => Promise<void>;
  createRoom: (name?: string) => Promise<void>;
  joinRoom: (matchId: string) => Promise<void>;
  sitDown: (seat: number) => Promise<void>;
  standUp: () => Promise<void>;
  startHand: () => Promise<void>;
  sendAction: (type: string, amount: number) => Promise<void>;
}

const GameContext = createContext<GameContextValue | null>(null);

function deviceId(): string {
  if (typeof window === "undefined") return "ssr";
  const key = "png-device-id";
  let id = localStorage.getItem(key);
  if (!id) {
    id = `dev-${Math.random().toString(36).slice(2, 10)}`;
    localStorage.setItem(key, id);
  }
  return id;
}

export function GameProvider({ children }: { children: ReactNode }) {
  const clientRef = useRef(createNakamaClient());
  const sessionRef = useRef<Session | null>(null);
  const socketRef = useRef<Socket | null>(null);

  const [connected, setConnected] = useState(false);
  const [matchId, setMatchId] = useState<string | null>(null);
  const [roomId, setRoomId] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<TableSnapshot | null>(null);
  const [holeCards, setHoleCards] = useState<CardView[]>([]);
  const [actionRequired, setActionRequired] = useState<ActionRequiredMessage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState({
    userId: "",
    username: "Guest",
    walletCents: INITIAL_WALLET_CENTS,
  });

  const wireSocket = useCallback((socket: Socket) => {
    socket.onmatchdata = (md) => {
      const payload = md.data ? JSON.parse(new TextDecoder().decode(md.data)) : null;
      switch (md.op_code) {
        case OpSnapshot:
          setSnapshot(payload as TableSnapshot);
          break;
        case OpDealPrivate:
          setHoleCards((payload as DealPrivateMessage).cards);
          break;
        case OpBoard:
          setSnapshot((prev) =>
            prev ? { ...prev, board: payload.board, phase: payload.phase } : prev,
          );
          break;
        case OpActionRequired:
          setActionRequired(payload as ActionRequiredMessage);
          break;
        case OpError:
          setError(payload.message ?? "Game error");
          break;
        default:
          break;
      }
    };
  }, []);

  const connect = useCallback(async () => {
    const client = clientRef.current;
    const session = await client.authenticateDevice(deviceId(), true);
    sessionRef.current = session;
    setProfile({
      userId: session.user_id ?? "",
      username: session.username ?? "Player",
      walletCents: INITIAL_WALLET_CENTS,
    });
    const socket = client.createSocket(client.useSSL, false);
    await socket.connect(session, true);
    socketRef.current = socket;
    wireSocket(socket);
    setConnected(true);
  }, [wireSocket]);

  useEffect(() => {
    void connect().catch((e) => setError(e instanceof Error ? e.message : "Connect failed"));
  }, [connect]);

  const joinRoom = useCallback(async (id: string) => {
    const socket = socketRef.current;
    if (!socket) return;
    await socket.joinMatch(id);
    setMatchId(id);
    setHoleCards([]);
    setActionRequired(null);
  }, []);

  const createRoom = useCallback(async (name?: string) => {
    const res = await fetch("/api/nakama/table/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name ?? "Hold'em Table" }),
    });
    const json = await res.json();
    if (!json.ok) throw new Error(json.error ?? "Create room failed");
    setRoomId(json.data.room_id);
    await joinRoom(json.data.match_id);
  }, [joinRoom]);

  const sendMatch = useCallback(async (opCode: number, body: unknown) => {
    const socket = socketRef.current;
    if (!socket || !matchId) return;
    const data = new TextEncoder().encode(JSON.stringify(body));
    await socket.sendMatchState(matchId, opCode, data);
  }, [matchId]);

  const sitDown = useCallback(async (seat: number) => {
    await sendMatch(OpSitDown, { seat, buy_in: INITIAL_WALLET_CENTS });
  }, [sendMatch]);

  const standUp = useCallback(async () => {
    await sendMatch(OpStandUp, {});
    setHoleCards([]);
  }, [sendMatch]);

  const startHand = useCallback(async () => {
    await sendMatch(OpStartHand, {});
  }, [sendMatch]);

  const sendAction = useCallback(async (type: string, amount: number) => {
    await sendMatch(OpAction, { type, amount });
    setActionRequired(null);
  }, [sendMatch]);

  const value = useMemo<GameContextValue>(
    () => ({
      connected,
      matchId,
      roomId,
      profile,
      snapshot,
      holeCards,
      actionRequired,
      error,
      connect,
      createRoom,
      joinRoom,
      sitDown,
      standUp,
      startHand,
      sendAction,
    }),
    [
      connected,
      matchId,
      roomId,
      profile,
      snapshot,
      holeCards,
      actionRequired,
      error,
      connect,
      createRoom,
      joinRoom,
      sitDown,
      standUp,
      startHand,
      sendAction,
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
