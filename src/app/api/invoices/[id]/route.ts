import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/guard";
import { record, money } from "@/lib/audit";
import { cents, round2 } from "@/lib/money";
import { parseDayInput } from "@/lib/dates";

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  const { tenantId } = guard.identity;

  const invoice = await prisma.invoice.findFirst({
    where: { id: params.id, tenantId },
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
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  const { tenantId } = guard.identity;
  
  const invoice = await prisma.invoice.findFirst({
    where: { id: params.id, tenantId },
    include: { payments: { select: { amount: true } } },
  });
  if (!invoice) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json();

  if (body.action === "pay") {
    const amount = round2(Number(body.amount));
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

    const paid = round2(invoice.payments.reduce((s, p) => s + p.amount, 0) + amount);
    // Compare in whole cents — float sums otherwise leave $0.001 owing forever.
    const settled = cents(paid) >= cents(invoice.total);

    const updated = await prisma.invoice.update({
      where: { id: invoice.id },
      data: {
        status: settled ? "PAID" : "PARTIAL",
        paidAt: settled ? new Date() : null,
      },
    });

    const owing = round2(invoice.total - paid);
    await record({
      tenantId,
      actor: guard.identity,
      action: "invoice.pay",
      entity: "Invoice",
      entityId: invoice.id,
      summary:
        `Took ${money(amount)} by ${String(body.method || "E_TRANSFER").replace(/_/g, " ")} ` +
        `on ${invoice.number} from ${invoice.clientName} — ` +
        (settled ? "settled in full" : `${money(owing)} still owing`),
      meta: { amount, method: body.method || "E_TRANSFER", paid, total: invoice.total, settled },
    });

    return NextResponse.json(updated);
  }

  const data: Record<string, unknown> = {};
  if (body.status) {
    data.status = body.status;
    if (body.status === "SENT" && !invoice.sentAt) data.sentAt = new Date();
  }
  if (body.notes !== undefined) data.notes = body.notes;
  const dueDate = parseDayInput(body.dueDate);
  if (dueDate) data.dueDate = dueDate;

  const updated = await prisma.invoice.update({ where: { id: invoice.id }, data });

  if (body.status && body.status !== invoice.status) {
    await record({
      tenantId,
      actor: guard.identity,
      action: "invoice.status",
      entity: "Invoice",
      entityId: invoice.id,
      summary:
        `Moved ${invoice.number} (${money(invoice.total)}) for ${invoice.clientName} ` +
        `from ${invoice.status} to ${body.status}`,
      meta: { from: invoice.status, to: body.status },
    });
  }

  return NextResponse.json(updated);
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  const { tenantId } = guard.identity;
  
  const invoice = await prisma.invoice.findFirst({ where: { id: params.id, tenantId } });
  if (!invoice) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Issued paper is never deleted — it is voided, so the numbering stays honest.
  const updated = await prisma.invoice.update({
    where: { id: invoice.id },
    data: { status: "VOID" },
  });

  await record({
    tenantId,
    actor: guard.identity,
    action: "invoice.void",
    entity: "Invoice",
    entityId: invoice.id,
    summary: `Voided ${invoice.number} (${money(invoice.total)}) for ${invoice.clientName}`,
    meta: { from: invoice.status, total: invoice.total },
  });

  return NextResponse.json(updated);
}
