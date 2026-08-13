import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/guard";
import { scopedEquipmentId } from "@/lib/scope";
import { nextDueVisit, daysUntil, visitMonthsOf } from "@/lib/contracts";
import { inDollars, parseCents } from "@/lib/money";

/**
 * The maintenance book.
 *
 * A plan carries a price per visit, which makes the whole surface the owner's — the same
 * rule that keeps the crew off the estimates and out of the P&L. It only ever asked for a
 * login, so a hired tech could read every plan price in the shop and write one of his own.
 */

/** Contracts with their derived next visit. `?due=<days>` filters to what needs booking. */
export async function GET(req: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  const { tenantId } = guard.identity;

  const dueWithin = Number(new URL(req.url).searchParams.get("due") || 0);

  const contracts = await prisma.serviceContract.findMany({
    where: { tenantId },
    include: {
      client: { select: { id: true, name: true, address: true, city: true } },
      equipment: { select: { id: true, kind: true, brand: true, model: true } },
      projects: {
        select: { id: true, contractCycle: true, status: true, scheduledDate: true },
        orderBy: { scheduledDate: "desc" },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  const rows = contracts.map((c) => {
    const booked = new Set(c.projects.map((p) => p.contractCycle).filter(Boolean) as string[]);
    const next = nextDueVisit(c, booked);
    return {
      id: c.id,
      name: c.name,
      active: c.active,
      pricePerVisitCents: c.pricePerVisitCents,
      autoInvoice: c.autoInvoice,
      visitMonths: visitMonthsOf(c),
      notes: c.notes,
      client: c.client,
      equipment: c.equipment,
      visitsBooked: c.projects.length,
      lastVisit: c.projects.find((p) => p.status === "COMPLETED")?.scheduledDate ?? null,
      nextVisit: next ? next.date.toISOString() : null,
      nextCycle: next?.cycle ?? null,
      daysUntilNext: next ? daysUntil(next.date) : null,
    };
  });

  const filtered = dueWithin
    ? rows.filter((r) => r.active && r.daysUntilNext !== null && r.daysUntilNext <= dueWithin)
    : rows;

  filtered.sort((a, b) => (a.daysUntilNext ?? 9999) - (b.daysUntilNext ?? 9999));
  return NextResponse.json(inDollars(filtered));
}

export async function POST(req: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  const { tenantId } = guard.identity;

  const body = await req.json();
  const client = await prisma.client.findFirst({ where: { id: body.clientId, tenantId } });
  if (!client) return NextResponse.json({ error: "Client not found" }, { status: 404 });

  // The client was checked and the equipment was not: a plan pointed at a stranger's
  // furnace read its make, model and serial straight back out through this list.
  const equipment = await scopedEquipmentId(tenantId, body.equipmentId);
  if (!equipment.ok) return NextResponse.json({ error: "Equipment not found" }, { status: 404 });

  const months: number[] = Array.isArray(body.visitMonths)
    ? body.visitMonths.map(Number).filter((m: number) => m >= 1 && m <= 12)
    : [];
  if (!months.length)
    return NextResponse.json({ error: "A contract needs at least one visit month" }, { status: 400 });

  const contract = await prisma.serviceContract.create({
    data: {
      tenantId,
      clientId: client.id,
      equipmentId: equipment.value,
      name: body.name?.trim() || "Maintenance plan",
      visitMonths: JSON.stringify(months),
      pricePerVisitCents: parseCents(body.pricePerVisit) ?? 0,
      autoInvoice: Boolean(body.autoInvoice),
      notes: body.notes || undefined,
    },
  });

  return NextResponse.json(inDollars(contract), { status: 201 });
}
