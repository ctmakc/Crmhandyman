import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, requireUser } from "@/lib/guard";
import { record, money, day, jobLabel } from "@/lib/audit";
import { scopedProjectId } from "@/lib/scope";
import { parseDayInput } from "@/lib/dates";
import { inDollars, parseCents } from "@/lib/money";
import { PAYMENT_METHODS, badChoice, choice } from "@/lib/enums";

export async function POST(req: NextRequest) {
  // The crew collects at the door and buys materials on the way, so recording is
  // theirs. Reading the books and erasing entries is not — see DELETE and /summary.
  const guard = await requireUser();
  if (!guard.ok) return guard.response;
  const { tenantId } = guard.identity;

  const body = await req.json();

  // The job has to be ours. A bare body.projectId planted a payment on a stranger's
  // job — visible on their card through the relation, and undeletable by them, because
  // the row carried the attacker's tenant.
  const project = await scopedProjectId(tenantId, body.projectId);
  if (!project.ok || !project.value)
    return NextResponse.json({ error: "Job not found" }, { status: 404 });

  // Dollars from the form, cents from here on.
  const amountCents = parseCents(body.amount);
  if (amountCents === null || amountCents <= 0)
    return NextResponse.json({ error: "An amount is required" }, { status: 400 });

  // A method the shop does not take used to reach the enum column and answer 500 —
  // the tech at the door read that as "the payment did not go through".
  const method = choice(PAYMENT_METHODS, body.method);
  if (method === null)
    return NextResponse.json(badChoice("payment method", PAYMENT_METHODS), { status: 400 });

  const payment = await prisma.payment.create({
    data: {
      tenantId,
      projectId: project.value,
      amountCents,
      method: method ?? "CASH",
      date: parseDayInput(body.date) ?? new Date(),
      notes: body.notes,
    },
  });

  await record({
    tenantId,
    actor: guard.identity,
    action: "payment.record",
    entity: "Payment",
    entityId: payment.id,
    summary:
      `Recorded ${money(payment.amountCents)} by ${payment.method.replace(/_/g, " ")} on ` +
      `${day(payment.date)} against ${await jobLabel(tenantId, payment.projectId)}`,
    meta: {
      amountCents: payment.amountCents,
      method: payment.method,
      projectId: payment.projectId,
    },
  });

  return NextResponse.json(inDollars(payment), { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  const { tenantId } = guard.identity;

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Nothing was picked to remove" }, { status: 400 });

  // Scoped delete: an unscoped one reached into another contractor's books and could
  // silently turn their settled invoice back into money owed.
  // Read for the journal before it is gone: erasing a payment turns a settled invoice
  // back into a debt, and that is exactly the move a client will later dispute.
  const doomed = await prisma.payment.findFirst({ where: { id, tenantId } });

  const { count } = await prisma.payment.deleteMany({ where: { id, tenantId } });
  if (count === 0) return NextResponse.json({ error: "That record is gone — it was deleted, or the link points at another workspace" }, { status: 404 });

  if (doomed) {
    await record({
      tenantId,
      actor: guard.identity,
      action: "payment.delete",
      entity: "Payment",
      entityId: doomed.id,
      summary:
        `Deleted a ${money(doomed.amountCents)} ${doomed.method.replace(/_/g, " ")} payment taken ` +
        `${day(doomed.date)} on ${await jobLabel(tenantId, doomed.projectId)}`,
      meta: {
        amountCents: doomed.amountCents,
        method: doomed.method,
        date: doomed.date,
        projectId: doomed.projectId,
        invoiceId: doomed.invoiceId,
      },
    });
  }

  return NextResponse.json({ ok: true });
}
