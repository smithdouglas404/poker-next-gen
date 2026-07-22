"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent,
  type KeyboardEvent,
} from "react";

import { formatCents, useGame } from "@/features/game/GameProvider";
import type { TableListItem } from "@/features/game/protocol";
import { callSessionRpc } from "@/lib/nakama/sessionRpc";
import { BTN_RED, GLASS_PANEL, HEADING_SM, cn } from "@/features/ui/tokens";

// Join Private Game modal — HRC "Join Table with Code" surface, GGPoker theme.
//
// Flow (every control binds to a real backend-core RPC):
//   1. 6-box alphanumeric invite code.
//   2. "Search Table" → `room_resolve` resolves the code to a match_id, then
//      `table_list` supplies the live label (room name, blinds, occupancy) for
//      the preview + 3D table thumbnail.
//   3. "Join Game" → GameProvider.joinByCode() (room_resolve + realtime join),
//      applying the resolved-config toggles (auto-play next hand, turn timer).
//
// Offline / guest sessions demo-populate the preview so the surface always
// reads intentionally; a connected session shows the real error instead.

const CODE_LEN = 6;
const CODE_CHARS = /^[A-Z0-9]$/;

const TURN_TIMER_OPTIONS = [10, 15, 20, 30, 45, 60] as const;
type TurnTimer = (typeof TURN_TIMER_OPTIONS)[number];

const AUTOPLAY_KEY = "poker.private.autoplayNext";
const TURN_TIMER_KEY = "poker.private.turnTimer";

interface TablePreview {
  matchId: string | null;
  name: string;
  smallBlind: number;
  bigBlind: number;
  seated: number;
  capacity: number;
  demo?: boolean;
}

/** Parsed shape of a holdem match `label` (see backend-core buildLabel). */
interface MatchLabel {
  room_id?: string;
  sb?: number;
  bb?: number;
  seated?: number;
  open_seats?: number;
}

function parseLabel(label?: string): MatchLabel | null {
  if (!label) return null;
  try {
    return JSON.parse(label) as MatchLabel;
  } catch {
    return null;
  }
}

const DEMO_PREVIEW: TablePreview = {
  matchId: null,
  name: "High Rollers Club Elite",
  smallBlind: 10000,
  bigBlind: 20000,
  seated: 5,
  capacity: 10,
  demo: true,
};

export function JoinPrivateGame({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { joinByCode, connected } = useGame();

  const [digits, setDigits] = useState<string[]>(() => Array<string>(CODE_LEN).fill(""));
  const [searching, setSearching] = useState(false);
  const [joining, setJoining] = useState(false);
  const [preview, setPreview] = useState<TablePreview | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [autoPlayNext, setAutoPlayNext] = useState(false);
  const [turnTimer, setTurnTimer] = useState<TurnTimer>(15);

  const inputsRef = useRef<Array<HTMLInputElement | null>>([]);

  const code = useMemo(() => digits.join(""), [digits]);
  const codeComplete = code.length === CODE_LEN && digits.every((d) => d !== "");

  // Hydrate persisted resolved-config prefs (per-device, like renderMode).
  useEffect(() => {
    if (typeof window === "undefined") return;
    setAutoPlayNext(window.localStorage.getItem(AUTOPLAY_KEY) === "1");
    const savedTimer = Number(window.localStorage.getItem(TURN_TIMER_KEY));
    if (TURN_TIMER_OPTIONS.includes(savedTimer as TurnTimer)) {
      setTurnTimer(savedTimer as TurnTimer);
    }
  }, []);

  // Reset transient state each time the modal opens; focus the first box.
  useEffect(() => {
    if (!open) return;
    setDigits(Array<string>(CODE_LEN).fill(""));
    setPreview(null);
    setError(null);
    setSearching(false);
    setJoining(false);
    const id = window.setTimeout(() => inputsRef.current[0]?.focus(), 40);
    return () => window.clearTimeout(id);
  }, [open]);

  // Close on Escape.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const setDigit = useCallback((idx: number, value: string) => {
    setPreview(null);
    setError(null);
    setDigits((prev) => {
      const next = [...prev];
      next[idx] = value;
      return next;
    });
  }, []);

  const handleChange = useCallback(
    (idx: number, raw: string) => {
      const char = raw.slice(-1).toUpperCase();
      if (char && !CODE_CHARS.test(char)) return;
      setDigit(idx, char);
      if (char && idx < CODE_LEN - 1) inputsRef.current[idx + 1]?.focus();
    },
    [setDigit],
  );

  const handleKeyDown = useCallback(
    (idx: number, e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Backspace" && !digits[idx] && idx > 0) {
        e.preventDefault();
        setDigit(idx - 1, "");
        inputsRef.current[idx - 1]?.focus();
      } else if (e.key === "ArrowLeft" && idx > 0) {
        inputsRef.current[idx - 1]?.focus();
      } else if (e.key === "ArrowRight" && idx < CODE_LEN - 1) {
        inputsRef.current[idx + 1]?.focus();
      }
    },
    [digits, setDigit],
  );

  const handlePaste = useCallback(
    (e: ClipboardEvent<HTMLInputElement>) => {
      e.preventDefault();
      const clean = e.clipboardData
        .getData("text")
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, "")
        .slice(0, CODE_LEN);
      if (!clean) return;
      setPreview(null);
      setError(null);
      const next = Array<string>(CODE_LEN).fill("");
      for (let i = 0; i < clean.length; i += 1) next[i] = clean[i]!;
      setDigits(next);
      const focusIdx = Math.min(clean.length, CODE_LEN - 1);
      inputsRef.current[focusIdx]?.focus();
    },
    [],
  );

  const handleSearch = useCallback(async () => {
    if (!codeComplete || searching) return;
    setSearching(true);
    setError(null);
    setPreview(null);
    try {
      // 1) Resolve the invite code → match_id.
      const resolved = (await callSessionRpc("room_resolve", { code })) as {
        match_id?: string;
      };
      const matchId = resolved.match_id ?? null;
      if (!matchId) throw new Error("No table found for that code");

      // 2) Enrich with the live match label from table_list.
      let label: MatchLabel | null = null;
      try {
        const listed = (await callSessionRpc("table_list", {})) as {
          matches?: TableListItem[];
        };
        const match = listed.matches?.find((m) => m.match_id === matchId);
        label = parseLabel(match?.label);
        if (label && match) {
          if (label.seated === undefined) label.seated = match.seated;
          if (label.open_seats === undefined) label.open_seats = match.open_seats;
        }
      } catch {
        /* label enrichment is best-effort */
      }

      const seated = label?.seated ?? 0;
      const openSeats = label?.open_seats ?? Math.max(0, 10 - seated);
      setPreview({
        matchId,
        name: label?.room_id || "Private Table",
        smallBlind: label?.sb ?? 0,
        bigBlind: label?.bb ?? 0,
        seated,
        capacity: seated + openSeats || 10,
      });
    } catch (e) {
      // Offline / guest: show the demo preview so the surface stays intentional.
      if (!connected) {
        setPreview({ ...DEMO_PREVIEW });
      } else {
        setError(e instanceof Error ? e.message : "No table found for that code");
      }
    } finally {
      setSearching(false);
    }
  }, [code, codeComplete, searching, connected]);

  const handleJoin = useCallback(async () => {
    if (!preview || joining) return;
    if (preview.demo) {
      setError("This is a demo preview — connect to join a live table.");
      return;
    }
    setJoining(true);
    setError(null);
    try {
      // Persist the resolved-config prefs for this device before entering.
      if (typeof window !== "undefined") {
        window.localStorage.setItem(AUTOPLAY_KEY, autoPlayNext ? "1" : "0");
        window.localStorage.setItem(TURN_TIMER_KEY, String(turnTimer));
      }
      // joinByCode → room_resolve + realtime joinMatch. The lobby routes to
      // /table as soon as GameProvider sets matchId.
      await joinByCode(code);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not join that table");
      setJoining(false);
    }
  }, [preview, joining, autoPlayNext, turnTimer, joinByCode, code, onClose]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Join Private Game"
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
    >
      {/* backdrop */}
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
      />

      <div
        className={cn(
          GLASS_PANEL,
          "relative w-full max-w-2xl overflow-hidden border-white/[0.08]",
        )}
      >
        {/* header */}
        <div className="flex items-center justify-between border-b border-white/[0.06] px-6 py-5">
          <div>
            <p className={HEADING_SM}>High Rollers Club</p>
            <h2 className="mt-1 font-display text-2xl font-bold uppercase tracking-wide text-foreground">
              Join Private Game
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid h-9 w-9 place-items-center rounded-full border border-white/10 text-neutral-400 transition hover:border-white/25 hover:text-white"
          >
            ✕
          </button>
        </div>

        <div className="grid gap-6 p-6 md:grid-cols-2">
          {/* ---- left: code entry + preview facts ---- */}
          <div className="space-y-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-neutral-400">
                Alphanumeric Invitation Code
              </p>
              <div className="mt-3 flex gap-2" onPaste={handlePaste}>
                {digits.map((d, i) => (
                  <input
                    // eslint-disable-next-line react/no-array-index-key
                    key={i}
                    ref={(el) => {
                      inputsRef.current[i] = el;
                    }}
                    value={d}
                    inputMode="text"
                    autoComplete="off"
                    maxLength={1}
                    aria-label={`Invite code character ${i + 1}`}
                    onChange={(e) => handleChange(i, e.target.value)}
                    onKeyDown={(e) => handleKeyDown(i, e)}
                    onFocus={(e) => e.target.select()}
                    className={cn(
                      "h-14 w-full min-w-0 rounded-lg border bg-black/50 text-center font-display text-xl font-bold uppercase text-gold outline-none transition",
                      d
                        ? "border-gold/50 shadow-[0_0_14px_-4px_rgba(245,197,24,0.5)]"
                        : "border-white/12 focus:border-gold/40",
                      "focus:ring-2 focus:ring-gold/15",
                    )}
                  />
                ))}
              </div>
            </div>

            <button
              type="button"
              onClick={() => void handleSearch()}
              disabled={!codeComplete || searching}
              className="w-full rounded-lg border border-white/15 bg-white/[0.04] px-4 py-2.5 text-sm font-bold uppercase tracking-wide text-neutral-100 transition hover:border-white/30 hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-40"
            >
              {searching ? "Searching…" : "Search Table"}
            </button>

            {error && (
              <div className="rounded-lg border border-[#e01e2b]/30 bg-[#e01e2b]/10 px-3 py-2 text-xs text-[#ff9ba1]">
                {error}
              </div>
            )}

            {preview ? (
              <dl className="space-y-2 rounded-lg border border-white/[0.06] bg-black/30 p-4 text-sm">
                {preview.demo && (
                  <div className="mb-1 flex justify-end">
                    <span className="rounded-full bg-amber-400/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-amber-300">
                      Demo Preview
                    </span>
                  </div>
                )}
                <PreviewRow k="Table Name" v={preview.name} accent="foreground" />
                <PreviewRow
                  k="Blind Levels"
                  v={
                    preview.bigBlind > 0
                      ? `${formatCents(preview.smallBlind)}/${formatCents(preview.bigBlind)}`
                      : "—"
                  }
                  accent="green"
                />
                <PreviewRow
                  k="Number of Players"
                  v={`${preview.seated}/${preview.capacity}`}
                  accent="foreground"
                />
              </dl>
            ) : (
              <p className="rounded-lg border border-dashed border-white/10 bg-black/20 p-4 text-center text-xs text-neutral-500">
                Enter your 6-character code and search to preview the table.
              </p>
            )}
          </div>

          {/* ---- right: 3D table thumbnail ---- */}
          <div className="flex flex-col">
            <TableThumbnail
              seated={preview?.seated ?? 0}
              capacity={preview?.capacity ?? 10}
              active={!!preview}
            />
            <p className="mt-2 text-center text-[10px] uppercase tracking-[0.2em] text-neutral-600">
              {preview ? "Live Table Preview" : "Awaiting Search"}
            </p>
          </div>
        </div>

        {/* ---- resolved config ---- */}
        <div className="grid gap-4 border-t border-white/[0.06] px-6 py-5 sm:grid-cols-2">
          <button
            type="button"
            role="switch"
            aria-checked={autoPlayNext}
            onClick={() => setAutoPlayNext((v) => !v)}
            className="flex items-center gap-3 text-left"
          >
            <span
              className={cn(
                "relative h-6 w-11 shrink-0 rounded-full border transition",
                autoPlayNext
                  ? "border-green/50 bg-green/25"
                  : "border-white/15 bg-white/5",
              )}
            >
              <span
                className={cn(
                  "absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all",
                  autoPlayNext ? "left-[1.45rem]" : "left-0.5",
                )}
              />
            </span>
            <span>
              <span className="block text-sm font-semibold text-foreground">
                Auto-Play Next Hand
              </span>
              <span className="block text-[10px] text-neutral-500">
                Stay seated and auto-post the next hand.
              </span>
            </span>
          </button>

          <label className="block space-y-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400">
              Turn Timer
            </span>
            <select
              value={turnTimer}
              onChange={(e) => setTurnTimer(Number(e.target.value) as TurnTimer)}
              className="w-full rounded-lg border border-white/10 bg-black/40 px-4 py-2.5 text-sm text-white outline-none transition focus:border-gold/40 focus:ring-2 focus:ring-gold/15"
            >
              {TURN_TIMER_OPTIONS.map((t) => (
                <option key={t} value={t} className="bg-[#1c2128]">
                  {t} Seconds
                </option>
              ))}
            </select>
          </label>
        </div>

        {/* ---- footer / join ---- */}
        <div className="flex items-center justify-end gap-3 border-t border-white/[0.06] px-6 py-5">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-white/15 px-5 py-2.5 text-sm font-bold uppercase tracking-wide text-neutral-300 transition hover:bg-white/5 hover:text-white"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleJoin()}
            disabled={!preview || joining || !!preview?.demo}
            className={cn(
              BTN_RED,
              "rounded-xl px-8 py-2.5 text-sm uppercase tracking-wide disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none",
            )}
          >
            {joining ? "Joining…" : "Join Game"}
          </button>
        </div>
      </div>
    </div>
  );
}

function PreviewRow({
  k,
  v,
  accent,
}: {
  k: string;
  v: string;
  accent: "foreground" | "green";
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="text-neutral-400">{k}:</dt>
      <dd
        className={cn(
          "font-display font-bold",
          accent === "green" ? "text-green" : "text-foreground",
        )}
      >
        {v}
      </dd>
    </div>
  );
}

// A lightweight felt-table thumbnail for the lobby preview (NOT the live
// cinematic table). Real occupancy drives which seat markers are lit.
function TableThumbnail({
  seated,
  capacity,
  active,
}: {
  seated: number;
  capacity: number;
  active: boolean;
}) {
  const cap = Math.max(2, Math.min(10, capacity || 10));
  const seats = Array.from({ length: cap }, (_, i) => i < seated);
  // Ellipse-distribute the seat markers around the rail.
  const cx = 160;
  const cy = 100;
  const rx = 118;
  const ry = 62;

  return (
    <div
      className={cn(
        "relative flex-1 overflow-hidden rounded-xl border border-white/[0.08]",
        active ? "opacity-100" : "opacity-50",
      )}
      style={{ background: "radial-gradient(120% 120% at 50% 0%, #101418, #05070a)" }}
    >
      <svg viewBox="0 0 320 200" className="h-full w-full" role="img" aria-label="Table preview">
        <defs>
          <radialGradient id="jpg-felt" cx="50%" cy="42%" r="70%">
            <stop offset="0%" stopColor="#1c7d4e" />
            <stop offset="60%" stopColor="#0f5f39" />
            <stop offset="100%" stopColor="#053821" />
          </radialGradient>
        </defs>
        {/* gunmetal rail */}
        <ellipse cx={cx} cy={cy} rx={rx + 12} ry={ry + 12} fill="#171b22" />
        {/* gold pinstripe */}
        <ellipse
          cx={cx}
          cy={cy}
          rx={rx + 6}
          ry={ry + 6}
          fill="none"
          stroke="#f5c518"
          strokeOpacity={0.55}
          strokeWidth={1.5}
        />
        {/* felt */}
        <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill="url(#jpg-felt)" />
        {/* gold inner ring */}
        <ellipse
          cx={cx}
          cy={cy}
          rx={rx - 26}
          ry={ry - 20}
          fill="none"
          stroke="#d4af37"
          strokeOpacity={0.35}
          strokeWidth={1}
        />
        <text
          x={cx}
          y={cy + 4}
          textAnchor="middle"
          className="font-display"
          fontSize="12"
          fill="#f5c518"
          fillOpacity={0.7}
          letterSpacing="2"
        >
          ♦ HRC
        </text>
        {/* seat markers */}
        {seats.map((occupied, i) => {
          const angle = (Math.PI * 2 * i) / cap - Math.PI / 2;
          const x = cx + Math.cos(angle) * (rx + 3);
          const y = cy + Math.sin(angle) * (ry + 3);
          return (
            <circle
              key={i}
              cx={x}
              cy={y}
              r={5.5}
              fill={occupied ? "#22c55e" : "#0b0d0f"}
              stroke={occupied ? "#22c55e" : "#3a4250"}
              strokeWidth={1.5}
              opacity={occupied ? 1 : 0.7}
            />
          );
        })}
      </svg>
    </div>
  );
}
