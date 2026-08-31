import { parseCents, toDollars } from "@/lib/money";

/**
 * A fee paid for one specific marketplace lead is a real expense, not a property of the
 * customer's contact record. Store it in Expense with a deterministic id: this keeps it
 * owner-only with the rest of the books, makes retries an upsert instead of duplicates,
 * and lets the existing source-to-cash report count it as acquisition spend.
 */
const PREFIX = "leadfee_";

export function leadFeeExpenseId(leadId: string): string {
  return `${PREFIX}${leadId}`;
}

export function leadIdFromFeeExpenseId(expenseId: string): string | null {
  if (!expenseId.startsWith(PREFIX)) return null;
  const id = expenseId.slice(PREFIX.length).trim();
  return id || null;
}

/**
 * Deliberately starts with `Ad spend:` so the existing report includes the direct fee in
 * CPL / cost per job / return without a second accounting pipeline. The lead marker makes
 * the provenance explicit and the deterministic Expense id prevents duplicate booking.
 */
export function leadFeeDescription(source: string, leadId: string): string {
  return `Ad spend: ${source} — direct lead fee [lead:${leadId}]`;
}

export type ParsedLeadFee =
  | { ok: true; cents: number | null }
  | { ok: false; error: string };

/** Blank/null clears the fee. Zero is a known free lead, not “unknown”. */
export function parseLeadFee(raw: unknown): ParsedLeadFee {
  if (raw === null || raw === undefined || (typeof raw === "string" && !raw.trim())) {
    return { ok: true, cents: null };
  }
  const cents = parseCents(raw);
  if (cents === null || cents < 0) return { ok: false, error: "Lead cost must be zero or more" };
  // A six-figure single lead is almost certainly cents/dollars confusion or a typo.
  if (cents > 10_000_000) return { ok: false, error: "Lead cost is too large" };
  return { ok: true, cents };
}

export function leadFeeApiValue(cents: number | null | undefined): number | null {
  return cents === null || cents === undefined ? null : toDollars(cents);
}
