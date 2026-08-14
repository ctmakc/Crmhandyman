import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sessionTenant } from "@/lib/session";
import { scopedUserId } from "@/lib/scope";

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "You are signed out — sign in again" }, { status: 401 });
  const { tenantId } = sessionTenant(session);

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
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "You are signed out — sign in again" }, { status: 401 });
  const { tenantId } = sessionTenant(session);

  const body = await req.json();
  const existing = await prisma.lead.findFirst({ where: { id: params.id, tenantId } });
  if (!existing) return NextResponse.json({ error: "That record is gone — it was deleted, or the link points at another workspace" }, { status: 404 });

  // Reassignment is checked against this crew, the same as on creation.
  const assignee = await scopedUserId(tenantId, body.assignedToId);
  if (!assignee.ok) return NextResponse.json({ error: "That crew member is not on this desk" }, { status: 400 });

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
      assignedToId: assignee.value,
    },
  });

  return NextResponse.json(lead);
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "You are signed out — sign in again" }, { status: 401 });
  const { tenantId } = sessionTenant(session);

  const existing = await prisma.lead.findFirst({ where: { id: params.id, tenantId } });
  if (!existing) return NextResponse.json({ error: "That record is gone — it was deleted, or the link points at another workspace" }, { status: 404 });

  await prisma.lead.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
