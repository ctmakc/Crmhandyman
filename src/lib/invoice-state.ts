/**
 * Overdue is derived, never stored.
 *
 * A stored OVERDUE flag needs a cron to stay true and silently lies the moment the job
 * misses a run. Deriving it from `dueDate` + what is actually owed means the desk cannot
 * disagree with reality.
 */

export interface InvoiceLike {
  status: string;
  total: number;
  dueDate?: Date | string | null;
  amountPaid?: number;
}

export function owingOf(inv: InvoiceLike) {
  return inv.total - (inv.amountPaid ?? 0);
}

export function isOverdue(inv: InvoiceLike, now: Date = new Date()) {
  if (inv.status !== "SENT" && inv.status !== "PARTIAL") return false;
  if (!inv.dueDate) return false;
  return new Date(inv.dueDate) < now && owingOf(inv) > 0.005;
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

/** What the desk should display — the derived state, not the stored one. */
export function displayStatus(inv: InvoiceLike, now: Date = new Date()) {
  return isOverdue(inv, now) ? "OVERDUE" : inv.status;
}

/**
 * How hard to chase. Escalates on the same schedule a shop would work the phone.
 */
export function chaseStage(inv: InvoiceLike, now: Date = new Date()) {
  if (!isOverdue(inv, now)) return null;
  const d = daysOverdue(inv, now);
  if (d >= 30) return { level: 3 as const, label: "Escalate", hint: "30+ days — stop work, send final notice" };
  if (d >= 14) return { level: 2 as const, label: "Call", hint: "Two weeks — phone the client" };
  return { level: 1 as const, label: "Remind", hint: "Send a reminder" };
}
