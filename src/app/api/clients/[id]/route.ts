import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

async function tenantOf(session: unknown) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (session as any)?.user?.tenantId as string;
}

export async function GET(_: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const client = await prisma.client.findFirst({
    where: { id: params.id, tenantId: await tenantOf(session) },
    include: {
      equipment: { orderBy: { installedAt: "desc" } },
      contracts: {
        select: { id: true, name: true, pricePerVisit: true, visitMonths: true, active: true },
        orderBy: { createdAt: "desc" },
      },
      leads: { orderBy: { createdAt: "desc" } },
      projects: {
        orderBy: { createdAt: "desc" },
        include: {
          invoices: {
            orderBy: { issuedAt: "desc" },
            include: { payments: { select: { amount: true } } },
          },
          payments: { select: { amount: true } },
          expenses: { select: { amount: true } },
          estimates: { select: { total: true, status: true } },
        },
      },
    },
  });
  if (!client) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const invoices = client.projects.flatMap((p) =>
    p.invoices.map((i) => ({
      id: i.id,
      number: i.number,
      status: i.status,
      total: i.total,
      dueDate: i.dueDate,
      issuedAt: i.issuedAt,
      amountPaid: i.payments.reduce((s, x) => s + x.amount, 0),
      projectTitle: p.title,
    }))
  );

  const owing = invoices
    .filter((i) => i.status === "SENT" || i.status === "PARTIAL")
    .reduce((s, i) => s + (i.total - i.amountPaid), 0);

  const collected = client.projects
    .flatMap((p) => p.payments)
    .reduce((s, p) => s + p.amount, 0);

  const costs = client.projects.flatMap((p) => p.expenses).reduce((s, e) => s + e.amount, 0);

  return NextResponse.json({
    ...client,
    invoices,
    totals: { owing, collected, costs, lifetime: collected },
  });
}

export async function PUT(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const tenantId = await tenantOf(session);

  const existing = await prisma.client.findFirst({ where: { id: params.id, tenantId } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json();
  const client = await prisma.client.update({
    where: { id: params.id },
    data: {
      name: body.name ?? existing.name,
      phone: body.phone ?? existing.phone,
      email: body.email ?? existing.email,
      address: body.address ?? existing.address,
      city: body.city ?? existing.city,
      notes: body.notes ?? existing.notes,
    },
  });

  return NextResponse.json(client);
}
