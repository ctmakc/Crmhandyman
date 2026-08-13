/**
 * The Float era, frozen.
 *
 * Copied VERBATIM out of commit 57beaca — the last commit before money moved to whole
 * cents — with its own names kept (`round2`, `subtotal`, `total`). Nothing here is used
 * by the application; it exists so the new code can be asked the same question the old
 * code was asked and be held to the same answer.
 *
 * Read out of git at test time it would tie the suite to the history of the repository;
 * carried here it keeps working, and any later edit to it is a visible change to what
 * "the old behaviour" means.
 *
 * Two callers: `tests/cents-equivalence.test.ts` differentially over generated inputs,
 * and `tests/e2e/verification.e2e.test.ts` against the numbers the live server stores.
 */

/** src/lib/money.ts — the amount as it was printed and paid. */
export const round2 = (n: number) => Math.round(n * 100) / 100;

/** src/lib/money.ts — whole cents, the only safe way to compare two Float amounts. */
export const oldCents = (n: number) => Math.round(n * 100);

export interface OldLine {
  description: string;
  qty: number;
  unit: string;
  unitPrice: number;
}

/** api/projects/[id]/estimate POST and api/invoices POST — the identical block in both. */
export function oldQuote(lines: OldLine[], taxRate: number) {
  const subtotal = round2(lines.reduce((sum, i) => sum + i.qty * i.unitPrice, 0));
  const tax = round2(subtotal * taxRate);
  const total = round2(subtotal + tax);
  return { subtotal, tax, total };
}

/** api/invoices POST, the deposit branch. */
export function oldSplit(lines: OldLine[], taxRate: number, depositRate: number) {
  const { subtotal, tax } = oldQuote(lines, taxRate);
  const depositSubtotal = round2(subtotal * depositRate);
  const depositTax = round2(depositSubtotal * taxRate);
  const balanceSubtotal = round2(subtotal - depositSubtotal);
  const balanceTax = round2(tax - depositTax);
  return {
    deposit: {
      subtotal: depositSubtotal,
      tax: depositTax,
      total: round2(depositSubtotal + depositTax),
    },
    balance: {
      subtotal: balanceSubtotal,
      tax: balanceTax,
      total: round2(balanceSubtotal + balanceTax),
    },
  };
}

/** api/invoices/[id] PUT, action "pay". */
export function oldPay(total: number, alreadyPaid: number[], amountIn: number) {
  const amount = round2(Number(amountIn));
  const paid = round2(alreadyPaid.reduce((s, a) => s + a, 0) + amount);
  const settled = oldCents(paid) >= oldCents(total);
  return { amount, paid, settled, owing: round2(total - paid) };
}

/** src/lib/margin.ts. */
export function oldJobMoney(job: {
  estimates?: Array<{ total: number; status: string }>;
  invoices?: Array<{ total: number; status: string }>;
  payments?: Array<{ amount: number }>;
  expenses?: Array<{ amount: number }>;
}) {
  const estimates = job.estimates ?? [];
  const quoted = (estimates.find((e) => e.status === "ACCEPTED") ?? estimates[0])?.total ?? 0;
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

/** src/lib/utils.ts — what every screen and every printed page used to call. */
export const oldFormatCurrency = (amount: number) =>
  new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" }).format(amount);

/** src/lib/invoice-state.ts — the old half-cent tolerance on "is anything still owed". */
export const oldOwing = (total: number, amountPaid: number) => total - amountPaid;
export const oldStillOwed = (total: number, amountPaid: number) => oldOwing(total, amountPaid) > 0.005;
