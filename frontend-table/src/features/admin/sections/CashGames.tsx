"use client";

import { useCallback, useEffect, useState } from "react";

import { adminApi } from "../adminRpc";
import { Badge, Card, Empty, Mono, Row, Table, Td, Th } from "../primitives";
import type { Notify } from "./shared";

interface CashRow {
  match_id: string;
  label: string;
  size: number;
  certified: boolean;
}

interface ParsedLabel {
  room_id?: string;
  club_id?: string;
  seated?: number;
  open_seats?: number;
  sb?: number;
  bb?: number;
  status?: string;
}

const money = (c?: number) => (c == null ? "—" : `$${(c / 100).toLocaleString()}`);

function parse(label: string): ParsedLabel {
  try {
    return label ? (JSON.parse(label) as ParsedLabel) : {};
  } catch {
    return {};
  }
}

// HRC platform-admin view of every live cash game. By the certification rule,
// registered players buy into cash games ONLY from the funded, KYC-verified
// global wallet (enforced server-side in reserveBuyIn) — so every table here is a
// verified global-wallet cash game, whether a club owner or a sponsor stood it up.
export function CashGames({ notify }: { notify: Notify }) {
  const [rows, setRows] = useState<CashRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminApi.cashGames();
      setRows(res.cash_games ?? []);
    } catch (err) {
      notify(err instanceof Error ? err.message : "Failed to load cash games", "err");
    } finally {
      setLoading(false);
    }
  }, [notify]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <Card
      eyebrow="Certified · Global Wallet"
      title="Live Cash Games"
      actions={
        <button
          type="button"
          onClick={() => void load()}
          className="rounded-lg border border-white/15 px-3 py-1.5 text-xs font-semibold uppercase tracking-wider hover:border-white/30"
        >
          Refresh
        </button>
      }
    >
      <p className="mb-3 text-xs text-white/50">
        Every live cash game buys in from the funded, KYC-verified global wallet only (club chips can&apos;t
        fund cash play) — so all {rows.length} are HRC-certified.
      </p>
      {rows.length === 0 ? (
        <Empty>{loading ? "Loading…" : "No live cash games right now."}</Empty>
      ) : (
        <Table
          head={
            <Row>
              <Th>Room</Th>
              <Th>Club</Th>
              <Th>Blinds</Th>
              <Th>Seated</Th>
              <Th>Status</Th>
              <Th>Wallet</Th>
            </Row>
          }
        >
          {rows.map((r) => {
            const p = parse(r.label);
            return (
              <Row key={r.match_id}>
                <Td>
                  <Mono>{p.room_id ?? r.match_id.slice(0, 8)}</Mono>
                </Td>
                <Td>{p.club_id ? <Mono>{p.club_id.slice(0, 10)}</Mono> : <span className="text-white/40">Platform</span>}</Td>
                <Td>
                  {money(p.sb)}/{money(p.bb)}
                </Td>
                <Td>
                  {p.seated ?? r.size}
                  {p.open_seats != null ? ` (+${p.open_seats} open)` : ""}
                </Td>
                <Td>{p.status ?? "live"}</Td>
                <Td>
                  <Badge tone="emerald">Global · Certified</Badge>
                </Td>
              </Row>
            );
          })}
        </Table>
      )}
    </Card>
  );
}
