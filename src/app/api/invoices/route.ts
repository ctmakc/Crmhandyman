import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/guard";
import { record, money } from "@/lib/audit";
import {
  inDollars,
  lineItemsFromInput,
  lineItemsJsonInDollars,
  lineItemsToJson,
  parseLineItems,
  parseTaxRate,
  quoteTotals,
  shareOfCents,
  type LineItem,
} from "@/lib/money";
import { parseDayInput } from "@/lib/dates";
import { createInvoice } from "@/lib/invoice-number";

/**
 * One door out of this route: cents become dollars and the stored lines are re-priced
 * into dollars, because paper, bookkeeper and API client all read dollars.
 */
const invoiceOut = <T extends { lineItems: string }>(invoice: T) => ({
  ...inDollars(invoice),
  lineItems: lineItemsJsonInDollars(invoice.lineItems),
});

export async function GET(req: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  const { tenantId } = guard.identity;

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
      payments: { select: { amountCents: true } },
      project: { select: { id: true, title: true } },
    },
    orderBy: { issuedAt: "desc" },
  });

  return NextResponse.json(
    invoices.map((inv) =>
      invoiceOut({
        ...inv,
        amountPaidCents: inv.payments.reduce((s, p) => s + p.amountCents, 0),
      })
    )
  );
}

/**
 * Create an invoice, either from scratch or by tearing off an accepted estimate
 * (`estimateId` in the body copies its line items and totals verbatim).
 */
export async function POST(req: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  const { tenantId } = guard.identity;

  const body = await req.json();
  const project = await prisma.project.findFirst({
    where: { id: body.projectId, tenantId },
  });
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  let lineItems: LineItem[] = lineItemsFromInput(body.lineItems);
  let notes: string | undefined = body.notes;
  let estimateId: string | undefined = body.estimateId;

  if (estimateId) {
    const estimate = await prisma.estimate.findFirst({
      where: { id: estimateId, projectId: project.id, tenantId },
    });
    if (!estimate) return NextResponse.json({ error: "Estimate not found" }, { status: 404 });
    lineItems = parseLineItems(estimate.lineItems);
    notes = notes ?? estimate.notes ?? undefined;
  } else {
    estimateId = undefined;
  }

  if (!lineItems.length)
    return NextResponse.json({ error: "An invoice needs at least one line" }, { status: 400 });

  // Priced once, in cents, by the same function the estimate screen previews with.
  // Unrounded floats used to bill 274.025 — a third of a cent the client cannot
  // transfer, and a CSV row whose columns no longer added up to their own total.
  const taxRate = parseTaxRate(body.taxRate);
  if (taxRate === null)
    return NextResponse.json(
      { error: "Tax rate is a fraction between 0 and 0.3 — 13% is 0.13", field: "taxRate" },
      { status: 400 }
    );
  const { subtotalCents, taxCents, totalCents } = quoteTotals(lineItems, taxRate);

  const dueDate =
    parseDayInput(body.dueDate) ?? new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);

  /**
   * A deposit split cuts ONE job into TWO independently payable invoices, which is
   * how an install is actually billed. The deposit is a single percentage line — it
   * must not repeat the itemisation, or the client is looking at the price twice.
   * The balance carries the real lines and subtracts what the deposit already covered.
   */
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
    /**
     * The halves are cut out of the whole and the second half takes whatever the first
     * one left, so the two invoices add up to the single invoice for the same job to
     * the cent. Rounding each half on its own made the same work cost a different
     * amount depending on how it was paperworked.
     */
    const depositSubtotalCents = shareOfCents(subtotalCents, depositRate);
    const depositTaxCents = shareOfCents(depositSubtotalCents, taxRate);
    const balanceSubtotalCents = subtotalCents - depositSubtotalCents;
    const balanceTaxCents = taxCents - depositTaxCents;

    const pct = Math.round(depositRate * 100);

    const deposit = await createInvoice(tenantId, {
      ...base,
        kind: "DEPOSIT",
        lineItems: lineItemsToJson([
          {
            description: `Deposit — ${pct}% of ${project.title}`,
            qty: 1,
            unit: "ea",
            unitPriceCents: depositSubtotalCents,
          },
        ]),
        subtotalCents: depositSubtotalCents,
        taxCents: depositTaxCents,
        totalCents: depositSubtotalCents + depositTaxCents,
        notes: `${pct}% deposit. Work is scheduled once this is settled.`,
        // A deposit is due before the truck rolls, not on net-14 terms.
        dueDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
    });

    const balance = await createInvoice(tenantId, {
      ...base,
        kind: "BALANCE",
        lineItems: lineItemsToJson([
          ...lineItems,
          {
            description: `Less deposit invoice ${deposit.number}`,
            qty: 1,
            unit: "ea",
            unitPriceCents: -depositSubtotalCents,
          },
        ]),
        subtotalCents: balanceSubtotalCents,
        taxCents: balanceTaxCents,
        totalCents: balanceSubtotalCents + balanceTaxCents,
        notes: notes ?? `Balance after the ${pct}% deposit.`,
        dueDate,
    });

    // One entry per invoice: each half is chased, paid and disputed on its own, so
    // filtering the journal by either invoice id has to return its own history.
    await record({
      tenantId,
      actor: guard.identity,
      action: "invoice.issue",
      entity: "Invoice",
      entityId: deposit.id,
      summary:
        `Issued ${deposit.number} (${money(deposit.totalCents)}) to ${project.clientName} — ` +
        `${pct}% deposit on ${project.title}`,
      meta: { kind: "DEPOSIT", split: true, balanceNumber: balance.number, estimateId },
    });
    await record({
      tenantId,
      actor: guard.identity,
      action: "invoice.issue",
      entity: "Invoice",
      entityId: balance.id,
      summary:
        `Issued ${balance.number} (${money(balance.totalCents)}) to ${project.clientName} — ` +
        `balance on ${project.title} after deposit ${deposit.number}`,
      meta: { kind: "BALANCE", split: true, depositNumber: deposit.number, estimateId },
    });

    return NextResponse.json(
      { ...invoiceOut(deposit), balance: invoiceOut(balance), split: true },
      { status: 201 }
    );
  }

  const invoice = await createInvoice(tenantId, {
    ...base,
    lineItems: lineItemsToJson(lineItems),
    subtotalCents,
    taxCents,
    totalCents,
    notes,
    dueDate,
  });

  await record({
    tenantId,
    actor: guard.identity,
    action: "invoice.issue",
    entity: "Invoice",
    entityId: invoice.id,
    summary:
      `Issued ${invoice.number} (${money(invoice.totalCents)}) to ${project.clientName} — ${project.title}` +
      (estimateId ? ", torn off the accepted estimate" : ""),
    meta: { kind: "FULL", subtotalCents, taxCents, taxRate, estimateId },
  });

  return NextResponse.json(invoiceOut(invoice), { status: 201 });
}
