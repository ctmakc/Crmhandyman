import { prisma } from "./prisma";

const PAYMENT_METHODS = new Set(["CASH", "E_TRANSFER", "CHEQUE", "CARD"]);

export class InvoicePaymentError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
    this.name = "InvoicePaymentError";
    Object.setPrototypeOf(this, InvoicePaymentError.prototype);
  }
}

export async function recordInvoicePayment(input: {
  tenantId: string;
  invoiceId: string;
  amount: number;
  method?: string;
  notes?: string | null;
}) {
  const invoice = await prisma.invoice.findFirst({
    where: { id: input.invoiceId, tenantId: input.tenantId },
    include: { payments: { select: { amount: true } } },
  });
  if (!invoice) throw new InvoicePaymentError("Invoice not found", 404);
  if (invoice.status === "VOID") throw new InvoicePaymentError("Voided invoices cannot receive payments", 409);

  const amount = Number(input.amount);
  if (!Number.isFinite(amount) || amount <= 0) throw new InvoicePaymentError("Amount must be positive", 400);

  const method = String(input.method || "E_TRANSFER").toUpperCase();
  if (!PAYMENT_METHODS.has(method)) throw new InvoicePaymentError("Invalid payment method", 400);

  const alreadyPaid = invoice.payments.reduce((sum, payment) => sum + payment.amount, 0);
  const owing = Math.max(0, Math.round((invoice.total - alreadyPaid) * 100) / 100);
  if (owing <= 0) throw new InvoicePaymentError("Invoice is already settled", 409);
  if (Math.round(amount * 100) > Math.round(owing * 100)) {
    throw new InvoicePaymentError(`Payment exceeds amount owing (${owing.toFixed(2)})`, 400);
  }

  const result = await prisma.$transaction(async (tx) => {
    const payment = await tx.payment.create({
      data: {
        tenantId: input.tenantId,
        projectId: invoice.projectId,
        invoiceId: invoice.id,
        amount,
        method: method as "CASH" | "E_TRANSFER" | "CHEQUE" | "CARD",
        notes: input.notes ? String(input.notes).slice(0, 2000) : undefined,
      },
    });
    const paid = alreadyPaid + amount;
    const settled = Math.round(paid * 100) >= Math.round(invoice.total * 100);
    const updated = await tx.invoice.update({
      where: { id: invoice.id },
      data: { status: settled ? "PAID" : "PARTIAL", paidAt: settled ? new Date() : null },
    });
    return { payment, updated };
  });

  return {
    ...result,
    invoiceNumber: invoice.number,
    fromStatus: invoice.status,
    amount,
    method,
  };
}
