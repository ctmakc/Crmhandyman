import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/guard";
import { scopedProjectId, scopedUserId } from "@/lib/scope";
import { parseDayInput } from "@/lib/dates";

export async function GET(_req: NextRequest) {
  const guard = await requireUser();
  if (!guard.ok) return guard.response;
  const { tenantId, id: userId, role } = guard.identity;

  const tasks = await prisma.task.findMany({
    where: role === "ADMIN" ? { tenantId } : { tenantId, assignedToId: userId },
    include: {
      assignedTo: { select: { id: true, name: true } },
      project: { select: { id: true, title: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(tasks);
}

export async function POST(req: NextRequest) {
  const guard = await requireUser();
  if (!guard.ok) return guard.response;
  const { tenantId, id: userId } = guard.identity;

  const body = await req.json();

  // Both ids in the body point outside this row. Unchecked, a task landed on a
  // stranger's job card and their job title came back in the attacker's own task list.
  const project = await scopedProjectId(tenantId, body.projectId);
  if (!project.ok) return NextResponse.json({ error: "Job not found" }, { status: 404 });

  const assignee = await scopedUserId(tenantId, body.assignedToId);
  if (!assignee.ok) return NextResponse.json({ error: "That crew member is not on this desk" }, { status: 400 });

  const task = await prisma.task.create({
    data: {
      tenantId,
      title: body.title,
      description: body.description,
      projectId: project.value,
      assignedToId: assignee.value ?? userId,
      createdById: userId,
      dueDate: parseDayInput(body.dueDate),
    },
    include: { assignedTo: { select: { id: true, name: true } } },
  });

  return NextResponse.json(task, { status: 201 });
}
