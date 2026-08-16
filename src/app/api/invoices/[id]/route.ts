import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/guard";
import { record, money } from "@/lib/audit";
import { inDollars, lineItemsJsonInDollars, parseCents } from "@/lib/money";
import { parseDayInput } from "@/lib/dates";

/** One door out: amounts in dollars, lines in dollars. */
/** Enum values are for the column; the log line is a sentence somebody reads. */
const STATUS_WORD: Record<string, string> = {
  DRAFT: "draft",
  SENT: "sent",
  PARTIAL: "part paid",
  PAID: "paid",
  VOID: "cancelled",
};

const invoiceOut = <T extends { lineItems: string }>(invoice: T) => ({
  ...inDollars(invoice),
  lineItems: lineItemsJsonInDollars(invoice.lineItems),
});

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
  if (!invoice) return NextResponse.json({ error: "That record is gone — it was deleted, or the link points at another workspace" }, { status: 404 });

  return NextResponse.json(
    invoiceOut({
      ...invoice,
      amountPaidCents: invoice.payments.reduce((s, p) => s + p.amountCents, 0),
    })
  );
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
    include: { payments: { select: { amountCents: true } } },
  });
  if (!invoice) return NextResponse.json({ error: "That record is gone — it was deleted, or the link points at another workspace" }, { status: 404 });

  const body = await req.json();

  if (body.action === "pay") {
    // Dollars arrive from the desk and become cents here, once.
    const amountCents = parseCents(body.amount);
    if (!amountCents || amountCents <= 0)
      return NextResponse.json({ error: "Amount must be positive" }, { status: 400 });

    // A bill is only as open as what it still owes. A payment past that remainder used
    // to book straight in — owing went negative, the month's revenue inflated by the
    // overage, and the paper the client holds clamped OWING back to $0.00, so the books
    // and the printed invoice disagreed on the one figure both have to speak. The desk
    // records what settles the bill and puts any surplus on its own invoice; a customer
    // credit balance is a separate ledger this product does not carry yet.
    const alreadyPaidCents = invoice.payments.reduce((s, p) => s + p.amountCents, 0);
    const remainingCents = invoice.totalCents - alreadyPaidCents;
    if (amountCents > remainingCents)
      return NextResponse.json(
        {
          error:
            `That is more than the ${money(Math.max(remainingCents, 0))} still owing on ${invoice.number}. ` +
            `Record what settles the bill, and put any surplus on its own invoice.`,
        },
        { status: 400 }
      );

    await prisma.payment.create({
      data: {
        tenantId,
        projectId: invoice.projectId,
        invoiceId: invoice.id,
        amountCents,
        method: body.method || "E_TRANSFER",
        notes: body.notes,
      },
    });

    const paidCents = alreadyPaidCents + amountCents;
    // Whole cents on both sides: float sums used to leave $0.001 owing forever. The
    // overpayment guard above holds this at totalCents exactly, never past it.
    const settled = paidCents >= invoice.totalCents;

    const updated = await prisma.invoice.update({
      where: { id: invoice.id },
      data: {
        status: settled ? "PAID" : "PARTIAL",
        paidAt: settled ? new Date() : null,
      },
    });

    const owingCents = invoice.totalCents - paidCents;
    await record({
      tenantId,
      actor: guard.identity,
      action: "invoice.pay",
      entity: "Invoice",
      entityId: invoice.id,
      summary:
        `Took ${money(amountCents)} by ${String(body.method || "E_TRANSFER").replace(/_/g, " ")} ` +
        `on ${invoice.number} from ${invoice.clientName} — ` +
        (settled ? "settled in full" : `${money(owingCents)} still owing`),
      meta: {
        amountCents,
        method: body.method || "E_TRANSFER",
        paidCents,
        totalCents: invoice.totalCents,
        settled,
      },
    });

    return NextResponse.json(invoiceOut(updated));
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
        `Moved ${invoice.number} (${money(invoice.totalCents)}) for ${invoice.clientName} ` +
        `from ${STATUS_WORD[invoice.status] ?? invoice.status} to ${STATUS_WORD[body.status] ?? body.status}`,
      meta: { from: invoice.status, to: body.status },
    });
  }

  return NextResponse.json(invoiceOut(updated));
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  const { tenantId } = guard.identity;
  
  const invoice = await prisma.invoice.findFirst({ where: { id: params.id, tenantId } });
  if (!invoice) return NextResponse.json({ error: "That record is gone — it was deleted, or the link points at another workspace" }, { status: 404 });

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
    summary: `Voided ${invoice.number} (${money(invoice.totalCents)}) for ${invoice.clientName}`,
    meta: { from: invoice.status, totalCents: invoice.totalCents },
  });

  return NextResponse.json(invoiceOut(updated));
}
