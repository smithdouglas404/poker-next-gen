// The table's daily operating window, and the local↔UTC conversion it needs.
//
// The server stores and enforces the window in minutes past midnight UTC
// (backend-core/store/daily_window.go). It has to: a match runs on one server
// clock, and "open at 20:00" must mean the same instant for every player at the
// table regardless of where they are sitting.
//
// The operator, though, thinks in their own clock. So the form takes local time
// and converts, and — because a converted window can land on a surprising UTC
// hour, and because the wrap-midnight case is easy to get wrong — it also shows
// the operator exactly what is being sent.

/** Minutes past midnight for a local "HH:MM", or null if unparseable. */
export function parseClock(hhmm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return h * 60 + min;
}

/** Minutes past midnight → "HH:MM". */
export function formatClock(minutes: number): string {
  const m = ((minutes % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

/**
 * Shift local minutes-past-midnight into UTC minutes-past-midnight.
 *
 * `getTimezoneOffset()` returns minutes to ADD to local to reach UTC (it is
 * positive west of Greenwich), so the conversion is a plain addition. The result
 * is wrapped into 0–1439: a window can legitimately cross midnight in UTC even
 * when it does not locally, which is precisely the case the server's
 * wrap-midnight handling exists for.
 */
export function localMinutesToUtc(localMinutes: number, offsetMinutes?: number): number {
  const off = offsetMinutes ?? new Date().getTimezoneOffset();
  return (((localMinutes + off) % 1440) + 1440) % 1440;
}

/** The reverse, for displaying a window the server already holds. */
export function utcMinutesToLocal(utcMinutes: number, offsetMinutes?: number): number {
  const off = offsetMinutes ?? new Date().getTimezoneOffset();
  return (((utcMinutes - off) % 1440) + 1440) % 1440;
}

export interface OperatingWindow {
  /** What table_create receives. Equal values mean "always open". */
  startMin: number;
  endMin: number;
  /** The same window written back out, for the operator to check. */
  utcLabel: string;
  /** True when the window wraps midnight UTC — worth calling out. */
  wrapsMidnight: boolean;
  /** Set when the operator's input cannot be used. */
  error: string | null;
}

/**
 * Build the payload values from the two local time inputs.
 *
 * A window whose start equals its end is rejected rather than silently sent,
 * because the server reads equal endpoints as "always open" — the operator would
 * have asked for a closed table and been given a permanently open one.
 */
export function buildOperatingWindow(
  enabled: boolean,
  localStart: string,
  localEnd: string,
  offsetMinutes?: number,
): OperatingWindow {
  if (!enabled) {
    return { startMin: 0, endMin: 0, utcLabel: "", wrapsMidnight: false, error: null };
  }
  const s = parseClock(localStart);
  const e = parseClock(localEnd);
  if (s === null || e === null) {
    return {
      startMin: 0,
      endMin: 0,
      utcLabel: "",
      wrapsMidnight: false,
      error: "Enter both times as HH:MM.",
    };
  }
  const startMin = localMinutesToUtc(s, offsetMinutes);
  const endMin = localMinutesToUtc(e, offsetMinutes);
  if (startMin === endMin) {
    return {
      startMin: 0,
      endMin: 0,
      utcLabel: "",
      wrapsMidnight: false,
      error: "Opening and closing times must differ — a zero-length window would leave the table open around the clock.",
    };
  }
  return {
    startMin,
    endMin,
    utcLabel: `${formatClock(startMin)}–${formatClock(endMin)} UTC`,
    wrapsMidnight: startMin > endMin,
    error: null,
  };
}
