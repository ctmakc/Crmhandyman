import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { writeAuditEvent } from "@/lib/audit";

export async function GET(_req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const u = session.user as any;
  const tenantId = u.tenantId as string;
  const userId = u.id as string;
  const isAdmin = u.role === "ADMIN";

  const tasks = await prisma.task.findMany({
    where: isAdmin ? { tenantId } : { tenantId, assignedToId: userId },
    include: {
      assignedTo: { select: { id: true, name: true } },
      project: { select: { id: true, title: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(tasks);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const u = session.user as any;
  const tenantId = u.tenantId as string;
  const userId = u.id as string;

  const body = await req.json();
  const title = String(body.title ?? "").trim();
  if (!title) return NextResponse.json({ error: "title required" }, { status: 400 });

  const assignedToId = String(body.assignedToId || userId);
  const assignee = await prisma.user.findFirst({ where: { id: assignedToId, tenantId }, select: { id: true } });
  if (!assignee) return NextResponse.json({ error: "Assignee not found" }, { status: 404 });

  let projectId: string | undefined;
  if (body.projectId) {
    const project = await prisma.project.findFirst({ where: { id: String(body.projectId), tenantId }, select: { id: true } });
    if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });
    projectId = project.id;
  }

  const task = await prisma.task.create({
    data: {
      tenantId,
      title: title.slice(0, 300),
      description: body.description ? String(body.description).slice(0, 4000) : undefined,
      projectId,
      assignedToId: assignee.id,
      createdById: userId,
      dueDate: body.dueDate ? new Date(body.dueDate) : undefined,
    },
    include: { assignedTo: { select: { id: true, name: true } } },
  });

  await writeAuditEvent({
    tenantId,
    actorEmail: session.user?.email,
    action: "task.created",
    entityType: "task",
    entityId: task.id,
    summary: `Task created: ${task.title}`,
    metadata: { projectId: task.projectId, assignedToId: task.assignedToId },
  });
  return NextResponse.json(task, { status: 201 });
}
