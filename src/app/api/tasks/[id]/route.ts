import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/guard";
import { prisma } from "@/lib/prisma";
import { scopedUserId } from "@/lib/scope";
import { parseDayInput } from "@/lib/dates";

/**
 * Whose task the caller may touch. The owner runs the board, so an ADMIN edits any card;
 * a crew member may only move their own. Without the assignee clause a worker who read
 * another tech's task id off a shared job card could retitle, reassign, complete or
 * delete that tech's work — the list endpoint scopes to the caller, these mutations did
 * not. The tenant clause stays first: it is the wall between workspaces.
 */
function taskScope(id: string, identity: { tenantId: string; id: string; role: "ADMIN" | "WORKER" }) {
  return identity.role === "ADMIN"
    ? { id, tenantId: identity.tenantId }
    : { id, tenantId: identity.tenantId, assignedToId: identity.id };
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireUser();
  if (!guard.ok) return guard.response;
  const identity = guard.identity;
  const { tenantId } = identity;

  const owned = await prisma.task.findFirst({
    where: taskScope(params.id, identity),
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
  const guard = await requireUser();
  if (!guard.ok) return guard.response;
  const identity = guard.identity;

  const { count } = await prisma.task.deleteMany({ where: taskScope(params.id, identity) });
  if (count === 0) return NextResponse.json({ error: "That record is gone — it was deleted, or the link points at another workspace" }, { status: 404 });

  return NextResponse.json({ ok: true });
}
