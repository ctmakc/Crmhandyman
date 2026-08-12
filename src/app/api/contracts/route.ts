import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sessionTenant } from "@/lib/session";
import { nextDueVisit, daysUntil, visitMonthsOf } from "@/lib/contracts";

/** Contracts with their derived next visit. `?due=<days>` filters to what needs booking. */
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { tenantId } = sessionTenant(session);

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
      pricePerVisit: c.pricePerVisit,
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
  return NextResponse.json(filtered);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { tenantId } = sessionTenant(session);

  const body = await req.json();
  const client = await prisma.client.findFirst({ where: { id: body.clientId, tenantId } });
  if (!client) return NextResponse.json({ error: "Client not found" }, { status: 404 });

  const months: number[] = Array.isArray(body.visitMonths)
    ? body.visitMonths.map(Number).filter((m: number) => m >= 1 && m <= 12)
    : [];
  if (!months.length)
    return NextResponse.json({ error: "A contract needs at least one visit month" }, { status: 400 });

  const contract = await prisma.serviceContract.create({
    data: {
      tenantId,
      clientId: client.id,
      equipmentId: body.equipmentId || undefined,
      name: body.name?.trim() || "Maintenance plan",
      visitMonths: JSON.stringify(months),
      pricePerVisit: Number(body.pricePerVisit) || 0,
      autoInvoice: Boolean(body.autoInvoice),
      notes: body.notes || undefined,
    },
  });

  return NextResponse.json(contract, { status: 201 });
}
