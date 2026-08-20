/**
 * Overdue is derived, never stored.
 *
 * A stored OVERDUE flag needs a cron to stay true and silently lies the moment the job
 * misses a run. Deriving it from `dueDate` + what is actually owed means the desk cannot
 * disagree with reality.
 */

export interface InvoiceLike {
  status: string;
  totalCents: number;
  dueDate?: Date | string | null;
  amountPaidCents?: number;
}

export function owingCents(inv: InvoiceLike) {
  return inv.totalCents - (inv.amountPaidCents ?? 0);
}

/**
 * Applying a payment to a bill — the one rule both doors obey.
 *
 * A payment lands on an invoice from two places: the invoice desk (PUT the invoice with
 * `action: "pay"`) and the field, where the crew collects at the door (POST a finance
 * payment against the job). While each door decided for itself what a payment does, they
 * disagreed on the two figures that have to match: the invoice desk refused an overpayment
 * and advanced the status, and the door booked any number and left the invoice reading
 * DRAFT with the money invisible on it. A tech could key $999,999 against a $113 job and
 * the month's revenue carried the invention with no ceiling; the same job then read as
 * still owing on its own paper. This function is the single arithmetic both doors run, so
 * the remainder, the refusal and the resulting status are one answer, computed one way.
 *
 * All cents, all integers: summed floats used to leave $0.001 owing forever, so `settled`
 * is a `>=` on whole cents and can never be tripped by dust. `overpays` is the guard —
 * the caller refuses with a 400 when it is true and writes nothing. The status is never
 * VOID or DRAFT here: a payment moves a bill toward PAID, and PARTIAL is where it rests
 * until the last cent lands. Stamping `paidAt` stays with the caller, which owns the clock.
 */
export interface InvoicePaymentPlan {
  /** Cents still owed on the bill before this payment — the ceiling for the payment. */
  remainingCents: number;
  /** True when the payment is larger than the remainder; the caller must refuse it. */
  overpays: boolean;
  /** Cents paid across the whole invoice once this payment lands (prior payments plus it). */
  paidCents: number;
  /** Whether this payment settles the bill in full, to the cent. */
  settled: boolean;
  /** Where the invoice rests after this payment: PAID when settled, else PARTIAL. */
  status: "PARTIAL" | "PAID";
}

export function planInvoicePayment(
  totalCents: number,
  alreadyPaidCents: number,
  amountCents: number,
): InvoicePaymentPlan {
  const remainingCents = totalCents - alreadyPaidCents;
  const paidCents = alreadyPaidCents + amountCents;
  const settled = paidCents >= totalCents;
  return {
    remainingCents,
    overpays: amountCents > remainingCents,
    paidCents,
    settled,
    status: settled ? "PAID" : "PARTIAL",
  };
}

/**
 * Late by the same calendar the shop uses.
 *
 * Comparing instants made an invoice due «today» overdue at 00:01 of that very day:
 * the desk printed OVERDUE · 0D LATE, the chase lane opened at level 1 and the reminder
 * email told the client the bill «was due today». Both readings now count whole days.
 */
export function isOverdue(inv: InvoiceLike, now: Date = new Date()) {
  if (inv.status !== "SENT" && inv.status !== "PARTIAL") return false;
  if (!inv.dueDate) return false;
  // A whole cent, compared as an integer. Summed floats used to leave $0.001 owing
  // forever, and the shop chased a client for a tenth of a cent.
  return daysOverdue(inv, now) > 0 && owingCents(inv) > 0;
}

/**
 * Whole days past the due date. Negative before it, 0 on the day.
 *
 * Compared as calendar days, not raw milliseconds: a DST change inside the window
 * shifts a millisecond difference by an hour and can report 6 days where the shop
 * counts 7 — and the chase escalation is keyed off this number.
 */
export function daysOverdue(inv: InvoiceLike, now: Date = new Date()) {
  if (!inv.dueDate) return 0;
  const d = new Date(inv.dueDate);
  const due = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((today.getTime() - due.getTime()) / 86_400_000);
}

/**
 * HOW LATE IS SAID — one phrasing for the whole product.
 *
 * The same invoice read `23 DAYS LATE` on the dispatch desk, `23D LATE` in the book,
 * `8 DAYS PAST DUE` on its own record and `OVERDUE · 23D` in the client's file, while
 * the contract board gave a fifth and sixth form. Six spellings of one fact makes the
 * desk read as six products. The full form is the default; `short` exists only for a
 * fixed-width column in the ledger, and is the same everywhere a column is narrow.
 */
export function lateWord(days: number, short = false) {
  const n = Math.abs(Math.round(days));
  return short ? `${n}D LATE` : `${n} ${lateTail(n)}`;
}

/** The words after the numeral, for the places that set the numeral in mono itself. */
export function lateTail(days: number) {
  return `${Math.abs(Math.round(days)) === 1 ? "DAY" : "DAYS"} LATE`;
}

/** The other half of the same sentence: how long until it comes due. */
export function dueWord(days: number, short = false) {
  const n = Math.abs(Math.round(days));
  if (n === 0) return "DUE TODAY";
  return short ? `IN ${n}D` : `IN ${n} ${dueTail(n)}`;
}

/** As `lateTail`, for the countdown side. */
export function dueTail(days: number) {
  return Math.abs(Math.round(days)) === 1 ? "DAY" : "DAYS";
}

/** Two dates on the same page of the calendar the shop hangs on the wall. */
export function sameCalendarDay(a: Date | string | null | undefined, b: Date) {
  if (!a) return false;
  const d = new Date(a);
  return (
    d.getFullYear() === b.getFullYear() && d.getMonth() === b.getMonth() && d.getDate() === b.getDate()
  );
}

/** What the desk should display — the derived state, not the stored one. */
export function displayStatus(inv: InvoiceLike, now: Date = new Date()) {
  return isOverdue(inv, now) ? "OVERDUE" : inv.status;
}

/**
 * The chase ladder, in whole days overdue. ROADMAP 4.3.
 *
 * The first week carries no pressure. A bill one day past its date is a cheque in the
 * post, an invoice still sitting in an unopened inbox, or an accounts department that
 * pays on Fridays — and a shop that writes "you are overdue" on day one reads as a shop
 * that expects to be cheated. The lane still carries the invoice from day one, in
 * neutral ink, because the owner wants to SEE the money; the escalation starts on the
 * seventh day, exactly as the plan promised.
 */
export const CHASE_DAYS = { watch: 1, nudge: 7, call: 14, final: 30 } as const;

/**
 * One ladder for the lane, the letter and the tests of both. While the boundaries lived
 * in two files, the lane could say "Call" above a letter that opened with a polite nudge.
 */
export const CHASE_LADDER = [
  {
    from: CHASE_DAYS.final,
    level: 3,
    stage: "final",
    label: "Escalate",
    hint: "A month overdue — final notice, work stops",
  },
  {
    from: CHASE_DAYS.call,
    level: 2,
    stage: "call",
    label: "Call",
    hint: "Two weeks — ask when payment is coming",
  },
  {
    from: CHASE_DAYS.nudge,
    level: 1,
    stage: "nudge",
    label: "Remind",
    hint: "A week past due — send the soft reminder",
  },
  {
    from: CHASE_DAYS.watch,
    level: 0,
    stage: "notice",
    label: "Watch",
    hint: "Just past due — the reminder goes out on day 7",
  },
] as const;

export type ChaseStage = (typeof CHASE_LADDER)[number];

/** The rung for a given lateness. Anything before the due date is off the ladder. */
export function chaseStageForDays(days: number): ChaseStage | null {
  return CHASE_LADDER.find((rung) => days >= rung.from) ?? null;
}

/**
 * How hard to chase this invoice. Level 0 means "on the lane, not yet chased" — the
 * money is visible without the desk being pushed to act on it.
 */
export function chaseStage(inv: InvoiceLike, now: Date = new Date()): ChaseStage | null {
  if (!isOverdue(inv, now)) return null;
  return chaseStageForDays(daysOverdue(inv, now));
}
