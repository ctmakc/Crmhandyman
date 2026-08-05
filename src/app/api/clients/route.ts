import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tenantId = (session.user as any).tenantId as string;

  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q");

  const clients = await prisma.client.findMany({
    where: {
      tenantId,
      ...(q
        ? {
            OR: [
              { name: { contains: q } },
              { phone: { contains: q } },
              { email: { contains: q } },
              { address: { contains: q } },
              { city: { contains: q } },
            ],
          }
        : {}),
    },
    include: {
      projects: {
        select: {
          id: true,
          status: true,
          scheduledDate: true,
          completedDate: true,
          invoices: { select: { total: true, status: true, payments: { select: { amount: true } } } },
        },
      },
      equipment: {
        select: { kind: true, brand: true },
        orderBy: { createdAt: "asc" },
        take: 3,
      },
      _count: { select: { projects: true, leads: true, equipment: true } },
    },
    orderBy: { name: "asc" },
  });

  return NextResponse.json(
    clients.map((c) => {
      // What this address still owes us, across every job it ever had.
      const owing = c.projects
        .flatMap((p) => p.invoices)
        .filter((i) => i.status === "SENT" || i.status === "PARTIAL")
        .reduce((sum, i) => sum + (i.total - i.payments.reduce((s, p) => s + p.amount, 0)), 0);

      const lastSeen = c.projects
        .map((p) => p.completedDate || p.scheduledDate)
        .filter(Boolean)
        .sort((a, b) => new Date(b!).getTime() - new Date(a!).getTime())[0];

      const openJobs = c.projects.filter(
        (p) => p.status === "SCHEDULED" || p.status === "IN_PROGRESS"
      ).length;

      return {
        id: c.id,
        name: c.name,
        phone: c.phone,
        email: c.email,
        address: c.address,
        city: c.city,
        jobCount: c._count.projects,
        leadCount: c._count.leads,
        equipmentCount: c._count.equipment,
        // Real iron, not a count: "FURNACE · Carrier" chips for the card index.
        equipmentKinds: c.equipment.map((e) =>
          e.brand ? `${e.kind.replace(/_/g, " ")} · ${e.brand}` : e.kind.replace(/_/g, " ")
        ),
        openJobs,
        owing,
        lastSeen: lastSeen ?? null,
      };
    })
  );
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tenantId = (session.user as any).tenantId as string;

  const body = await req.json();
  if (!body.name?.trim())
    return NextResponse.json({ error: "A client needs a name" }, { status: 400 });

  const client = await prisma.client.create({
    data: {
      tenantId,
      name: body.name.trim(),
      phone: body.phone || undefined,
      email: body.email || undefined,
      address: body.address || undefined,
      city: body.city || undefined,
      notes: body.notes || undefined,
    },
  });

  return NextResponse.json(client, { status: 201 });
}
