import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { writeAuditEvent } from "@/lib/audit";

const ESTIMATE_STATUSES = new Set(["DRAFT", "SENT", "ACCEPTED", "REJECTED"]);

async function tenantIdOf(session: unknown) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (session as any)?.user?.tenantId as string;
}

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const tenantId = await tenantIdOf(session);

  const project = await prisma.project.findFirst({ where: { id: params.id, tenantId }, select: { id: true } });
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  const estimates = await prisma.estimate.findMany({
    where: { projectId: project.id },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(estimates);
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const tenantId = await tenantIdOf(session);

  const project = await prisma.project.findFirst({ where: { id: params.id, tenantId }, select: { id: true, title: true } });
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  const body = await req.json();
  const rawItems = Array.isArray(body.lineItems) ? body.lineItems : [];
  const lineItems = rawItems
    .map((item: Record<string, unknown>) => ({
      description: String(item.description ?? "").trim().slice(0, 500),
      qty: Number(item.qty),
      unit: String(item.unit ?? "ea").trim().slice(0, 30),
      unitPrice: Number(item.unitPrice),
    }))
    .filter((item: { description: string; qty: number; unitPrice: number }) =>
      item.description && Number.isFinite(item.qty) && item.qty > 0 && Number.isFinite(item.unitPrice)
    );
  if (!lineItems.length) return NextResponse.json({ error: "At least one valid line item is required" }, { status: 400 });

  const subtotal = lineItems.reduce((sum: number, item: { qty: number; unitPrice: number }) => sum + item.qty * item.unitPrice, 0);
  const requestedRate = Number(body.taxRate ?? 0.13);
  const taxRate = Number.isFinite(requestedRate) ? Math.min(Math.max(requestedRate, 0), 0.3) : 0.13;
  const tax = subtotal * taxRate;
  const total = subtotal + tax;

  const estimate = await prisma.estimate.create({
    data: {
      projectId: project.id,
      lineItems: JSON.stringify(lineItems),
      subtotal,
      tax,
      total,
      notes: body.notes ? String(body.notes).slice(0, 4000) : undefined,
      validUntil: body.validUntil ? new Date(body.validUntil) : undefined,
      status: "DRAFT",
    },
  });

  await writeAuditEvent({
    tenantId,
    actorEmail: session.user?.email,
    action: "estimate.created",
    entityType: "estimate",
    entityId: estimate.id,
    summary: `Estimate created for ${project.title}`,
    metadata: { projectId: project.id, total: estimate.total },
  });
  return NextResponse.json(estimate, { status: 201 });
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const tenantId = await tenantIdOf(session);

  const body = await req.json();
  const estimateId = String(body.id ?? "");
  const existing = await prisma.estimate.findFirst({
    where: { id: estimateId, projectId: params.id, project: { tenantId } },
  });
  if (!existing) return NextResponse.json({ error: "Estimate not found" }, { status: 404 });

  const data: { status?: "DRAFT" | "SENT" | "ACCEPTED" | "REJECTED"; notes?: string | null } = {};
  if (body.status !== undefined) {
    const status = String(body.status).toUpperCase();
    if (!ESTIMATE_STATUSES.has(status)) return NextResponse.json({ error: "Invalid estimate status" }, { status: 400 });
    data.status = status as typeof data.status;
  }
  if (body.notes !== undefined) data.notes = body.notes === null ? null : String(body.notes).slice(0, 4000);

  const estimate = await prisma.estimate.update({ where: { id: existing.id }, data });
  await writeAuditEvent({
    tenantId,
    actorEmail: session.user?.email,
    action: "estimate.updated",
    entityType: "estimate",
    entityId: estimate.id,
    summary: existing.status !== estimate.status ? `Estimate ${existing.status} → ${estimate.status}` : "Estimate updated",
    metadata: { projectId: params.id, fromStatus: existing.status, toStatus: estimate.status },
  });
  return NextResponse.json(estimate);
}
