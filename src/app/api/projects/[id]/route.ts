import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { writeAuditEvent } from "@/lib/audit";

export async function GET(_: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tenantId = (session.user as any).tenantId as string;

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
        include: { payments: { select: { amount: true } } },
      },
      payments: { orderBy: { date: "desc" } },
      expenses: { orderBy: { date: "desc" } },
    },
  });

  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(project);
}

export async function PUT(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tenantId = (session.user as any).tenantId as string;

  const existing = await prisma.project.findFirst({ where: { id: params.id, tenantId } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json();
  if (body.assignedToId) {
    const worker = await prisma.user.findFirst({
      where: { id: String(body.assignedToId), tenantId },
      select: { id: true },
    });
    if (!worker) return NextResponse.json({ error: "Crew member not found" }, { status: 404 });
  }

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
      status: body.status,
      scheduledDate: body.scheduledDate ? new Date(body.scheduledDate) : undefined,
      completedDate: body.completedDate ? new Date(body.completedDate) : undefined,
      assignedToId: body.assignedToId || null,
    },
  });

  const statusChanged = existing.status !== project.status;
  const assigneeChanged = existing.assignedToId !== project.assignedToId;
  await writeAuditEvent({
    tenantId,
    actorEmail: session.user?.email,
    action: statusChanged ? "project.status_changed" : assigneeChanged ? "project.assigned" : "project.updated",
    entityType: "project",
    entityId: project.id,
    summary: statusChanged
      ? `Job status ${existing.status} → ${project.status}`
      : assigneeChanged
        ? "Job crew assignment changed"
        : `Job updated: ${project.title}`,
    metadata: {
      fromStatus: existing.status,
      toStatus: project.status,
      fromAssignedToId: existing.assignedToId,
      toAssignedToId: project.assignedToId,
    },
  });

  return NextResponse.json(project);
}
