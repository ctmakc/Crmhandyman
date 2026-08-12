/**
 * Days the shop typed are local days.
 *
 * `<input type="date">` posts "2026-08-01", and `new Date("2026-08-01")` is parsed as
 * UTC midnight by spec — 20:00 on July 31 in Toronto. A payment dated the first of the
 * month therefore landed in the previous month's book, in the previous month's P&L and
 * in the previous month's export, while `/api/finance/summary` cut the month on local
 * boundaries. The two readings have to use the same calendar.
 */

const DAY_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Parse a date coming from a form. A bare day becomes local midnight; a full timestamp
 * (an ISO string from an API client) is taken as the instant it already is.
 * Blank and unparseable input returns undefined, so callers can fall through to a default.
 */
export function parseDayInput(value: unknown): Date | undefined {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? undefined : value;
  if (typeof value !== "string") return undefined;

  const s = value.trim();
  if (!s) return undefined;

  if (DAY_ONLY.test(s)) {
    const [y, m, d] = s.split("-").map(Number);
    return new Date(y, m - 1, d);
  }

  const parsed = new Date(s);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

/** The local calendar day as YYYY-MM-DD — what the desk shows, so what the CSV prints. */
export function dayStamp(d: Date | string | null | undefined): string {
  if (!d) return "";
  const x = new Date(d);
  if (Number.isNaN(x.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`;
}
