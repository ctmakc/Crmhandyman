import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAppSessionUser } from "@/lib/session";

const LEAD_STATUSES = new Set(["NEW", "CONTACTED", "VERIFIED", "REJECTED", "CONVERTED"]);

function optionalText(value: unknown, maxLength: number): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== "string") return undefined;
  return value.trim().slice(0, maxLength) || null;
}

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const user = await getAppSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const lead = await prisma.lead.findFirst({
    where: { id: params.id, tenantId: user.tenantId },
    include: {
      assignedTo: { select: { id: true, name: true } },
      project: { select: { id: true, title: true, status: true } },
      leadListing: { select: { id: true, status: true } },
    },
  });

  if (!lead) return NextResponse.json({ error: "Lead not found." }, { status: 404 });
  return NextResponse.json(lead);
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getAppSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
  }

  const existing = await prisma.lead.findFirst({
    where: { id: params.id, tenantId: user.tenantId },
    select: { id: true },
  });
  if (!existing) return NextResponse.json({ error: "Lead not found." }, { status: 404 });

  const name = optionalText(body.name, 120);
  const phone = optionalText(body.phone, 40);
  const email = optionalText(body.email, 160);
  const address = optionalText(body.address, 300);
  const city = optionalText(body.city, 100);
  const jobType = optionalText(body.jobType, 160);
  const notes = optionalText(body.notes, 10_000);
  const status = typeof body.status === "string" ? body.status.trim().toUpperCase() : undefined;
  const assignedToId =
    body.assignedToId === null || body.assignedToId === ""
      ? null
      : typeof body.assignedToId === "string"
        ? body.assignedToId.trim()
        : undefined;

  const errors: string[] = [];
  if (name !== undefined && (!name || name.length < 2)) errors.push("Lead name is required.");
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.push("Email is invalid.");
  if (status !== undefined && !LEAD_STATUSES.has(status)) errors.push("Lead status is invalid.");

  if (assignedToId) {
    const assignee = await prisma.user.findFirst({
      where: { id: assignedToId, tenantId: user.tenantId },
      select: { id: true },
    });
    if (!assignee) errors.push("Assigned user does not belong to this workspace.");
  }

  if (errors.length > 0) {
    return NextResponse.json({ error: "Validation failed.", details: errors }, { status: 422 });
  }

  const lead = await prisma.lead.update({
    where: { id: params.id },
    data: {
      name,
      phone,
      email,
      address,
      city,
      jobType,
      notes,
      status: status as "NEW" | "CONTACTED" | "VERIFIED" | "REJECTED" | "CONVERTED" | undefined,
      assignedToId,
    },
    include: {
      assignedTo: { select: { id: true, name: true } },
      project: { select: { id: true, title: true, status: true } },
      leadListing: { select: { id: true, status: true } },
    },
  });

  return NextResponse.json(lead);
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  const user = await getAppSessionUser();
  if (!user || user.role !== "ADMIN") {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }

  const existing = await prisma.lead.findFirst({
    where: { id: params.id, tenantId: user.tenantId },
    include: {
      project: { select: { id: true } },
      leadListing: { select: { id: true, status: true } },
    },
  });
  if (!existing) return NextResponse.json({ error: "Lead not found." }, { status: 404 });

  if (existing.project) {
    return NextResponse.json(
      { error: "A lead linked to a project cannot be deleted." },
      { status: 409 }
    );
  }
  if (existing.leadListing) {
    return NextResponse.json(
      { error: "Close and remove the network listing before deleting this lead." },
      { status: 409 }
    );
  }

  await prisma.lead.delete({ where: { id: existing.id } });
  return NextResponse.json({ success: true });
}
