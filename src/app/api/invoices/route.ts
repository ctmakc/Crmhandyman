import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export interface LineItem {
  description: string;
  qty: number;
  unit: string;
  unitPrice: number;
}

/** Sequential, human-quotable invoice number, scoped per tenant per year. */
async function nextNumber(tenantId: string) {
  const year = new Date().getFullYear();
  const count = await prisma.invoice.count({
    where: { tenantId, number: { startsWith: `INV-${year}-` } },
  });
  return `INV-${year}-${String(count + 1).padStart(4, "0")}`;
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tenantId = (session.user as any).tenantId as string;

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const q = searchParams.get("q");

  const invoices = await prisma.invoice.findMany({
    where: {
      tenantId,
      ...(status ? { status: status as never } : {}),
      ...(q
        ? {
            OR: [{ number: { contains: q } }, { clientName: { contains: q } }],
          }
        : {}),
    },
    include: {
      payments: { select: { amount: true } },
      project: { select: { id: true, title: true } },
    },
    orderBy: { issuedAt: "desc" },
  });

  return NextResponse.json(
    invoices.map((inv) => ({
      ...inv,
      amountPaid: inv.payments.reduce((s, p) => s + p.amount, 0),
    }))
  );
}

/**
 * Create an invoice, either from scratch or by tearing off an accepted estimate
 * (`estimateId` in the body copies its line items and totals verbatim).
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tenantId = (session.user as any).tenantId as string;

  const body = await req.json();
  const project = await prisma.project.findFirst({
    where: { id: body.projectId, tenantId },
  });
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  let lineItems: LineItem[] = body.lineItems ?? [];
  let notes: string | undefined = body.notes;
  let estimateId: string | undefined = body.estimateId;

  if (estimateId) {
    const estimate = await prisma.estimate.findFirst({
      where: { id: estimateId, projectId: project.id },
    });
    if (!estimate) return NextResponse.json({ error: "Estimate not found" }, { status: 404 });
    lineItems = JSON.parse(estimate.lineItems) as LineItem[];
    notes = notes ?? estimate.notes ?? undefined;
  } else {
    estimateId = undefined;
  }

  if (!lineItems.length)
    return NextResponse.json({ error: "An invoice needs at least one line" }, { status: 400 });

  const subtotal = lineItems.reduce((sum, i) => sum + i.qty * i.unitPrice, 0);
  const taxRate = body.taxRate ?? 0.13;
  const tax = subtotal * taxRate;
  const total = subtotal + tax;

  const dueDate = body.dueDate
    ? new Date(body.dueDate)
    : new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);

  const invoice = await prisma.invoice.create({
    data: {
      tenantId,
      projectId: project.id,
      estimateId,
      number: await nextNumber(tenantId),
      clientName: project.clientName,
      address: project.address,
      email: project.email,
      lineItems: JSON.stringify(lineItems),
      subtotal,
      tax,
      total,
      notes,
      dueDate,
      status: "DRAFT",
    },
  });

  return NextResponse.json(invoice, { status: 201 });
}
