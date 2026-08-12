import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { sessionTenant } from "@/lib/session";
import { prisma } from "@/lib/prisma";

/** The project must belong to the caller's tenant before anything is read or written onto it. */
async function ownedProject(projectId: string, tenantId: string) {
  return prisma.project.findFirst({ where: { id: projectId, tenantId }, select: { id: true } });
}

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { tenantId } = sessionTenant(session);

  if (!(await ownedProject(params.id, tenantId)))
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  const estimates = await prisma.estimate.findMany({
    where: { projectId: params.id, tenantId },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(estimates);
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { tenantId } = sessionTenant(session);

  if (!(await ownedProject(params.id, tenantId)))
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json();
  const lineItems = body.lineItems as Array<{
    description: string;
    qty: number;
    unit: string;
    unitPrice: number;
  }>;

  const subtotal = lineItems.reduce((sum, item) => sum + item.qty * item.unitPrice, 0);
  const taxRate = body.taxRate ?? 0.13;
  const tax = subtotal * taxRate;
  const total = subtotal + tax;

  const estimate = await prisma.estimate.create({
    data: {
      tenantId,
      projectId: params.id,
      lineItems: JSON.stringify(lineItems),
      subtotal,
      tax,
      total,
      notes: body.notes,
      validUntil: body.validUntil ? new Date(body.validUntil) : undefined,
      status: "DRAFT",
    },
  });

  return NextResponse.json(estimate, { status: 201 });
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { tenantId } = sessionTenant(session);

  const body = await req.json();

  // Scope by id AND tenant AND the project in the URL: accepting a bare body.id let
  // anyone flip another contractor's estimate to ACCEPTED.
  const owned = await prisma.estimate.findFirst({
    where: { id: body.id, tenantId, projectId: params.id },
    select: { id: true },
  });
  if (!owned) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const estimate = await prisma.estimate.update({
    where: { id: owned.id },
    data: {
      status: body.status,
      notes: body.notes,
    },
  });

  return NextResponse.json(estimate);
}
