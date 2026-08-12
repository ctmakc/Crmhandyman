import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, requireUser } from "@/lib/guard";

export async function POST(req: NextRequest) {
  // The crew collects at the door and buys materials on the way, so recording is
  // theirs. Reading the books and erasing entries is not — see DELETE and /summary.
  const guard = await requireUser();
  if (!guard.ok) return guard.response;
  const { tenantId } = guard.identity;

  const body = await req.json();
  const expense = await prisma.expense.create({
    data: {
      tenantId,
      projectId: body.projectId || undefined,
      amount: Number(body.amount),
      category: body.category || "OTHER",
      description: body.description,
      date: body.date ? new Date(body.date) : new Date(),
    },
  });

  return NextResponse.json(expense, { status: 201 });
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
