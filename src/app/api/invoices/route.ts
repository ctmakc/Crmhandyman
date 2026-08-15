import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createNumberedInvoice } from "@/lib/invoice-create";
import { writeAuditEvent } from "@/lib/audit";

export interface LineItem {
  description: string;
  qty: number;
  unit: string;
  unitPrice: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

function cleanLineItems(value: unknown): LineItem[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((raw) => {
      const item = raw as Record<string, unknown>;
      return {
        description: String(item.description ?? "").trim().slice(0, 500),
        qty: Number(item.qty),
        unit: String(item.unit ?? "ea").trim().slice(0, 30),
        unitPrice: Number(item.unitPrice),
      };
    })
    .filter((item) => item.description && Number.isFinite(item.qty) && item.qty > 0 && Number.isFinite(item.unitPrice));
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
      ...(q ? { OR: [{ number: { contains: q } }, { clientName: { contains: q } }] } : {}),
    },
    include: {
      payments: { select: { amount: true } },
      project: { select: { id: true, title: true } },
    },
    orderBy: { issuedAt: "desc" },
  });

  return NextResponse.json(
    invoices.map((inv) => ({ ...inv, amountPaid: inv.payments.reduce((sum, payment) => sum + payment.amount, 0) }))
  );
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tenantId = (session.user as any).tenantId as string;

  const body = await req.json();
  const project = await prisma.project.findFirst({ where: { id: String(body.projectId ?? ""), tenantId } });
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  let lineItems = cleanLineItems(body.lineItems);
  let notes: string | undefined = body.notes ? String(body.notes).slice(0, 4000) : undefined;
  let estimateId: string | undefined = body.estimateId ? String(body.estimateId) : undefined;

  if (estimateId) {
    const estimate = await prisma.estimate.findFirst({ where: { id: estimateId, projectId: project.id } });
    if (!estimate) return NextResponse.json({ error: "Estimate not found" }, { status: 404 });
    lineItems = cleanLineItems(JSON.parse(estimate.lineItems));
    notes = notes ?? estimate.notes ?? undefined;
  } else {
    estimateId = undefined;
  }

  if (!lineItems.length) return NextResponse.json({ error: "An invoice needs at least one valid line" }, { status: 400 });

  const subtotal = round2(lineItems.reduce((sum, item) => sum + item.qty * item.unitPrice, 0));
  const requestedTaxRate = Number(body.taxRate ?? 0.13);
  const taxRate = Number.isFinite(requestedTaxRate) ? Math.min(Math.max(requestedTaxRate, 0), 0.3) : 0.13;
  const tax = round2(subtotal * taxRate);
  const total = round2(subtotal + tax);
  const dueDate = body.dueDate ? new Date(body.dueDate) : new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
  const depositRate = Math.min(Math.max(Number(body.depositRate) || 0, 0), 0.9);

  const base = {
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

    const deposit = await createNumberedInvoice(tenantId, {
      ...base,
      kind: "DEPOSIT",
      lineItems: JSON.stringify([
        { description: `Deposit — ${pct}% of ${project.title}`, qty: 1, unit: "ea", unitPrice: depositSubtotal },
      ]),
      subtotal: depositSubtotal,
      tax: depositTax,
      total: round2(depositSubtotal + depositTax),
      notes: `${pct}% deposit. Work is scheduled once this is settled.`,
      dueDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
    });

    try {
      const balance = await createNumberedInvoice(tenantId, {
        ...base,
        kind: "BALANCE",
        lineItems: JSON.stringify([
          ...lineItems,
          { description: `Less deposit invoice ${deposit.number}`, qty: 1, unit: "ea", unitPrice: -depositSubtotal },
        ]),
        subtotal: balanceSubtotal,
        tax: balanceTax,
        total: round2(balanceSubtotal + balanceTax),
        notes: notes ?? `Balance after the ${pct}% deposit.`,
        dueDate,
      });

      await writeAuditEvent({
        tenantId,
        actorEmail: session.user?.email,
        action: "invoice.split_created",
        entityType: "invoice",
        entityId: deposit.id,
        summary: `Deposit/balance invoices created for ${project.title}`,
        metadata: { projectId: project.id, depositId: deposit.id, balanceId: balance.id, total, depositRate },
      });
      return NextResponse.json({ ...deposit, balance, split: true }, { status: 201 });
    } catch (error) {
      // Never leave a live deposit invoice if its matching balance could not be cut.
      await prisma.invoice.update({ where: { id: deposit.id }, data: { status: "VOID" } }).catch(() => null);
      throw error;
    }
  }

  const invoice = await createNumberedInvoice(tenantId, {
    ...base,
    lineItems: JSON.stringify(lineItems),
    subtotal,
    tax,
    total,
    notes,
    dueDate,
  });

  await writeAuditEvent({
    tenantId,
    actorEmail: session.user?.email,
    action: "invoice.created",
    entityType: "invoice",
    entityId: invoice.id,
    summary: `Invoice ${invoice.number} created`,
    metadata: { projectId: project.id, total: invoice.total, estimateId },
  });
  return NextResponse.json(invoice, { status: 201 });
}
