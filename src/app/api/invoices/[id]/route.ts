import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

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
    amountPaid: invoice.payments.reduce((s, p) => s + p.amount, 0),
  });
}

/**
 * Status transitions and payment recording.
 * `action: "pay"` writes a real Payment row so Finance and the invoice agree —
 * there is no separate "amount paid" field to drift out of sync.
 */
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
    const amount = Number(body.amount);
    if (!amount || amount <= 0)
      return NextResponse.json({ error: "Amount must be positive" }, { status: 400 });

    await prisma.payment.create({
      data: {
        tenantId,
        projectId: invoice.projectId,
        invoiceId: invoice.id,
        amount,
        method: body.method || "E_TRANSFER",
        notes: body.notes,
      },
    });

    const paid = invoice.payments.reduce((s, p) => s + p.amount, 0) + amount;
    // Round to the cent before comparing — float sums otherwise leave $0.001 owing.
    const settled = Math.round(paid * 100) >= Math.round(invoice.total * 100);

    const updated = await prisma.invoice.update({
      where: { id: invoice.id },
      data: {
        status: settled ? "PAID" : "PARTIAL",
        paidAt: settled ? new Date() : null,
      },
    });
    return NextResponse.json(updated);
  }

  const data: Record<string, unknown> = {};
  if (body.status) {
    data.status = body.status;
    if (body.status === "SENT" && !invoice.sentAt) data.sentAt = new Date();
  }
  if (body.notes !== undefined) data.notes = body.notes;
  if (body.dueDate) data.dueDate = new Date(body.dueDate);

  const updated = await prisma.invoice.update({ where: { id: invoice.id }, data });
  return NextResponse.json(updated);
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const tenantId = await tenantOf(session);

  const invoice = await prisma.invoice.findFirst({ where: { id: params.id, tenantId } });
  if (!invoice) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Issued paper is never deleted — it is voided, so the numbering stays honest.
  const updated = await prisma.invoice.update({
    where: { id: invoice.id },
    data: { status: "VOID" },
  });
  return NextResponse.json(updated);
}
