/**
 * Service-contract scheduling.
 *
 * Like overdue invoices, the schedule is derived rather than stored. A `nextVisitOn`
 * column would need a cron to stay true and would quietly go stale the first time a
 * run is missed; computing the due date from the visit months and what has already
 * been booked means the desk can never disagree with reality.
 */

export interface ContractLike {
  id: string;
  visitMonths: string;
  active: boolean;
  startedOn: Date | string;
}

/** Visit months are stored as a JSON array of 1-12. Bad data must not crash the deck. */
export function visitMonthsOf(contract: { visitMonths: string }): number[] {
  try {
    const parsed = JSON.parse(contract.visitMonths);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((m) => Number(m))
      .filter((m) => Number.isInteger(m) && m >= 1 && m <= 12)
      .sort((a, b) => a - b);
  } catch {
    return [];
  }
}

/** A stable key for "the spring 2026 visit", used to stop double-booking. */
export function cycleKey(year: number, month: number) {
  return `${year}-${String(month).padStart(2, "0")}`;
}

export const MONTH_NAMES = [
  "",
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/**
 * The next visit that is not yet booked. Looks up to 18 months ahead so an annual
 * contract still resolves right after its visit for this year has been booked.
 */
export function nextDueVisit(
  contract: ContractLike,
  bookedCycles: Set<string>,
  now: Date = new Date()
): { date: Date; cycle: string; month: number } | null {
  if (!contract.active) return null;
  const months = visitMonthsOf(contract);
  if (!months.length) return null;

  const started = new Date(contract.startedOn);

  for (let offset = 0; offset <= 18; offset++) {
    const probe = new Date(now.getFullYear(), now.getMonth() + offset, 1);
    const year = probe.getFullYear();
    const month = probe.getMonth() + 1;
    if (!months.includes(month)) continue;

    // A visit on the 1st of the month is the booking target; the shop moves it.
    const date = new Date(year, month - 1, 1);
    if (date < new Date(started.getFullYear(), started.getMonth(), 1)) continue;

    const cycle = cycleKey(year, month);
    if (bookedCycles.has(cycle)) continue;
    return { date, cycle, month };
  }
  return null;
}

/** Days until the next visit — negative when the shop is already late on it. */
export function daysUntil(date: Date, now: Date = new Date()) {
  const a = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const b = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((a.getTime() - b.getTime()) / 86_400_000);
}

/** Ready-made plans, so a shop is not asked to think in JSON. */
export const CONTRACT_PLANS = [
  {
    id: "seasonal",
    label: "Spring + fall",
    hint: "Two visits — AC in April, heat in October",
    months: [4, 10],
  },
  { id: "annual", label: "Annual", hint: "One visit each September", months: [9] },
  {
    id: "quarterly",
    label: "Quarterly",
    hint: "Four visits — commercial rooftop units",
    months: [1, 4, 7, 10],
  },
  {
    id: "monthly-summer",
    label: "Summer monthly",
    hint: "Jun–Aug, heavy cooling load",
    months: [6, 7, 8],
  },
];
