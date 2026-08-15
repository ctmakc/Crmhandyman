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

  const project = await prisma.project.findFirst({
    where: { id: String(body.projectId ?? ""), tenantId },
    select: { id: true, clientName: true },
  });
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  const payment = await prisma.payment.create({
    data: {
      tenantId,
      projectId: project.id,
      amount,
      method: body.method || "CASH",
      date: body.date ? new Date(body.date) : new Date(),
      notes: body.notes,
    },
  });

  await writeAuditEvent({
    tenantId,
    actorEmail: session.user?.email,
    action: "payment.created",
    entityType: "payment",
    entityId: payment.id,
    summary: `Payment recorded for ${project.clientName}`,
    metadata: { projectId: project.id, amount: payment.amount, method: payment.method },
  });

  return NextResponse.json(payment, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tenantId = (session.user as any).tenantId as string;

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const existing = await prisma.payment.findFirst({ where: { id, tenantId } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.payment.delete({ where: { id: existing.id } });
  await writeAuditEvent({
    tenantId,
    actorEmail: session.user?.email,
    action: "payment.deleted",
    entityType: "payment",
    entityId: existing.id,
    summary: "Payment deleted",
    metadata: { projectId: existing.projectId, amount: existing.amount, method: existing.method },
  });
  return NextResponse.json({ ok: true });
}
