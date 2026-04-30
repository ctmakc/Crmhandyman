import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

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

  const task = await prisma.task.create({
    data: {
      tenantId,
      title: body.title,
      description: body.description,
      projectId: body.projectId || undefined,
      assignedToId: body.assignedToId || userId,
      createdById: userId,
      dueDate: body.dueDate ? new Date(body.dueDate) : undefined,
    },
    include: { assignedTo: { select: { id: true, name: true } } },
  });

  return NextResponse.json(task, { status: 201 });
}
