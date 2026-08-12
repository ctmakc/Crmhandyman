import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sessionTenant } from "@/lib/session";
import { nextDueVisit, daysUntil, MONTH_NAMES } from "@/lib/contracts";

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
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { tenantId } = sessionTenant(session);

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
    if (c.autoInvoice && c.pricePerVisit > 0) {
      const lineItems = [
        { description: `${c.name} — ${MONTH_NAMES[next.month]} visit`, qty: 1, unit: "ea", unitPrice: c.pricePerVisit },
      ];
      const subtotal = c.pricePerVisit;
      const tax = subtotal * 0.13;
      const year = new Date().getFullYear();
      const count = await prisma.invoice.count({
        where: { tenantId, number: { startsWith: `INV-${year}-` } },
      });
      await prisma.invoice.create({
        data: {
          tenantId,
          projectId: project.id,
          number: `INV-${year}-${String(count + 1).padStart(4, "0")}`,
          clientName: c.client.name,
          address: c.client.address,
          email: c.client.email,
          lineItems: JSON.stringify(lineItems),
          subtotal,
          tax,
          total: subtotal + tax,
          notes: `Scheduled maintenance under ${c.name}.`,
          status: "DRAFT",
          dueDate: new Date(next.date.getTime() + 14 * 86_400_000),
        },
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
