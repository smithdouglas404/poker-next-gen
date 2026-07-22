// Money / basis-points formatting (UI review P0-2).
//
// The backend speaks minor units (cents) and basis points. A human should never
// read `balance: 100000` or `percent_bps: 500` — these turn them into
// "$1,000.00" and "5%" and back, so the wire value stays exact while the operator
// sees real money.

const CURRENCY_SYMBOL: Record<string, string> = {
  USD: "$",
  EUR: "€",
  GBP: "£",
  CAD: "CA$",
  AUD: "A$",
};

export function currencySymbol(code?: string): string {
  return CURRENCY_SYMBOL[(code ?? "USD").toUpperCase()] ?? "$";
}

/** minor units (cents) -> "1,000.00" (no symbol). */
export function minorToDecimalString(minor: number): string {
  const negative = minor < 0;
  const abs = Math.abs(Math.round(minor));
  const dollars = Math.floor(abs / 100);
  const cents = abs % 100;
  const grouped = dollars.toLocaleString("en-US");
  return `${negative ? "-" : ""}${grouped}.${cents.toString().padStart(2, "0")}`;
}

/** minor units -> "$1,000.00". */
export function formatMoney(minor: number, currency?: string): string {
  return `${currencySymbol(currency)}${minorToDecimalString(minor)}`;
}

/** "1,000.00" or "1000" -> minor units (cents). Returns null when unparseable. */
export function decimalStringToMinor(input: string): number | null {
  const cleaned = input.replace(/[^0-9.\-]/g, "");
  if (cleaned === "" || cleaned === "-" || cleaned === ".") return null;
  const value = Number(cleaned);
  if (!Number.isFinite(value)) return null;
  return Math.round(value * 100);
}

/** basis points -> "5%" (or "5.25%"). */
export function formatBps(bps: number): string {
  const pct = bps / 100;
  const str = Number.isInteger(pct) ? pct.toString() : pct.toFixed(2);
  return `${str}%`;
}

/** a percent string/number -> basis points. "5" -> 500, "5.25" -> 525. */
export function percentToBps(input: string | number): number | null {
  const value = typeof input === "number" ? input : Number(input.replace(/[^0-9.\-]/g, ""));
  if (!Number.isFinite(value)) return null;
  return Math.round(value * 100);
}

/** basis points -> percent number for the input box (500 -> 5). */
export function bpsToPercentNumber(bps: number): number {
  return Math.round((bps / 100) * 100) / 100;
}
