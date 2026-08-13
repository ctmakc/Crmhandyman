import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/guard";
import { inDollars } from "@/lib/money";

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireUser();
  if (!guard.ok) return guard.response;
  const { tenantId, role } = guard.identity;

  /**
   * Every relation under this client carries the tenant of its own.
   *
   * The client row is scoped, which reads as enough — it is not. A row in ANOTHER
   * workspace can point at this client id, and an unscoped `include` walks straight to
   * it: a planted job appeared in this dossier with its money folded into the lifetime
   * value, and the owner could not delete it because deletion is scoped and the row
   * belonged elsewhere. Scoping the id it is reached through is the fix; scoping the
   * relations too is what makes a second such hole harmless.
   */
  const client = await prisma.client.findFirst({
    where: { id: params.id, tenantId },
    include: {
      equipment: { where: { tenantId }, orderBy: { installedAt: "desc" } },
      contracts: {
        where: { tenantId },
        select: {
          id: true,
          name: true,
          pricePerVisitCents: true,
          visitMonths: true,
          active: true,
        },
        orderBy: { createdAt: "desc" },
      },
      leads: { where: { tenantId }, orderBy: { createdAt: "desc" } },
      projects: {
        where: { tenantId },
        orderBy: { createdAt: "desc" },
        include: {
          invoices: {
            orderBy: { issuedAt: "desc" },
            include: { payments: { select: { amountCents: true } } },
          },
          payments: { select: { amountCents: true } },
          expenses: { select: { amountCents: true } },
          estimates: { select: { totalCents: true, status: true } },
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
      totalCents: i.totalCents,
      dueDate: i.dueDate,
      issuedAt: i.issuedAt,
      amountPaidCents: i.payments.reduce((s, x) => s + x.amountCents, 0),
      projectTitle: p.title,
    }))
  );

  // Whole cents all the way down: a client's balance is the sum of the lines the desk
  // shows underneath it, and the two must never round apart.
  const owingCents = invoices
    .filter((i) => i.status === "SENT" || i.status === "PARTIAL")
    .reduce((s, i) => s + (i.totalCents - i.amountPaidCents), 0);

  const collectedCents = client.projects
    .flatMap((p) => p.payments)
    .reduce((s, p) => s + p.amountCents, 0);

  const costsCents = client.projects
    .flatMap((p) => p.expenses)
    .reduce((s, e) => s + e.amountCents, 0);

  return NextResponse.json(
    inDollars({
      ...client,
      // A plan price is the money book, which the crew does not read — the same line
      // that keeps them off /contracts and off the estimates.
      contracts: role === "ADMIN" ? client.contracts : [],
      invoices,
      totals: {
        owingCents,
        collectedCents,
        costsCents,
        lifetimeCents: collectedCents,
      },
    })
  );
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireUser();
  if (!guard.ok) return guard.response;
  const { tenantId } = guard.identity;

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
