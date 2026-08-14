import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/guard";
import { scopedUserId } from "@/lib/scope";
import { parseDayInput } from "@/lib/dates";
import { inDollars, lineItemsJsonInDollars } from "@/lib/money";
import { parseDuration } from "@/lib/schedule";
import { doubleBooked } from "@/lib/schedule-db";
import { PROJECT_STATUSES, badChoice, choice } from "@/lib/enums";

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireUser();
  if (!guard.ok) return guard.response;
  const { tenantId, role } = guard.identity;

  const project = await prisma.project.findFirst({
    where: { id: params.id, tenantId },
    include: {
      lead: { select: { id: true, name: true, source: true } },
      assignedTo: { select: { id: true, name: true } },
      estimates: { orderBy: { createdAt: "desc" } },
      tasks: {
        include: { assignedTo: { select: { id: true, name: true } } },
        orderBy: { createdAt: "desc" },
      },
      invoices: {
        orderBy: { issuedAt: "desc" },
        include: { payments: { select: { amountCents: true } } },
      },
      payments: { orderBy: { date: "desc" } },
      expenses: { orderBy: { date: "desc" } },
    },
  });

  if (!project) return NextResponse.json({ error: "That record is gone — it was deleted, or the link points at another workspace" }, { status: 404 });

  /**
   * The books are the owner's. A tech opening the same job card was reading the quoted
   * price, the margin and every invoice on it — the rail hides the finance screens, and
   * this payload handed the same numbers over anyway. The field needs the address, the
   * work and its tasks; the money rides with `viewerRole` so the page knows what to draw.
   */
  if (role !== "ADMIN") {
    /**
     * ONE number survives the filter: what this job still owes.
     *
     * The tech collects at the door — that is his part of the money and always has been —
     * and the screen he collects on showed him no figure at all, so every visit ended in
     * a phone call to the office to ask how much. The role filter had taken the amount
     * out along with the margin, the quoted price and the rest of the book. This is the
     * balance on the paper the client is holding, and nothing else.
     */
    const invoicedCents = project.invoices
      .filter((i) => i.status === "SENT" || i.status === "PARTIAL")
      .reduce(
        (sum, i) => sum + (i.totalCents - i.payments.reduce((paid, p) => paid + p.amountCents, 0)),
        0
      );

    /**
     * Money taken at the door carries no invoice — `POST /api/finance/payments` files it
     * against the job — so the sum above never saw it. The tech collected $519.80, the
     * card went on saying he was owed $519.80, and the next visit he asked for it again.
     * Payments already tied to one of those invoices are inside `invoicedCents`; only the
     * loose ones are subtracted here, and the balance never runs past zero.
     */
    const atDoorCents = project.payments
      .filter((p) => p.invoiceId == null)
      .reduce((sum, p) => sum + p.amountCents, 0);
    const dueAtDoorCents = Math.max(invoicedCents - atDoorCents, 0);

    /**
     * The books stay the owner's; this job's takings do not. Silence here read as a lost
     * payment to the one man who knows it was not lost, so the crew gets back the four
     * facts he wrote down himself — when, how much, by what, and his note. No quoted
     * price, no margin, no invoice, no other job.
     */
    const crewPayments = project.payments.map((p) => ({
      id: p.id,
      date: p.date,
      amountCents: p.amountCents,
      method: p.method,
      notes: p.notes,
    }));

    return NextResponse.json({
      ...project,
      estimates: [],
      invoices: [],
      expenses: [],
      // Out through the same door as every other amount — dollars, once.
      ...inDollars({ dueAtDoorCents, payments: crewPayments }),
      viewerRole: role,
    });
  }

  // Out in dollars, lines re-priced into dollars with them.
  return NextResponse.json({
    ...inDollars(project),
    estimates: project.estimates.map((e) => ({
      ...inDollars(e),
      lineItems: lineItemsJsonInDollars(e.lineItems),
    })),
    invoices: project.invoices.map((i) => ({
      ...inDollars(i),
      lineItems: lineItemsJsonInDollars(i.lineItems),
    })),
    viewerRole: role,
  });
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireUser();
  if (!guard.ok) return guard.response;
  const { tenantId, role } = guard.identity;

  const existing = await prisma.project.findFirst({ where: { id: params.id, tenantId } });
  if (!existing) return NextResponse.json({ error: "That record is gone — it was deleted, or the link points at another workspace" }, { status: 404 });

  const body = await req.json();

  const assignee = await scopedUserId(tenantId, body.assignedToId);
  if (!assignee.ok) return NextResponse.json({ error: "That crew member is not on this desk" }, { status: 400 });

  // A status the schema has never heard of reached Prisma and answered 500 — the board
  // showed a status button that silently did nothing.
  const status = choice(PROJECT_STATUSES, body.status);
  if (status === null)
    return NextResponse.json(badChoice("job status", PROJECT_STATUSES), { status: 400 });

  /**
   * Who owns a job is the dispatcher's call. The crew select on the job card sends the
   * whole project back on every save, so a tech pressing «Start job» was also posting
   * `assignedToId: null` — one tap took him off the work order and out of the day plan.
   */
  const assignedToId =
    role === "ADMIN" && "assignedToId" in body ? assignee.value ?? null : undefined;

  /**
   * How long the job runs is the same call as who runs it, and it travels the same way:
   * the crew's screens post the whole project back on every save, so a tech pressing
   * «Start job» must not be able to shorten a four-day renovation to nothing.
   */
  const durationMinutes =
    role === "ADMIN" && "durationMinutes" in body ? parseDuration(body.durationMinutes) : undefined;

  /**
   * The day the work was finished, stamped by the act of finishing it.
   *
   * Nothing ever wrote this column: no screen sends `completedDate`, so every job in
   * every workspace carried null — and the P&L, which counts a period's closed work by
   * this date, read JOBS CLOSED 0 forever, on a month with revenue in it. The status is
   * what a person actually sets, so the date follows the status. Moving a job back OUT
   * of COMPLETED clears it, because a job that is running again was not finished.
   */
  const completedDate =
    status === "COMPLETED"
      ? existing.completedDate ?? new Date()
      : status && status !== existing.status
        ? null
        : parseDayInput(body.completedDate);

  const project = await prisma.project.update({
    where: { id: params.id },
    data: {
      clientName: body.clientName,
      phone: body.phone,
      email: body.email,
      address: body.address,
      title: body.title,
      description: body.description,
      jobType: body.jobType,
      status,
      scheduledDate: parseDayInput(body.scheduledDate),
      completedDate,
      assignedToId,
      durationMinutes,
    },
  });

  /**
   * The answer carries the double booking rather than refusing the save. Two short
   * moving jobs on one man in one afternoon is a normal Saturday; the dispatcher has to
   * be told, and then left to decide.
   */
  return NextResponse.json({ ...project, conflicts: await doubleBooked(tenantId, project) });
}
