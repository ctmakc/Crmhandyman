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
  const payment = await prisma.payment.create({
    data: {
      tenantId,
      projectId: body.projectId,
      amount: Number(body.amount),
      method: body.method || "CASH",
      date: body.date ? new Date(body.date) : new Date(),
      notes: body.notes,
    },
  });

  return NextResponse.json(payment, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  const { tenantId } = guard.identity;

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  // Scoped delete: an unscoped one reached into another contractor's books and could
  // silently turn their settled invoice back into money owed.
  const { count } = await prisma.payment.deleteMany({ where: { id, tenantId } });
  if (count === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ ok: true });
}
