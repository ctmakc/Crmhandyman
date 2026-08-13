import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/guard";
import { sendReminder } from "@/lib/reminders";
import { record, money } from "@/lib/audit";
import { isOverdue, daysOverdue, owingCents, sameCalendarDay } from "@/lib/invoice-state";

/** Seconds left until the shop's own midnight — when the next chase becomes allowed. */
function secondsUntilTomorrow(now: Date) {
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  return Math.max(1, Math.ceil((midnight.getTime() - now.getTime()) / 1000));
}

export async function POST(_: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  const { tenantId } = guard.identity;

  const invoice = await prisma.invoice.findFirst({
    where: { id: params.id, tenantId },
    include: {
      payments: { select: { amountCents: true } },
      tenant: { select: { businessName: true } },
      // The phone belongs to the job, and it is the only way to reach a lead that came
      // off a quiz landing: those forms collect a number and nothing else.
      project: { select: { title: true, phone: true } },
    },
  });
  if (!invoice) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const amountPaidCents = invoice.payments.reduce((s, p) => s + p.amountCents, 0);
  const state = {
    status: invoice.status,
    totalCents: invoice.totalCents,
    dueDate: invoice.dueDate,
    amountPaidCents,
  };

  if (!isOverdue(state)) {
    return NextResponse.json({ error: "This invoice is not overdue" }, { status: 400 });
  }

  /**
   * One chase per invoice per day. Two presses of the button — the second because the
   * first said "not sent" — put the same letter in the client's inbox twice, and a shop
   * that mails you twice about $400 sounds like a collections agency. The count and the
   * date below are the record the desk reads; the guard is the calendar day they carry.
   */
  const now = new Date();
  if (sameCalendarDay(invoice.remindedAt, now)) {
    return NextResponse.json(
      { error: "Already chased today — the next reminder can go out tomorrow" },
      { status: 429, headers: { "Retry-After": String(secondsUntilTomorrow(now)) } }
    );
  }

  const days = daysOverdue(state, now);
  const result = await sendReminder({
    number: invoice.number,
    clientName: invoice.clientName,
    email: invoice.email,
    phone: invoice.project.phone,
    totalCents: invoice.totalCents,
    amountPaidCents,
    dueDate: invoice.dueDate,
    daysOverdue: days,
    businessName: invoice.tenant.businessName,
  });

  /**
   * The attempt is counted either way — a reminder the desk thinks it sent but did not
   * is worse than no reminder at all — but only a letter that actually LEFT closes the
   * day. Stamping `remindedAt` on a failure spent the one chase this invoice gets: with
   * no address on file the answer was «handed to the call list», and the moment the
   * owner typed the address in, the button refused him until midnight.
   */
  await prisma.invoice.update({
    where: { id: invoice.id },
    data: {
      ...(result.sent ? { remindedAt: now } : {}),
      reminderCount: { increment: 1 },
    },
  });

  const owed = owingCents(state);
  const outcome = result.sent
    ? `${result.stage} reminder emailed to ${invoice.email}`
    : result.channel === "phone"
      ? `no email on file — handed to the call list${result.phone ? ` (${result.phone})` : ""}`
      : `${result.stage} reminder not sent (${result.reason})`;

  await record({
    tenantId,
    actor: guard.identity,
    action: "invoice.remind",
    entity: "Invoice",
    entityId: invoice.id,
    summary:
      `Chased ${invoice.number} — ${invoice.clientName}, ${money(owed)} owing, ` +
      `${days} ${days === 1 ? "day" : "days"} late: ${outcome}`,
    meta: {
      stage: result.stage,
      channel: result.channel,
      sent: result.sent,
      reason: result.reason,
      daysOverdue: days,
      owingCents: owed,
      attempt: invoice.reminderCount + 1,
    },
  });

  return NextResponse.json(result);
}
