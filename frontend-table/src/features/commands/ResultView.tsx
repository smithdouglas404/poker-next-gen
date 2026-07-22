"use client";

import { formatBps, formatMoney } from "./schemaForm/format";

// Polished result rendering (UI review P1-2): RPC responses render as tables,
// balance cards, and plain-language statements — never a raw JSON dump. One
// component picks the right view by response shape, so every read command in the
// Command Center reads as product, not developer output.

const MONEY_KEYS = /(_minor|_cents|balance|buy_?in|pot|cap|stack|amount|payout_minor|fee_minor|guaranteed_minor)$/i;
const BPS_KEYS = /_bps$/i;
const TIME_KEYS = /_at$/i;
const ID_KEYS = /(^id$|_id$)/i;

function prettyKey(k: string): string {
  return k
    .replace(/_/g, " ")
    .replace(/\bbps\b/i, "%")
    .replace(/\bminor\b/i, "")
    .replace(/\bid\b/i, "ID")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatValue(key: string, value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") {
    if (BPS_KEYS.test(key)) return formatBps(value);
    if (MONEY_KEYS.test(key)) return formatMoney(value);
    return value.toLocaleString();
  }
  if (typeof value === "string") {
    if (TIME_KEYS.test(key)) {
      const d = new Date(value);
      if (!Number.isNaN(d.getTime())) return d.toLocaleString();
    }
    if (ID_KEYS.test(key) && value.length > 12) return value.slice(0, 8) + "…";
    return value;
  }
  if (Array.isArray(value)) return `${value.length} item${value.length === 1 ? "" : "s"}`;
  return "…";
}

/** Choose the columns for an array-of-objects table: prefer human keys, cap the
 *  count, and drop noisy id/timestamp columns when there's plenty else to show. */
function columnsFor(rows: Record<string, unknown>[]): string[] {
  const keys = new Set<string>();
  for (const r of rows.slice(0, 20)) Object.keys(r).forEach((k) => keys.add(k));
  const all = [...keys];
  const priority = ["name", "title", "username", "role", "status", "currency", "balance"];
  const ranked = all.sort((a, b) => {
    const pa = priority.indexOf(a);
    const pb = priority.indexOf(b);
    if (pa !== -1 || pb !== -1) return (pa === -1 ? 99 : pa) - (pb === -1 ? 99 : pb);
    return 0;
  });
  const trimmed = ranked.filter((k) => !TIME_KEYS.test(k));
  const base = (trimmed.length >= 3 ? trimmed : ranked).filter(
    (k) => !(ID_KEYS.test(k) && trimmed.length > 4),
  );
  return base.slice(0, 6);
}

function DataTable({ rows }: { rows: Record<string, unknown>[] }) {
  if (rows.length === 0) {
    return <p className="text-sm text-muted">Nothing to show yet.</p>;
  }
  const cols = columnsFor(rows);
  return (
    <div className="overflow-x-auto rounded-xl border border-white/10">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-white/10 bg-white/[0.03]">
            {cols.map((c) => (
              <th key={c} className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted">
                {prettyKey(c)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-white/5 last:border-0 hover:bg-white/[0.02]">
              {cols.map((c) => (
                <td key={c} className="px-3 py-2 text-neutral-200">
                  {c === "role" || c === "status" ? (
                    <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] font-medium text-neutral-200">
                      {formatValue(c, row[c])}
                    </span>
                  ) : (
                    formatValue(c, row[c])
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function KeyValueCard({ obj }: { obj: Record<string, unknown> }) {
  const entries = Object.entries(obj).filter(
    ([, v]) => v === null || typeof v !== "object" || Array.isArray(v) === false,
  );
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
      {entries.map(([k, v]) => {
        if (v !== null && typeof v === "object" && !Array.isArray(v)) return null;
        return (
          <div key={k} className="flex items-baseline justify-between gap-3 border-b border-white/5 py-1.5">
            <dt className="text-[11px] font-semibold uppercase tracking-wider text-muted">{prettyKey(k)}</dt>
            <dd className="text-sm font-medium text-white">{formatValue(k, v)}</dd>
          </div>
        );
      })}
    </dl>
  );
}

function BalanceCard({
  amountMinor,
  currency,
  lockedMinor,
  label,
}: {
  amountMinor: number;
  currency?: string;
  lockedMinor?: number;
  label?: string;
}) {
  return (
    <div className="flex flex-wrap items-end gap-6 rounded-xl border border-gold/25 bg-gold/[0.06] p-4">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wider text-gold/80">{label ?? "Balance"}</p>
        <p className="mt-1 text-3xl font-bold text-white">{formatMoney(amountMinor, currency)}</p>
      </div>
      {lockedMinor != null && lockedMinor > 0 && (
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">In play</p>
          <p className="mt-1 text-lg font-semibold text-neutral-300">{formatMoney(lockedMinor, currency)}</p>
        </div>
      )}
    </div>
  );
}

function RakeStatement({ r }: { r: Record<string, unknown> }) {
  const pct = typeof r.percent_bps === "number" ? formatBps(r.percent_bps) : "—";
  const cap = typeof r.cap_minor === "number" ? formatMoney(r.cap_minor) : null;
  const minPot = typeof r.min_pot_minor === "number" && r.min_pot_minor > 0 ? formatMoney(r.min_pot_minor) : null;
  const parts = [`${pct} rake`];
  if (cap) parts.push(`capped at ${cap}`);
  if (r.no_flop_no_drop) parts.push("no flop, no drop");
  if (minPot) parts.push(`min pot ${minPot}`);
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">
        {(r.name as string) || "Rake rule"}
      </p>
      <p className="mt-1 text-lg font-semibold text-white">{parts.join(" · ")}</p>
      {r.public ? (
        <p className="mt-1 text-xs text-green">Publicly visible to players</p>
      ) : (
        <p className="mt-1 text-xs text-muted">Private to club members</p>
      )}
    </div>
  );
}

function firstArray(obj: Record<string, unknown>): { key: string; rows: Record<string, unknown>[] } | null {
  for (const [k, v] of Object.entries(obj)) {
    if (Array.isArray(v) && v.length > 0 && typeof v[0] === "object") {
      return { key: k, rows: v as Record<string, unknown>[] };
    }
    if (Array.isArray(v) && v.length === 0) {
      return { key: k, rows: [] };
    }
  }
  return null;
}

export function ResultView({ commandId, data }: { commandId: string; data: unknown }) {
  if (data === null || data === undefined) {
    return <p className="text-sm text-green">Done.</p>;
  }
  if (typeof data === "string" || typeof data === "number" || typeof data === "boolean") {
    return <p className="text-sm text-neutral-200">{String(data)}</p>;
  }

  // Arrays of objects -> table.
  if (Array.isArray(data)) {
    return <DataTable rows={data as Record<string, unknown>[]} />;
  }

  const obj = data as Record<string, unknown>;

  // Rake config -> plain-language statement.
  if ("percent_bps" in obj || (commandId.includes("rake_config") && "cap_minor" in obj)) {
    return <RakeStatement r={obj} />;
  }

  // Allocated / wallet balance -> balance card.
  if ("balance" in obj && ("locked_amount" in obj || "currency" in obj) && typeof obj.balance === "number") {
    return (
      <BalanceCard
        amountMinor={obj.balance as number}
        currency={obj.currency as string}
        lockedMinor={obj.locked_amount as number | undefined}
        label={commandId.includes("wallet") ? "Wallet balance" : "Club balance"}
      />
    );
  }
  if (typeof obj.available === "number" || (typeof obj.balance === "number" && commandId.includes("wallet"))) {
    return (
      <BalanceCard
        amountMinor={(obj.available ?? obj.balance) as number}
        currency={obj.currency as string}
        label="Wallet balance"
      />
    );
  }

  // A response wrapping a single array (clubs / members / tournaments / …) -> table.
  const arr = firstArray(obj);
  if (arr) {
    return (
      <div className="space-y-2">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">
          {prettyKey(arr.key)} · {arr.rows.length}
        </p>
        <DataTable rows={arr.rows} />
      </div>
    );
  }

  // Fallback: a clean key/value card (still no raw JSON).
  return <KeyValueCard obj={obj} />;
}
