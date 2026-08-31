/**
 * Values a column is allowed to hold, checked before Prisma sees them.
 *
 * An enum column rejects an unknown value at the driver, which surfaces as a 500 with a
 * stack trace in the log and, on the screen, as a button that does nothing. The desk
 * cannot tell that apart from a dead network. Four doors answered 500 this way — an
 * expense category, a payment method, a lead source and a job status — so the lists live
 * here once and every door that accepts one of them answers 400 naming the field.
 *
 * These mirror `prisma/schema.prisma`. A value added there without being added here is
 * simply refused, which is the safe direction to fail.
 */

export const EXPENSE_CATEGORIES = ["MATERIALS", "LABOR", "TOOLS", "VEHICLE", "OTHER"] as const;
export const PAYMENT_METHODS = ["CASH", "E_TRANSFER", "CHEQUE", "CARD"] as const;
export const LEAD_SOURCES = [
  "FACEBOOK",
  "INSTAGRAM",
  "GOOGLE",
  "GOOGLE_LSA",
  "HOMESTARS",
  "BARK",
  "URBANTASKER",
  "MOVINGWALDO",
  "KIJIJI",
  "WEBSITE",
  "EMAIL",
  "MANUAL",
  "OTHER",
] as const;
export const LEAD_STATUSES = ["NEW", "CONTACTED", "VERIFIED", "REJECTED", "CONVERTED"] as const;
export const PROJECT_STATUSES = ["SCHEDULED", "IN_PROGRESS", "COMPLETED", "CANCELLED"] as const;
export const TASK_STATUSES = ["TODO", "IN_PROGRESS", "DONE"] as const;
export const ESTIMATE_STATUSES = ["DRAFT", "SENT", "ACCEPTED", "REJECTED"] as const;
export const INVOICE_STATUSES = ["DRAFT", "SENT", "PARTIAL", "PAID", "VOID"] as const;
export const EQUIPMENT_KINDS = [
  "FURNACE",
  "AC",
  "HEAT_PUMP",
  "WATER_HEATER",
  "BOILER",
  "THERMOSTAT",
  "DUCTWORK",
  "OTHER",
] as const;
export const PHOTO_KINDS = ["BEFORE", "AFTER", "DAMAGE", "RECEIPT"] as const;

export type Choice<T extends readonly string[]> = T[number];

/**
 * A value the caller supplied for an enum column.
 *
 * `undefined` means the field was absent and the column keeps its default or its current
 * value; `null` means the value was given and is not one this shop has. A route reads the
 * two apart, because "not sent" and "sent wrong" are a different answer.
 */
export function choice<T extends readonly string[]>(
  allowed: T,
  raw: unknown
): Choice<T> | null | undefined {
  if (raw === undefined || raw === null || raw === "") return undefined;
  if (typeof raw !== "string") return null;
  return (allowed as readonly string[]).includes(raw) ? (raw as Choice<T>) : null;
}

/** The 400 body — it names the field and lists what is on offer. */
export function badChoice(field: string, allowed: readonly string[]) {
  return { error: `That ${field} is not one this desk offers`, field, allowed: [...allowed] };
}
