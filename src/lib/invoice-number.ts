import { prisma } from "@/lib/prisma";

/**
 * Where an invoice number comes from — the one place, for every door that mints one.
 *
 * Two existed. The invoice route derived the next number from the highest already
 * issued and retried on the unique-constraint race; the contract booker counted the
 * rows instead and formatted the number by hand. Counting is the wrong question: void
 * an invoice, or remove one, and the count drops, so the very next auto-billed
 * maintenance visit reuses a number that a client already has on paper — and if the
 * original is still in the book, the insert dies on `@@unique([tenantId, number])`
 * with a 500 and the visit is booked without its invoice.
 */

async function nextNumber(tenantId: string) {
  const year = new Date().getFullYear();
  const prefix = `INV-${year}-`;

  /**
   * Compared as numbers, not as text. The padding is four wide, so the ten-thousandth
   * invoice of a year sorts BELOW the nine-thousandth as a string ("INV-2026-10000" <
   * "INV-2026-9999") and its tail reads "0000" — the sequence restarted at one and
   * every retry then hit the unique constraint, answering 500 for the rest of the year.
   */
  const issued = await prisma.invoice.findMany({
    where: { tenantId, number: { startsWith: prefix } },
    select: { number: true },
  });

  const seq = issued.reduce((top, i) => Math.max(top, Number(i.number.slice(prefix.length)) || 0), 0);
  return `${prefix}${String(seq + 1).padStart(4, "0")}`;
}

/** Prisma's unique-constraint violation. */
const isDuplicateNumber = (e: unknown) =>
  typeof e === "object" && e !== null && (e as { code?: string }).code === "P2002";

/**
 * Two invoices created in the same instant compute the same number and the second
 * insert violates `@@unique([tenantId, number])`. Rather than 500, take the next
 * number and try again.
 */
export async function createInvoice(
  tenantId: string,
  data: Omit<Parameters<typeof prisma.invoice.create>[0]["data"], "number" | "tenantId">
) {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      return await prisma.invoice.create({
        data: { ...data, tenantId, number: await nextNumber(tenantId) } as never,
      });
    } catch (e) {
      if (!isDuplicateNumber(e) || attempt === 4) throw e;
    }
  }
  throw new Error("Could not allocate an invoice number");
}
