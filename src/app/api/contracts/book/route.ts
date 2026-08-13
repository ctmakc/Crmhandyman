import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/guard";
import { createInvoice } from "@/lib/invoice-number";
import { nextDueVisit, daysUntil, MONTH_NAMES } from "@/lib/contracts";
import { DEFAULT_TAX_RATE, lineItemsToJson, quoteTotals } from "@/lib/money";

/**
 * Turn due contract visits into real work orders.
 *
 * Run on demand from the desk rather than on a timer: a shop wants to see what is
 * about to be booked before trucks are committed. `contractId` books one contract;
 * omitting it books everything due within `withinDays` (default 45).
 *
 * The `contractCycle` stamp is what makes this safe to press twice — a visit that is
 * already on the board is never booked again.
 */
export async function POST(req: NextRequest) {
  // It books work AND can bill for it — the owner's press, like the rest of the book.
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  const { tenantId } = guard.identity;

  const body = await req.json().catch(() => ({}));

  // Clamped on purpose. Without a ceiling, a caller passing a large window walks the
  // whole schedule forward one visit per press and books years of work onto the board.
  const withinDays = Math.min(Math.max(Number(body.withinDays ?? 45) || 45, 1), 120);

  const contracts = await prisma.serviceContract.findMany({
    where: {
      tenantId,
      active: true,
      ...(body.contractId ? { id: body.contractId } : {}),
    },
    include: {
      client: true,
      equipment: true,
      projects: { select: { contractCycle: true } },
    },
  });

  const booked: Array<{ projectId: string; contract: string; client: string; on: string }> = [];

  for (const c of contracts) {
    const cycles = new Set(c.projects.map((p) => p.contractCycle).filter(Boolean) as string[]);
    const next = nextDueVisit(c, cycles);
    if (!next) continue;
    if (!body.contractId && daysUntil(next.date) > withinDays) continue;

    const unit = c.equipment
      ? `${c.equipment.kind.replace(/_/g, " ").toLowerCase()}`
      : "system";

    const project = await prisma.project.create({
      data: {
        tenantId,
        clientId: c.clientId,
        contractId: c.id,
        contractCycle: next.cycle,
        clientName: c.client.name,
        phone: c.client.phone,
        email: c.client.email,
        address: c.client.address || "",
        title: `${c.name} — ${MONTH_NAMES[next.month]} visit`,
        description: `Contract visit for the ${unit}. ${c.notes || ""}`.trim(),
        jobType: "HVAC service",
        scheduledDate: next.date,
        status: "SCHEDULED",
      },
    });

    // Billing the visit up front is opt-in: many shops invoice after the tech reports.
    if (c.autoInvoice && c.pricePerVisitCents > 0) {
      const lineItems = [
        {
          description: `${c.name} — ${MONTH_NAMES[next.month]} visit`,
          qty: 1,
          unit: "ea",
          unitPriceCents: c.pricePerVisitCents,
        },
      ];
      // Priced by the same function as an estimate, so an auto-billed visit and a
      // hand-written one for the same price come out to the same cent.
      const { subtotalCents, taxCents, totalCents } = quoteTotals(lineItems, DEFAULT_TAX_RATE);
      /**
       * Numbered by the one allocator. Counting the rows instead handed the next visit a
       * number a voided invoice had already taken — either a duplicate on a client's desk
       * or a dead insert that booked the visit and lost its bill.
       */
      await createInvoice(tenantId, {
          projectId: project.id,
          clientName: c.client.name,
          address: c.client.address,
          email: c.client.email,
          lineItems: lineItemsToJson(lineItems),
          subtotalCents,
          taxCents,
          totalCents,
          notes: `Scheduled maintenance under ${c.name}.`,
          status: "DRAFT",
          dueDate: new Date(next.date.getTime() + 14 * 86_400_000),
      });
    }

    booked.push({
      projectId: project.id,
      contract: c.name,
      client: c.client.name,
      on: next.date.toISOString(),
    });
  }

  return NextResponse.json({ booked, count: booked.length });
}
