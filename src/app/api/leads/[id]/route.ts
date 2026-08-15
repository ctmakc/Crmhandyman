import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { writeAuditEvent } from "@/lib/audit";

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tenantId = (session.user as any).tenantId as string;

  const lead = await prisma.lead.findFirst({
    where: { id: params.id, tenantId },
    include: {
      assignedTo: { select: { id: true, name: true } },
      project: { select: { id: true, title: true, status: true } },
    },
  });

  if (!lead) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(lead);
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tenantId = (session.user as any).tenantId as string;

  const body = await req.json();
  const existing = await prisma.lead.findFirst({ where: { id: params.id, tenantId } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

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
      status: body.status,
      assignedToId: body.assignedToId,
    },
  });

  const changed = ["name", "phone", "email", "address", "city", "jobType", "notes", "status", "assignedToId"]
    .filter((key) => body[key] !== undefined && body[key] !== (existing as Record<string, unknown>)[key]);

  await writeAuditEvent({
    tenantId,
    actorEmail: session.user?.email,
    action: "lead.updated",
    entityType: "lead",
    entityId: lead.id,
    summary: `Lead updated: ${lead.name}`,
    metadata: { changed, fromStatus: existing.status, toStatus: lead.status },
  });

  return NextResponse.json(lead);
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tenantId = (session.user as any).tenantId as string;

  const existing = await prisma.lead.findFirst({ where: { id: params.id, tenantId } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.lead.delete({ where: { id: params.id } });
  await writeAuditEvent({
    tenantId,
    actorEmail: session.user?.email,
    action: "lead.deleted",
    entityType: "lead",
    entityId: existing.id,
    summary: `Lead deleted: ${existing.name}`,
    metadata: { source: existing.source, status: existing.status },
  });
  return NextResponse.json({ ok: true });
}
