"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";

import { callSessionRpc } from "@/lib/nakama/sessionRpc";
import { useGame } from "@/features/game/GameProvider";

// ?demo=1 has no real match/audit chain to read from — this mirrors the
// exact log text from the approved reference render so the panel has
// something real-looking to show in headless verification.
const DEMO_GROUPS = [
  { label: "PRE-FLOP", lines: ["Player 1: RAISE $550 (Pot $600)", "Player 3: CALL $550 (Pot $1,150)", "Player 5: FOLD"] },
  { label: "FLOP", lines: ["Player 1: BET $400 (Pot $1,550)", "Player 3: CALL $400 (Pot $1,950)"] },
  { label: "TURN", lines: ["Player 1: CHECK (Pot $1,950)", "Player 3: BET $800 (Pot $2,750)"] },
  { label: "SHOWDOWN", lines: ["Player 1: WINS $5,250 (Aces full of Kings)"] },
];

interface AuditEvent {
  event_type: string;
  hand_no: number;
  payload: Record<string, unknown>;
  payload_hash?: string;
}

function readableEvent(ev: AuditEvent): string {
  const p = ev.payload || {};
  switch (ev.event_type) {
    case "hand_started": {
      const sb = p.small_blind ?? p.sb;
      const bb = p.big_blind ?? p.bb;
      return `Hand #${ev.hand_no} dealt${sb && bb ? ` — blinds ${sb}/${bb}` : ""}`;
    }
    case "player_action": {
      const who = (p.player as string) || (p.username as string) || `Seat ${p.seat ?? "?"}`;
      const action = (p.action as string) || (p.type as string) || "acts";
      const amount = p.amount as number | undefined;
      return `${who} ${action}${amount ? ` ${amount}` : ""}`;
    }
    case "hand_settled": {
      const board = Array.isArray(p.board) ? (p.board as string[]).join(" ") : "";
      const pot = p.pot as number | undefined;
      const payouts = p.payouts as Record<string, number> | undefined;
      const winners = payouts ? Object.keys(payouts).length : 0;
      return `Showdown${board ? ` — board ${board}` : ""}${pot ? ` · pot ${pot}` : ""}${winners ? ` · ${winners} paid` : ""}`;
    }
    default:
      return ev.event_type;
  }
}

// Real backend-core events (backend-core/match/holdem/handler.go) carry the
// actual street on player_action ("preflop" | "flop" | "turn" | "river"); a
// hand_started event opens the preflop group, hand_settled is the showdown.
const STREET_LABEL: Record<string, string> = {
  preflop: "PRE-FLOP",
  flop: "FLOP",
  turn: "TURN",
  river: "RIVER",
};

function eventGroup(ev: AuditEvent): string {
  if (ev.event_type === "hand_settled") return "SHOWDOWN";
  const street = (ev.payload?.street as string) || "";
  return STREET_LABEL[street] ?? "PRE-FLOP";
}

/** Hand-history replay: step through every action of past hands at this table,
 *  reconstructed from the tamper-evident audit chain (audit_list). */
export function HandHistoryPanel() {
  const { matchId } = useGame();
  const demo = useSearchParams().get("demo") === "1";
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [handNo, setHandNo] = useState<number | null>(null);
  const [open, setOpen] = useState(true);

  const load = useCallback(async () => {
    if (!matchId) return;
    try {
      const data = (await callSessionRpc("audit_list", { match_id: matchId, limit: 300 })) as {
        events?: AuditEvent[];
      };
      setEvents(data.events ?? []);
    } catch {
      /* ignore */
    }
  }, [matchId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const hands = useMemo(() => {
    const set = new Set<number>();
    for (const e of events) if (e.hand_no > 0) set.add(e.hand_no);
    return Array.from(set).sort((a, b) => b - a);
  }, [events]);

  // Default to the most recent hand once events load.
  useEffect(() => {
    if (handNo === null && hands.length > 0) setHandNo(hands[0]);
  }, [hands, handNo]);

  const groups = useMemo(() => {
    const handEvents = events
      .filter((e) => e.hand_no === handNo)
      .slice()
      .reverse(); // oldest → newest for replay order
    const order = ["PRE-FLOP", "FLOP", "TURN", "RIVER", "SHOWDOWN"];
    const byGroup = new Map<string, AuditEvent[]>();
    for (const ev of handEvents) {
      const g = eventGroup(ev);
      if (!byGroup.has(g)) byGroup.set(g, []);
      byGroup.get(g)!.push(ev);
    }
    return order
      .filter((g) => byGroup.has(g))
      .map((g) => ({ label: g, events: byGroup.get(g)! }));
  }, [events, handNo]);

  if (!matchId && !demo) return null;

  const displayGroups = demo
    ? DEMO_GROUPS.map((g) => ({ label: g.label, events: g.lines }))
    : groups.map((g) => ({ label: g.label, events: g.events.map(readableEvent) }));
  const hasHands = demo || hands.length > 0;

  return (
    <div style={{ position: "absolute", left: 20, top: 20, pointerEvents: "auto" }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        style={{
          display: "flex", alignItems: "center", gap: 5, height: 24, padding: "0 9px",
          borderRadius: 999, border: "1px solid #2AC6D0", background: "rgba(15,23,42,0.72)",
          backdropFilter: "blur(10px)", color: "#4DEEEA", fontSize: 10, fontWeight: 700,
          letterSpacing: "0.16em", textTransform: "uppercase", cursor: "pointer",
        }}
      >
        <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#1CB5C9",
          boxShadow: "0 0 8px rgba(28,181,201,0.9)" }} />
        Hand History
        <span style={{ opacity: 0.7 }}>{open ? "‹" : "›"}</span>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, x: -12, height: 0 }}
            animate={{ opacity: 1, x: 0, height: "auto" }}
            exit={{ opacity: 0, x: -12, height: 0 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            style={{
              marginTop: 6, width: 220, maxHeight: 230, borderRadius: 10,
              background: "rgba(15,23,42,0.72)", backdropFilter: "blur(10px)",
              border: "1px solid #2AC6D0", overflow: "hidden", padding: "8px 6px 6px 0",
              position: "relative", fontSize: 11,
            }}
          >
            {!hasHands ? (
              <p style={{ paddingLeft: 10, fontSize: 11, color: "#94A3B8" }}>No hands recorded yet.</p>
            ) : (
              <>
                {hands.length > 1 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4, paddingLeft: 10, marginBottom: 6 }}>
                    {hands.slice(0, 12).map((n) => (
                      <button
                        key={n}
                        type="button"
                        onClick={() => setHandNo(n)}
                        style={{
                          borderRadius: 4, padding: "1px 6px", fontSize: 10, fontWeight: 700,
                          border: "none", cursor: "pointer",
                          background: handNo === n ? "#e01e2b" : "rgba(255,255,255,0.06)",
                          color: handNo === n ? "#fff" : "#c2c8d0",
                        }}
                      >
                        #{n}
                      </button>
                    ))}
                  </div>
                )}

                <div style={{ position: "absolute", left: 17, top: 10, bottom: 14, width: 2,
                  background: "#1CB5C9", boxShadow: "0 0 8px rgba(28,181,201,0.8)" }} />
                <div style={{ position: "relative", maxHeight: 210, overflowY: "auto" }}>
                  {displayGroups.length === 0 && (
                    <p style={{ paddingLeft: 26, fontSize: 11, color: "#94A3B8" }}>No actions yet.</p>
                  )}
                  {displayGroups.map((g) => (
                    <div key={g.label} style={{ position: "relative", paddingLeft: 26, marginBottom: 7 }}>
                      <div style={{ position: "absolute", left: 13, top: 3, width: 8, height: 8, borderRadius: "50%",
                        background: "#1CB5C9", boxShadow: "0 0 8px rgba(28,181,201,0.9)" }} />
                      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", color: "#4DEEEA" }}>
                        {g.label}
                      </div>
                      {g.events.map((ev, i) => (
                        <div key={i} style={{ fontSize: 10, color: "#FFFFFF", lineHeight: 1.3 }}>
                          {ev}
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
                <div style={{ position: "absolute", left: 15, bottom: 6, width: 0, height: 0,
                  borderLeft: "6px solid transparent", borderRight: "6px solid transparent",
                  borderTop: "10px solid #1CB5C9" }} />
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
