import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { nextDueVisit, daysUntil, visitMonthsOf } from "@/lib/contracts";
import { writeAuditEvent } from "@/lib/audit";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tenantId = (session.user as any).tenantId as string;
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

  const rows = contracts.map((contract) => {
    const booked = new Set(contract.projects.map((project) => project.contractCycle).filter(Boolean) as string[]);
    const next = nextDueVisit(contract, booked);
    return {
      id: contract.id,
      name: contract.name,
      active: contract.active,
      pricePerVisit: contract.pricePerVisit,
      autoInvoice: contract.autoInvoice,
      visitMonths: visitMonthsOf(contract),
      notes: contract.notes,
      client: contract.client,
      equipment: contract.equipment,
      visitsBooked: contract.projects.length,
      lastVisit: contract.projects.find((project) => project.status === "COMPLETED")?.scheduledDate ?? null,
      nextVisit: next ? next.date.toISOString() : null,
      nextCycle: next?.cycle ?? null,
      daysUntilNext: next ? daysUntil(next.date) : null,
    };
  });

  const filtered = dueWithin
    ? rows.filter((row) => row.active && row.daysUntilNext !== null && row.daysUntilNext <= dueWithin)
    : rows;
  filtered.sort((a, b) => (a.daysUntilNext ?? 9999) - (b.daysUntilNext ?? 9999));
  return NextResponse.json(filtered);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tenantId = (session.user as any).tenantId as string;

  const body = await req.json();
  const client = await prisma.client.findFirst({ where: { id: String(body.clientId ?? ""), tenantId } });
  if (!client) return NextResponse.json({ error: "Client not found" }, { status: 404 });

  let equipmentId: string | undefined;
  if (body.equipmentId) {
    const equipment = await prisma.equipment.findFirst({
      where: { id: String(body.equipmentId), tenantId, clientId: client.id },
      select: { id: true },
    });
    if (!equipment) return NextResponse.json({ error: "Equipment not found for this client" }, { status: 404 });
    equipmentId = equipment.id;
  }

  const months: number[] = Array.isArray(body.visitMonths)
    ? Array.from(
        new Set<number>(
          body.visitMonths
            .map(Number)
            .filter((month: number) => Number.isInteger(month) && month >= 1 && month <= 12)
        )
      )
    : [];
  if (!months.length) return NextResponse.json({ error: "A contract needs at least one visit month" }, { status: 400 });

  const pricePerVisit = Number(body.pricePerVisit);
  if (!Number.isFinite(pricePerVisit) || pricePerVisit < 0) {
    return NextResponse.json({ error: "pricePerVisit must be zero or greater" }, { status: 400 });
  }

  const contract = await prisma.serviceContract.create({
    data: {
      tenantId,
      clientId: client.id,
      equipmentId,
      name: String(body.name || "Maintenance plan").trim().slice(0, 240) || "Maintenance plan",
      visitMonths: JSON.stringify(months.sort((a, b) => a - b)),
      pricePerVisit,
      autoInvoice: Boolean(body.autoInvoice),
      notes: body.notes ? String(body.notes).slice(0, 4000) : undefined,
    },
  });

  await writeAuditEvent({
    tenantId,
    actorEmail: session.user?.email,
    action: "contract.created",
    entityType: "contract",
    entityId: contract.id,
    summary: `Maintenance contract created: ${contract.name}`,
    metadata: { clientId: client.id, equipmentId, visitMonths: months, pricePerVisit, autoInvoice: contract.autoInvoice },
  });
  return NextResponse.json(contract, { status: 201 });
}
