import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/guard";
import { record, money } from "@/lib/audit";
import { round2 } from "@/lib/money";
import { parseDayInput } from "@/lib/dates";

export interface LineItem {
  description: string;
  qty: number;
  unit: string;
  unitPrice: number;
}

/**
 * Sequential, human-quotable invoice number, scoped per tenant per year.
 *
 * Derived from the highest number already issued rather than from a count, so a
 * voided or manually removed row cannot make the sequence reuse a number. Callers
 * must go through `createInvoice`, which retries on the unique-constraint race.
 */
async function nextNumber(tenantId: string) {
  const year = new Date().getFullYear();
  const prefix = `INV-${year}-`;

  /**
   * Compared as numbers, not as text. The padding is four wide, so the ten-thousandth
   * invoice of a year sorts BELOW the nine-thousandth as a string ("INV-2026-10000" <
   * "INV-2026-9999") and its tail reads "0000" — the sequence restarted at one and
   * every retry then hit the unique constraint, answering 500 for the rest of the year.
   */
  const issued = await prisma.invoice.findMany({
    where: { tenantId, number: { startsWith: prefix } },
    select: { number: true },
  });

  const seq = issued.reduce((top, i) => Math.max(top, Number(i.number.slice(prefix.length)) || 0), 0);
  return `${prefix}${String(seq + 1).padStart(4, "0")}`;
}

/** Prisma's unique-constraint violation. */
const isDuplicateNumber = (e: unknown) =>
  typeof e === "object" && e !== null && (e as { code?: string }).code === "P2002";

/**
 * Two invoices created in the same instant compute the same number and the second
 * insert violates `@@unique([tenantId, number])`. Rather than 500, take the next
 * number and try again.
 */
async function createInvoice(
  tenantId: string,
  data: Omit<Parameters<typeof prisma.invoice.create>[0]["data"], "number" | "tenantId">
) {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      return await prisma.invoice.create({
        data: { ...data, tenantId, number: await nextNumber(tenantId) } as never,
      });
    } catch (e) {
      if (!isDuplicateNumber(e) || attempt === 4) throw e;
    }
  }
  throw new Error("Could not allocate an invoice number");
}

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
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  const { tenantId } = guard.identity;

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
      where: { id: estimateId, projectId: project.id, tenantId },
    });
    if (!estimate) return NextResponse.json({ error: "Estimate not found" }, { status: 404 });
    lineItems = JSON.parse(estimate.lineItems) as LineItem[];
    notes = notes ?? estimate.notes ?? undefined;
  } else {
    estimateId = undefined;
  }

  if (!lineItems.length)
    return NextResponse.json({ error: "An invoice needs at least one line" }, { status: 400 });

  // Rounded here, once, and every number downstream is derived from these three.
  // Unrounded, an invoice went out for 274.025: a third of a cent the client cannot
  // transfer, and a CSV row whose columns no longer add up to their own total.
  const subtotal = round2(lineItems.reduce((sum, i) => sum + i.qty * i.unitPrice, 0));
  const taxRate = body.taxRate ?? 0.13;
  const tax = round2(subtotal * taxRate);
  const total = round2(subtotal + tax);

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
     * The halves are cut out of the ALREADY ROUNDED whole, and the second half takes
     * whatever the first one left. Rounding each half on its own let the two invoices
     * add up to a cent more than the same job billed in one — the same work costing a
     * different amount depending on how it was paperworked.
     */
    const depositSubtotal = round2(subtotal * depositRate);
    const depositTax = round2(depositSubtotal * taxRate);
    const balanceSubtotal = round2(subtotal - depositSubtotal);
    const balanceTax = round2(tax - depositTax);

    const pct = Math.round(depositRate * 100);

    const deposit = await createInvoice(tenantId, {
      ...base,
        kind: "DEPOSIT",
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
    });

    const balance = await createInvoice(tenantId, {
      ...base,
        kind: "BALANCE",
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
        `Issued ${deposit.number} (${money(deposit.total)}) to ${project.clientName} — ` +
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
        `Issued ${balance.number} (${money(balance.total)}) to ${project.clientName} — ` +
        `balance on ${project.title} after deposit ${deposit.number}`,
      meta: { kind: "BALANCE", split: true, depositNumber: deposit.number, estimateId },
    });

    return NextResponse.json({ ...deposit, balance, split: true }, { status: 201 });
  }

  const invoice = await createInvoice(tenantId, {
    ...base,
    lineItems: JSON.stringify(lineItems),
    subtotal,
    tax,
    total,
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
      `Issued ${invoice.number} (${money(invoice.total)}) to ${project.clientName} — ${project.title}` +
      (estimateId ? ", torn off the accepted estimate" : ""),
    meta: { kind: "FULL", subtotal, tax, taxRate, estimateId },
  });

  return NextResponse.json(invoice, { status: 201 });
}
