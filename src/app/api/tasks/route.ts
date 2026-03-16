import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(_req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = (session.user as { id?: string })?.id;
  const isAdmin = (session.user as { role?: string })?.role === "ADMIN";

  const tasks = await prisma.task.findMany({
    where: isAdmin ? {} : { assignedToId: userId },
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

  const userId = ((session.user as { id?: string })?.id) ?? "";
  const body = await req.json();

  const task = await prisma.task.create({
    data: {
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
