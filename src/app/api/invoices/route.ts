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

/** Money never leaves this file with more than two decimals. */
const round2 = (n: number) => Math.round(n * 100) / 100;

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

  /**
   * A deposit split cuts ONE job into TWO independently payable invoices, which is
   * how an install is actually billed. The deposit is a single percentage line — it
   * must not repeat the itemisation, or the client is looking at the price twice.
   * The balance carries the real lines and subtracts what the deposit already covered.
   */
  const depositRate = Math.min(Math.max(Number(body.depositRate) || 0, 0), 0.9);

  const base = {
    tenantId,
    projectId: project.id,
    estimateId,
    clientName: project.clientName,
    address: project.address,
    email: project.email,
    status: "DRAFT" as const,
  };

  if (depositRate > 0) {
    const depositSubtotal = round2(subtotal * depositRate);
    const depositTax = round2(depositSubtotal * taxRate);
    const balanceSubtotal = round2(subtotal - depositSubtotal);
    const balanceTax = round2(tax - depositTax);

    const pct = Math.round(depositRate * 100);

    const deposit = await prisma.invoice.create({
      data: {
        ...base,
        kind: "DEPOSIT",
        number: await nextNumber(tenantId),
        lineItems: JSON.stringify([
          {
            description: `Deposit — ${pct}% of ${project.title}`,
            qty: 1,
            unit: "ea",
            unitPrice: depositSubtotal,
          },
        ]),
        subtotal: depositSubtotal,
        tax: depositTax,
        total: round2(depositSubtotal + depositTax),
        notes: `${pct}% deposit. Work is scheduled once this is settled.`,
        // A deposit is due before the truck rolls, not on net-14 terms.
        dueDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
      },
    });

    const balance = await prisma.invoice.create({
      data: {
        ...base,
        kind: "BALANCE",
        number: await nextNumber(tenantId),
        lineItems: JSON.stringify([
          ...lineItems,
          {
            description: `Less deposit invoice ${deposit.number}`,
            qty: 1,
            unit: "ea",
            unitPrice: -depositSubtotal,
          },
        ]),
        subtotal: balanceSubtotal,
        tax: balanceTax,
        total: round2(balanceSubtotal + balanceTax),
        notes: notes ?? `Balance after the ${pct}% deposit.`,
        dueDate,
      },
    });

    return NextResponse.json({ ...deposit, balance, split: true }, { status: 201 });
  }

  const invoice = await prisma.invoice.create({
    data: {
      ...base,
      number: await nextNumber(tenantId),
      lineItems: JSON.stringify(lineItems),
      subtotal,
      tax,
      total,
      notes,
      dueDate,
    },
  });

  return NextResponse.json(invoice, { status: 201 });
}
