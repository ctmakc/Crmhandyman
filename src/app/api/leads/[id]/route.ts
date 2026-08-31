import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/guard";
import { scopedUserId } from "@/lib/scope";
import { LEAD_STATUSES, badChoice, choice } from "@/lib/enums";
import { leadTaskMarker } from "@/lib/lead-sales";

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireUser();
  if (!guard.ok) return guard.response;
  const { tenantId } = guard.identity;

  const lead = await prisma.lead.findFirst({
    where: { id: params.id, tenantId },
    include: {
      assignedTo: { select: { id: true, name: true } },
      project: { select: { id: true, title: true, status: true } },
    },
  });

  if (!lead) return NextResponse.json({ error: "That record is gone — it was deleted, or the link points at another workspace" }, { status: 404 });
  return NextResponse.json(lead);
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireUser();
  if (!guard.ok) return guard.response;
  const { tenantId } = guard.identity;

  const body = await req.json();
  const existing = await prisma.lead.findFirst({ where: { id: params.id, tenantId } });
  if (!existing) return NextResponse.json({ error: "That record is gone — it was deleted, or the link points at another workspace" }, { status: 404 });

  // Reassignment is checked against this crew, the same as on creation.
  const assignee = await scopedUserId(tenantId, body.assignedToId);
  if (!assignee.ok) return NextResponse.json({ error: "That crew member is not on this desk" }, { status: 400 });

  // This route used to hand an arbitrary string straight to Prisma. A typo from a
  // client or stale UI then became a 500 instead of an honest 400.
  const status = choice(LEAD_STATUSES, body.status);
  if (status === null) {
    return NextResponse.json(badChoice("lead status", LEAD_STATUSES), { status: 400 });
  }

  const lead = await prisma.lead.update({
    where: { id: params.id },
    data: {
      name: body.name,
      phone: body.phone,
      email: body.email,
      address: body.address,
      city: body.city,
      jobType: body.jobType,
      notes: body.notes,
      status,
      assignedToId: assignee.value,
    },
  });

  return NextResponse.json(lead);
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireUser();
  if (!guard.ok) return guard.response;
  const { tenantId } = guard.identity;

  const existing = await prisma.lead.findFirst({ where: { id: params.id, tenantId } });
  if (!existing) return NextResponse.json({ error: "That record is gone — it was deleted, or the link points at another workspace" }, { status: 404 });

  // Follow-up tasks deliberately have no foreign key yet: this wave reuses the existing
  // Task table to avoid a launch-week migration. Close them before the lead disappears so
  // the crew never gets an overdue callback for a record that no longer exists.
  await prisma.$transaction([
    prisma.task.updateMany({
      where: {
        tenantId,
        status: { in: ["TODO", "IN_PROGRESS"] },
        description: { contains: leadTaskMarker(params.id) },
      },
      data: { status: "DONE" },
    }),
    prisma.lead.delete({ where: { id: params.id } }),
  ]);

  return NextResponse.json({ ok: true });
}
