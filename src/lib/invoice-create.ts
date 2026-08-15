import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type NumberedInvoiceData = Omit<
  Prisma.InvoiceUncheckedCreateInput,
  "id" | "tenantId" | "number" | "createdAt" | "updatedAt"
>;

async function nextInvoiceNumber(tenantId: string) {
  const year = new Date().getFullYear();
  const last = await prisma.invoice.findFirst({
    where: { tenantId, number: { startsWith: `INV-${year}-` } },
    orderBy: { number: "desc" },
    select: { number: true },
  });
  const seq = last ? Number(last.number.slice(-4)) || 0 : 0;
  return `INV-${year}-${String(seq + 1).padStart(4, "0")}`;
}

function isDuplicateNumber(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

/** Allocate a tenant/year invoice number and retry a concurrent unique-key race. */
export async function createNumberedInvoice(tenantId: string, data: NumberedInvoiceData) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      return await prisma.invoice.create({
        data: { ...data, tenantId, number: await nextInvoiceNumber(tenantId) },
      });
    } catch (error) {
      if (!isDuplicateNumber(error) || attempt === 7) throw error;
    }
  }
  throw new Error("Could not allocate an invoice number");
}
