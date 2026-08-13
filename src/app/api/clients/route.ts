import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sessionTenant } from "@/lib/session";
import { inDollars } from "@/lib/money";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { tenantId } = sessionTenant(session);

  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q");

  const where = {
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
  };

  const clients = await prisma.client.findMany({
    where,
    select: {
      id: true,
      name: true,
      phone: true,
      email: true,
      address: true,
      city: true,
      equipment: {
        where: { tenantId },
        select: { kind: true, brand: true },
        orderBy: { createdAt: "asc" },
        take: 3,
      },
      // Counted within this workspace. A relation count reached through a scoped client
      // is still unscoped in itself, so a row planted from another workspace was counted
      // as one of this shop's jobs on this shop's card index.
      _count: {
        select: {
          projects: { where: { tenantId } },
          leads: { where: { tenantId } },
          equipment: { where: { tenantId } },
        },
      },
    },
    orderBy: { name: "asc" },
  });

  /**
   * The balance column used to hang off a four-level `include`: every client, with every
   * job, with every invoice, with every payment — the whole shop's ledger loaded into
   * memory so that one number per row could be added up in JavaScript. At a season's
   * volume that is thousands of rows read to print a card index of names.
   *
   * The same three numbers, read flat and joined by id here. `groupBy` adds the payments
   * in the database instead of hydrating them; only open invoices are fetched, because a
   * settled one contributes nothing to what is owed.
   *
   * A search narrows to a handful of clients, so the job read narrows with it — a
   * one-name lookup should not walk the whole yard.
   */
  const scope = q ? { clientId: { in: clients.map((c) => c.id) } } : { clientId: { not: null } };

  const [projects, openInvoices, paidByInvoice] = await Promise.all([
    prisma.project.findMany({
      where: { tenantId, ...scope },
      select: {
        id: true,
        clientId: true,
        status: true,
        scheduledDate: true,
        completedDate: true,
      },
    }),
    prisma.invoice.findMany({
      where: { tenantId, status: { in: ["SENT", "PARTIAL"] } },
      select: { id: true, projectId: true, totalCents: true },
    }),
    prisma.payment.groupBy({
      by: ["invoiceId"],
      where: { tenantId },
      _sum: { amountCents: true },
    }),
  ]);

  const paidCentsOf = new Map(paidByInvoice.map((p) => [p.invoiceId, p._sum.amountCents ?? 0]));
  const clientOfProject = new Map(projects.map((p) => [p.id, p.clientId]));

  const owingByClient = new Map<string, number>();
  for (const invoice of openInvoices) {
    const clientId = clientOfProject.get(invoice.projectId);
    if (!clientId) continue;
    const owing = invoice.totalCents - (paidCentsOf.get(invoice.id) ?? 0);
    owingByClient.set(clientId, (owingByClient.get(clientId) ?? 0) + owing);
  }

  const openJobsByClient = new Map<string, number>();
  const lastSeenByClient = new Map<string, Date>();
  for (const p of projects) {
    if (!p.clientId) continue;
    if (p.status === "SCHEDULED" || p.status === "IN_PROGRESS") {
      openJobsByClient.set(p.clientId, (openJobsByClient.get(p.clientId) ?? 0) + 1);
    }
    // When the truck was last at this address: the day it was finished, or the day it
    // was booked for if it never was.
    const seen = p.completedDate || p.scheduledDate;
    const best = lastSeenByClient.get(p.clientId);
    if (seen && (!best || seen > best)) lastSeenByClient.set(p.clientId, seen);
  }

  return NextResponse.json(
    inDollars(
      clients.map((c) => ({
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
        openJobs: openJobsByClient.get(c.id) ?? 0,
        owingCents: owingByClient.get(c.id) ?? 0,
        lastSeen: lastSeenByClient.get(c.id) ?? null,
      }))
    )
  );
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { tenantId } = sessionTenant(session);

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
