import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { writeAuditEvent } from "@/lib/audit";

const TASK_STATUSES = new Set(["TODO", "IN_PROGRESS", "DONE"]);

export async function PUT(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const user = session.user as any;
  const tenantId = user.tenantId as string;
  const userId = user.id as string;
  const isAdmin = user.role === "ADMIN";

  const existing = await prisma.task.findFirst({ where: { id: params.id, tenantId } });
  if (!existing) return NextResponse.json({ error: "Task not found" }, { status: 404 });
  if (!isAdmin && existing.assignedToId !== userId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const data: {
    title?: string;
    description?: string | null;
    status?: "TODO" | "IN_PROGRESS" | "DONE";
    assignedToId?: string;
    dueDate?: Date | null;
  } = {};

  if (body.title !== undefined) {
    const title = String(body.title).trim();
    if (!title) return NextResponse.json({ error: "title required" }, { status: 400 });
    data.title = title.slice(0, 300);
  }
  if (body.description !== undefined) data.description = body.description === null ? null : String(body.description).slice(0, 4000);
  if (body.status !== undefined) {
    const status = String(body.status).toUpperCase();
    if (!TASK_STATUSES.has(status)) return NextResponse.json({ error: "Invalid task status" }, { status: 400 });
    data.status = status as typeof data.status;
  }
  if (body.assignedToId !== undefined) {
    const assignedToId = String(body.assignedToId);
    if (!isAdmin && assignedToId !== userId) return NextResponse.json({ error: "Only admins can reassign tasks" }, { status: 403 });
    const assignee = await prisma.user.findFirst({ where: { id: assignedToId, tenantId }, select: { id: true } });
    if (!assignee) return NextResponse.json({ error: "Assignee not found" }, { status: 404 });
    data.assignedToId = assignee.id;
  }
  if (body.dueDate !== undefined) {
    data.dueDate = body.dueDate ? new Date(body.dueDate) : null;
  }

  const task = await prisma.task.update({
    where: { id: existing.id },
    data,
    include: { assignedTo: { select: { id: true, name: true } } },
  });

  await writeAuditEvent({
    tenantId,
    actorEmail: session.user?.email,
    action: existing.status !== task.status ? "task.status_changed" : "task.updated",
    entityType: "task",
    entityId: task.id,
    summary: existing.status !== task.status ? `Task ${existing.status} → ${task.status}` : `Task updated: ${task.title}`,
    metadata: {
      fromStatus: existing.status,
      toStatus: task.status,
      fromAssignedToId: existing.assignedToId,
      toAssignedToId: task.assignedToId,
    },
  });
  return NextResponse.json(task);
}

export async function DELETE(_: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const user = session.user as any;
  const tenantId = user.tenantId as string;
  const userId = user.id as string;
  const isAdmin = user.role === "ADMIN";

  const existing = await prisma.task.findFirst({ where: { id: params.id, tenantId } });
  if (!existing) return NextResponse.json({ error: "Task not found" }, { status: 404 });
  if (!isAdmin && existing.createdById !== userId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  await prisma.task.delete({ where: { id: existing.id } });
  await writeAuditEvent({
    tenantId,
    actorEmail: session.user?.email,
    action: "task.deleted",
    entityType: "task",
    entityId: existing.id,
    summary: `Task deleted: ${existing.title}`,
    metadata: { projectId: existing.projectId, assignedToId: existing.assignedToId },
  });
  return NextResponse.json({ ok: true });
}
