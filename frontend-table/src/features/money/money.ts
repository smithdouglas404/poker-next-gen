// Mode-aware money formatting (UI review P0-7).
//
// A number on screen is ambiguous: is "$1,000" withdrawable cash, play chips
// with no cash value, or a club-internal credit that only settles inside that
// club? A player must never confuse the three. This module is the single place
// that decides the glyph and the qualifier for each money mode, building on the
// exact-cents formatters in `features/commands/schemaForm/format.ts`.
//
//   cash  — real money, backed by the wallet, withdrawable   → "$1,000.00"
//   chips — play chips, no cash value                         → "⛃ 1,000"
//   club  — club-allocated credit, settles inside the club    → "$1,000.00" + "Club credit"
//
// The mode is a property of the *context* (a wallet is cash, a play table is
// chips, a club-allocated balance is club credit), so callers pass it in.

import { formatMoney, minorToDecimalString, currencySymbol } from "@/features/commands/schemaForm/format";

export type MoneyMode = "cash" | "chips" | "club";

// Play-chip glyph — matches the "CHIPS" currency symbol used in club setup.
export const CHIP_GLYPH = "⛃";

/** Infer the money mode from a currency code. "CHIPS" → play chips; everything
 *  else is real cash unless the caller overrides to "club" for allocated credit. */
export function moneyModeForCurrency(code?: string): MoneyMode {
  return (code ?? "").toUpperCase() === "CHIPS" ? "chips" : "cash";
}

/** A short human qualifier for the mode, for badges/tooltips. */
export function moneyModeLabel(mode: MoneyMode): string {
  switch (mode) {
    case "chips":
      return "Play chips";
    case "club":
      return "Club credit";
    case "cash":
    default:
      return "Cash";
  }
}

/** A one-line explanation of what the mode means for the player. */
export function moneyModeHint(mode: MoneyMode): string {
  switch (mode) {
    case "chips":
      return "Play chips have no cash value and cannot be withdrawn.";
    case "club":
      return "Club credit settles inside this club and is not withdrawable to your wallet.";
    case "cash":
    default:
      return "Real-money balance, backed by your wallet.";
  }
}

/** Compact grouped whole-unit string for chips ("1,000"). */
function chipUnits(cents: number, currency?: string): string {
  // Chips carry no fractional value; show whole units with the chip glyph.
  const whole = Math.round((cents ?? 0) / 100);
  return `${CHIP_GLYPH} ${whole.toLocaleString("en-US")}`;
}

/**
 * Format a cents amount for its money mode. Cash and club render the exact
 * decimal with a currency symbol (club is numerically identical to cash — the
 * difference is *settlement*, surfaced by the qualifier, not the number). Chips
 * render as whole play-chip units with the chip glyph.
 */
export function formatMoneyMode(
  cents: number,
  mode: MoneyMode,
  opts?: { currency?: string; withLabel?: boolean },
): string {
  const currency = opts?.currency;
  let base: string;
  switch (mode) {
    case "chips":
      base = chipUnits(cents, currency);
      break;
    case "club":
    case "cash":
    default:
      base = formatMoney(cents, currency);
      break;
  }
  if (opts?.withLabel && mode !== "cash") {
    return `${base} · ${moneyModeLabel(mode)}`;
  }
  return base;
}

// Re-export the low-level formatters so callers have one money import surface.
export { formatMoney, minorToDecimalString, currencySymbol };
