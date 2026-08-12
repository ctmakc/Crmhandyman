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
 */

export interface JobMoneyInput {
  estimates?: Array<{ total: number; status: string }>;
  invoices?: Array<{ total: number; status: string }>;
  payments?: Array<{ amount: number }>;
  expenses?: Array<{ amount: number }>;
}

export interface JobMoney {
  quoted: number;
  invoiced: number;
  collected: number;
  costs: number;
  /** Collected minus costs. The only number that is really yours. */
  margin: number;
  /** Margin as a share of collected. Null when nothing has been collected yet. */
  marginPct: number | null;
  /** Billed but not yet in the bank. */
  outstanding: number;
  /** Quoted but never billed — the classic silent leak on a finished job. */
  unbilled: number;
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
  const quoted = (estimates.find((e) => e.status === "ACCEPTED") ?? estimates[0])?.total ?? 0;

  // A DRAFT is paper nobody has seen. Counting it as billed hid the «quoted but never
  // invoiced» signal and inflated what the desk reports as money on the street.
  const invoiced = (job.invoices ?? [])
    .filter((i) => i.status !== "VOID" && i.status !== "DRAFT")
    .reduce((s, i) => s + i.total, 0);

  const collected = (job.payments ?? []).reduce((s, p) => s + p.amount, 0);
  const costs = (job.expenses ?? []).reduce((s, e) => s + e.amount, 0);

  const margin = collected - costs;

  return {
    quoted,
    invoiced,
    collected,
    costs,
    margin,
    marginPct: collected > 0 ? (margin / collected) * 100 : null,
    outstanding: Math.max(invoiced - collected, 0),
    unbilled: Math.max(quoted - invoiced, 0),
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
  if (m.collected === 0 && m.costs === 0) return "Nothing booked against this job yet";
  if (m.collected === 0) return "Costs booked, nothing collected — this job is underwater";
  if (m.margin < 0) return "Costs exceed what was collected";
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
