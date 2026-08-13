import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, requireUser } from "@/lib/guard";
import { scopedProjectId } from "@/lib/scope";
import { parseDayInput } from "@/lib/dates";
import { inDollars, parseCents } from "@/lib/money";
import { EXPENSE_CATEGORIES, badChoice, choice } from "@/lib/enums";

export async function POST(req: NextRequest) {
  // The crew collects at the door and buys materials on the way, so recording is
  // theirs. Reading the books and erasing entries is not — see DELETE and /summary.
  const guard = await requireUser();
  if (!guard.ok) return guard.response;
  const { tenantId } = guard.identity;

  const body = await req.json();

  // A cost planted on a stranger's job dragged that job's margin under water on the
  // owner's own screen. An expense with no job at all is general overhead and fine.
  const project = await scopedProjectId(tenantId, body.projectId);
  if (!project.ok) return NextResponse.json({ error: "Job not found" }, { status: 404 });

  // Dollars from the form, cents from here on.
  const amountCents = parseCents(body.amount);
  if (amountCents === null || amountCents <= 0)
    return NextResponse.json({ error: "An amount is required" }, { status: 400 });

  // An unknown category reached the enum column and came back as a 500 — on the screen,
  // a Save button that does nothing. Say which field is wrong and what is on offer.
  const category = choice(EXPENSE_CATEGORIES, body.category);
  if (category === null)
    return NextResponse.json(badChoice("expense category", EXPENSE_CATEGORIES), { status: 400 });

  const expense = await prisma.expense.create({
    data: {
      tenantId,
      projectId: project.value,
      amountCents,
      category: category ?? "OTHER",
      description: body.description,
      date: parseDayInput(body.date) ?? new Date(),
    },
  });

  return NextResponse.json(inDollars(expense), { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  const { tenantId } = guard.identity;

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  // Scoped delete: a bare id let anyone erase another contractor's costs.
  const { count } = await prisma.expense.deleteMany({ where: { id, tenantId } });
  if (count === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ ok: true });
}
