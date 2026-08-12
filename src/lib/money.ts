/**
 * Cent discipline for everything that is written to the database or compared.
 *
 * Amounts are stored as Float, so `subtotal * 0.13` lands at 119.60000000000001 and
 * an invoice goes out for a third of a cent nobody can transfer. The same dust makes
 * the bookkeeper's CSV disagree with itself, because each column is printed with its
 * own `toFixed(2)` while the stored total still carries the tail.
 *
 * Rule for this codebase: round on the way IN, compare in whole cents.
 */

/** The amount as it will be printed and paid. Every write of money goes through this. */
export const round2 = (n: number) => Math.round(n * 100) / 100;

/** Whole cents — the only safe way to ask whether two amounts are the same. */
export const cents = (n: number) => Math.round(n * 100);
