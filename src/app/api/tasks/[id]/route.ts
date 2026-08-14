import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { sessionTenant } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { scopedUserId } from "@/lib/scope";
import { parseDayInput } from "@/lib/dates";

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "You are signed out — sign in again" }, { status: 401 });
  const { tenantId } = sessionTenant(session);

  const owned = await prisma.task.findFirst({
    where: { id: params.id, tenantId },
    select: { id: true },
  });
  if (!owned) return NextResponse.json({ error: "That record is gone — it was deleted, or the link points at another workspace" }, { status: 404 });

  const body = await req.json();

  // A task can only be handed to someone on this crew.
  const assignee = await scopedUserId(tenantId, body.assignedToId);
  if (!assignee.ok) return NextResponse.json({ error: "That crew member is not on this desk" }, { status: 400 });

  const task = await prisma.task.update({
    where: { id: owned.id },
    data: {
      title: body.title,
      description: body.description,
      status: body.status,
      assignedToId: assignee.value,
      dueDate: parseDayInput(body.dueDate),
    },
    include: { assignedTo: { select: { id: true, name: true } } },
  });

  return NextResponse.json(task);
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "You are signed out — sign in again" }, { status: 401 });
  const { tenantId } = sessionTenant(session);

  const { count } = await prisma.task.deleteMany({ where: { id: params.id, tenantId } });
  if (count === 0) return NextResponse.json({ error: "That record is gone — it was deleted, or the link points at another workspace" }, { status: 404 });

  return NextResponse.json({ ok: true });
}
