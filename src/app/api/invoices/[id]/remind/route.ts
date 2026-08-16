import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sendReminder } from "@/lib/reminders";
import { isOverdue, daysOverdue } from "@/lib/invoice-state";

export async function POST(_: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tenantId = (session.user as any).tenantId as string;

  const invoice = await prisma.invoice.findFirst({
    where: { id: params.id, tenantId },
    include: { payments: { select: { amount: true } }, tenant: { select: { businessName: true } } },
  });
  if (!invoice) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const amountPaid = invoice.payments.reduce((s, p) => s + p.amount, 0);
  const state = { status: invoice.status, total: invoice.total, dueDate: invoice.dueDate, amountPaid };

  if (!isOverdue(state)) {
    return NextResponse.json({ error: "This invoice is not overdue" }, { status: 400 });
  }

  const result = await sendReminder({
    number: invoice.number,
    clientName: invoice.clientName,
    email: invoice.email,
    total: invoice.total,
    amountPaid,
    dueDate: invoice.dueDate,
    daysOverdue: daysOverdue(state),
    businessName: invoice.tenant.businessName,
  });

  // The attempt is recorded either way — a reminder the desk thinks it sent but did
  // not is worse than no reminder at all.
  await prisma.invoice.update({
    where: { id: invoice.id },
    data: { remindedAt: new Date(), reminderCount: { increment: 1 } },
  });

  return NextResponse.json(result);
}
