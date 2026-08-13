/**
 * Job economics.
 *
 * A shop owner does not ask "what was the revenue" — they ask "did this job make
 * money". That needs four numbers side by side, and the gap between quoted and
 * collected is usually where the answer hides:
 *
 *   quoted    — what the accepted estimate promised
 *   invoiced  — what was actually billed (deposits + balance)
 *   collected — what landed in the bank
 *   costs     — materials, labour, vehicle, tools booked against the job
 *
 * Margin is measured against COLLECTED, not invoiced. Money still on the street is
 * not profit, and calling it profit is how contractors talk themselves into a loss.
 *
 * Every amount here is whole cents (src/lib/money.ts), so a job card built out of
 * hundreds of rows adds up to the same number twice.
 */

export interface JobMoneyInput {
  estimates?: Array<{ totalCents: number; status: string }>;
  invoices?: Array<{ totalCents: number; status: string }>;
  payments?: Array<{ amountCents: number }>;
  expenses?: Array<{ amountCents: number }>;
}

export interface JobMoney {
  quotedCents: number;
  invoicedCents: number;
  collectedCents: number;
  costsCents: number;
  /** Collected minus costs. The only number that is really yours. */
  marginCents: number;
  /** Margin as a share of collected. Null when nothing has been collected yet. */
  marginPct: number | null;
  /** Billed but not yet in the bank. */
  outstandingCents: number;
  /** Quoted but never billed — the classic silent leak on a finished job. */
  unbilledCents: number;
}

export function jobMoney(job: JobMoneyInput): JobMoney {
  /**
   * ONE accepted estimate is the price of the job. Summing them all doubled the quote
   * the moment a revised estimate was accepted without rejecting the old one — and the
   * whole job then showed up as a phantom "quoted but never invoiced" leak. Callers
   * hand the estimates newest first, so the head of the list is the live price; the
   * same rule covers the fallback when nothing was formally accepted.
   */
  const estimates = job.estimates ?? [];
  const quotedCents =
    (estimates.find((e) => e.status === "ACCEPTED") ?? estimates[0])?.totalCents ?? 0;

  // A DRAFT is paper nobody has seen. Counting it as billed hid the «quoted but never
  // invoiced» signal and inflated what the desk reports as money on the street.
  const invoicedCents = (job.invoices ?? [])
    .filter((i) => i.status !== "VOID" && i.status !== "DRAFT")
    .reduce((s, i) => s + i.totalCents, 0);

  const collectedCents = (job.payments ?? []).reduce((s, p) => s + p.amountCents, 0);
  const costsCents = (job.expenses ?? []).reduce((s, e) => s + e.amountCents, 0);

  const marginCents = collectedCents - costsCents;

  return {
    quotedCents,
    invoicedCents,
    collectedCents,
    costsCents,
    marginCents,
    marginPct: collectedCents > 0 ? (marginCents / collectedCents) * 100 : null,
    outstandingCents: Math.max(invoicedCents - collectedCents, 0),
    unbilledCents: Math.max(quotedCents - invoicedCents, 0),
  };
}

/** How the margin should read at a glance. Thresholds are trade rules of thumb. */
export function marginTone(pct: number | null) {
  if (pct === null) return "var(--ink-3)";
  if (pct < 0) return "var(--rose-ink)";
  if (pct < 15) return "var(--amber-ink)";
  return "var(--emerald-ink)";
}

export function marginVerdict(m: JobMoney) {
  if (m.collectedCents === 0 && m.costsCents === 0) return "Nothing booked against this job yet";
  if (m.collectedCents === 0) return "Costs booked, nothing collected — this job is underwater";
  if (m.marginCents < 0) return "Costs exceed what was collected";
  if (m.marginPct !== null && m.marginPct < 15) return "Thin margin for this trade";
  return "Healthy";
}

/** Deposit splits a shop actually uses on installs. */
export const SPLIT_PLANS = [
  { id: "full", label: "One invoice", deposit: 0, hint: "Bill the whole job at once" },
  { id: "50-50", label: "50 / 50", deposit: 0.5, hint: "Half on booking, half on completion" },
  { id: "30-70", label: "30 / 70", deposit: 0.3, hint: "Deposit covers the equipment order" },
  { id: "25-75", label: "25 / 75", deposit: 0.25, hint: "Light deposit, service work" },
];
