import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const estimates = await prisma.estimate.findMany({
    where: { projectId: params.id },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(estimates);
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

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

export async function PUT(req: NextRequest, { params: _params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const estimate = await prisma.estimate.update({
    where: { id: body.id },
    data: {
      status: body.status,
      notes: body.notes,
    },
  });

  return NextResponse.json(estimate);
}
