import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { writeAuditEvent } from "@/lib/audit";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tenantId = (session.user as any).tenantId as string;

  const body = await req.json();
  const amount = Number(body.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ error: "amount must be greater than zero" }, { status: 400 });
  }

  let projectId: string | undefined;
  if (body.projectId) {
    const project = await prisma.project.findFirst({
      where: { id: String(body.projectId), tenantId },
      select: { id: true },
    });
    if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });
    projectId = project.id;
  }

  const expense = await prisma.expense.create({
    data: {
      tenantId,
      projectId,
      amount,
      category: body.category || "OTHER",
      description: body.description,
      date: body.date ? new Date(body.date) : new Date(),
    },
  });

  await writeAuditEvent({
    tenantId,
    actorEmail: session.user?.email,
    action: "expense.created",
    entityType: "expense",
    entityId: expense.id,
    summary: "Expense recorded",
    metadata: { projectId: expense.projectId, amount: expense.amount, category: expense.category },
  });

  return NextResponse.json(expense, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tenantId = (session.user as any).tenantId as string;

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const existing = await prisma.expense.findFirst({ where: { id, tenantId } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.expense.delete({ where: { id: existing.id } });
  await writeAuditEvent({
    tenantId,
    actorEmail: session.user?.email,
    action: "expense.deleted",
    entityType: "expense",
    entityId: existing.id,
    summary: "Expense deleted",
    metadata: { projectId: existing.projectId, amount: existing.amount, category: existing.category },
  });
  return NextResponse.json({ ok: true });
}
