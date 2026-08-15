import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { writeAuditEvent } from "@/lib/audit";

async function tenantOf(session: unknown) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (session as any)?.user?.tenantId as string;
}

const PAYMENT_METHODS = new Set(["CASH", "E_TRANSFER", "CHEQUE", "CARD"]);

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const invoice = await prisma.invoice.findFirst({
    where: { id: params.id, tenantId: await tenantOf(session) },
    include: {
      payments: { orderBy: { date: "desc" } },
      project: { select: { id: true, title: true, jobType: true } },
    },
  });
  if (!invoice) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({
    ...invoice,
    amountPaid: invoice.payments.reduce((sum, payment) => sum + payment.amount, 0),
  });
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const tenantId = await tenantOf(session);

  const invoice = await prisma.invoice.findFirst({
    where: { id: params.id, tenantId },
    include: { payments: { select: { amount: true } } },
  });
  if (!invoice) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json();
  if (body.action === "pay") {
    if (invoice.status === "VOID") return NextResponse.json({ error: "Voided invoices cannot receive payments" }, { status: 409 });

    const amount = Number(body.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ error: "Amount must be positive" }, { status: 400 });
    }
    const method = String(body.method || "E_TRANSFER").toUpperCase();
    if (!PAYMENT_METHODS.has(method)) return NextResponse.json({ error: "Invalid payment method" }, { status: 400 });

    const alreadyPaid = invoice.payments.reduce((sum, payment) => sum + payment.amount, 0);
    const owing = Math.max(0, Math.round((invoice.total - alreadyPaid) * 100) / 100);
    if (owing <= 0) return NextResponse.json({ error: "Invoice is already settled" }, { status: 409 });
    if (Math.round(amount * 100) > Math.round(owing * 100)) {
      return NextResponse.json({ error: `Payment exceeds amount owing (${owing.toFixed(2)})` }, { status: 400 });
    }

    const { payment, updated } = await prisma.$transaction(async (tx) => {
      const createdPayment = await tx.payment.create({
        data: {
          tenantId,
          projectId: invoice.projectId,
          invoiceId: invoice.id,
          amount,
          method: method as "CASH" | "E_TRANSFER" | "CHEQUE" | "CARD",
          notes: body.notes ? String(body.notes).slice(0, 2000) : undefined,
        },
      });
      const paid = alreadyPaid + amount;
      const settled = Math.round(paid * 100) >= Math.round(invoice.total * 100);
      const updatedInvoice = await tx.invoice.update({
        where: { id: invoice.id },
        data: { status: settled ? "PAID" : "PARTIAL", paidAt: settled ? new Date() : null },
      });
      return { payment: createdPayment, updated: updatedInvoice };
    });

    await writeAuditEvent({
      tenantId,
      actorEmail: session.user?.email,
      action: "invoice.payment_recorded",
      entityType: "invoice",
      entityId: invoice.id,
      summary: `Payment recorded on ${invoice.number}`,
      metadata: { paymentId: payment.id, amount, method, fromStatus: invoice.status, toStatus: updated.status },
    });
    return NextResponse.json(updated);
  }

  const data: { status?: "SENT"; sentAt?: Date; notes?: string | null; dueDate?: Date } = {};
  if (body.status !== undefined) {
    const requested = String(body.status).toUpperCase();
    if (requested !== "SENT" || invoice.status !== "DRAFT") {
      return NextResponse.json({ error: "Only DRAFT → SENT is a manual status transition" }, { status: 409 });
    }
    data.status = "SENT";
    if (!invoice.sentAt) data.sentAt = new Date();
  }
  if (body.notes !== undefined) data.notes = body.notes === null ? null : String(body.notes).slice(0, 4000);
  if (body.dueDate) {
    const dueDate = new Date(body.dueDate);
    if (Number.isNaN(dueDate.getTime())) return NextResponse.json({ error: "Invalid dueDate" }, { status: 400 });
    data.dueDate = dueDate;
  }

  const updated = await prisma.invoice.update({ where: { id: invoice.id }, data });
  await writeAuditEvent({
    tenantId,
    actorEmail: session.user?.email,
    action: invoice.status !== updated.status ? "invoice.status_changed" : "invoice.updated",
    entityType: "invoice",
    entityId: invoice.id,
    summary: invoice.status !== updated.status ? `Invoice ${invoice.number}: ${invoice.status} → ${updated.status}` : `Invoice ${invoice.number} updated`,
    metadata: { fromStatus: invoice.status, toStatus: updated.status },
  });
  return NextResponse.json(updated);
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const tenantId = await tenantOf(session);

  const invoice = await prisma.invoice.findFirst({ where: { id: params.id, tenantId } });
  if (!invoice) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (invoice.status === "PAID") return NextResponse.json({ error: "Paid invoices cannot be voided" }, { status: 409 });
  if (invoice.status === "VOID") return NextResponse.json(invoice);

  const updated = await prisma.invoice.update({ where: { id: invoice.id }, data: { status: "VOID" } });
  await writeAuditEvent({
    tenantId,
    actorEmail: session.user?.email,
    action: "invoice.voided",
    entityType: "invoice",
    entityId: invoice.id,
    summary: `Invoice ${invoice.number} voided`,
    metadata: { fromStatus: invoice.status },
  });
  return NextResponse.json(updated);
}
