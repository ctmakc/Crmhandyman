import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { writeAuditEvent } from "@/lib/audit";
import { InvoicePaymentError, recordInvoicePayment } from "@/lib/invoice-payment";

async function tenantOf(session: unknown) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (session as any)?.user?.tenantId as string;
}

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
  const body = await req.json();

  if (body.action === "pay") {
    try {
      const result = await recordInvoicePayment({
        tenantId,
        invoiceId: params.id,
        amount: Number(body.amount),
        method: body.method,
        notes: body.notes,
      });
      await writeAuditEvent({
        tenantId,
        actorEmail: session.user?.email,
        action: "invoice.payment_recorded",
        entityType: "invoice",
        entityId: params.id,
        summary: `Payment recorded on ${result.invoiceNumber}`,
        metadata: {
          paymentId: result.payment.id,
          amount: result.amount,
          method: result.method,
          fromStatus: result.fromStatus,
          toStatus: result.updated.status,
        },
      });
      return NextResponse.json(result.updated);
    } catch (error) {
      if (error instanceof InvoicePaymentError) {
        return NextResponse.json({ error: error.message }, { status: error.status });
      }
      throw error;
    }
  }

  const invoice = await prisma.invoice.findFirst({ where: { id: params.id, tenantId } });
  if (!invoice) return NextResponse.json({ error: "Not found" }, { status: 404 });

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
