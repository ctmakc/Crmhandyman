import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sessionTenant } from "@/lib/session";

export interface SearchHit {
  kind: "lead" | "job" | "invoice" | "client";
  id: string;
  title: string;
  sub: string;
  status: string;
  href: string;
}

/** One query across the three things a dispatcher jumps to. */
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { tenantId } = sessionTenant(session);

  const q = (new URL(req.url).searchParams.get("q") || "").trim();
  if (q.length < 2) return NextResponse.json([]);

  const [leads, jobs, invoices, clients] = await Promise.all([
    prisma.lead.findMany({
      where: {
        tenantId,
        OR: [
          { name: { contains: q } },
          { phone: { contains: q } },
          { city: { contains: q } },
          { jobType: { contains: q } },
        ],
      },
      take: 5,
      orderBy: { createdAt: "desc" },
    }),
    prisma.project.findMany({
      where: {
        tenantId,
        OR: [
          { title: { contains: q } },
          { clientName: { contains: q } },
          { address: { contains: q } },
        ],
      },
      take: 5,
      orderBy: { updatedAt: "desc" },
    }),
    prisma.invoice.findMany({
      where: { tenantId, OR: [{ number: { contains: q } }, { clientName: { contains: q } }] },
      take: 5,
      orderBy: { issuedAt: "desc" },
    }),
    prisma.client.findMany({
      where: {
        tenantId,
        OR: [
          { name: { contains: q } },
          { phone: { contains: q } },
          { email: { contains: q } },
          { address: { contains: q } },
        ],
      },
      take: 5,
      orderBy: { name: "asc" },
    }),
  ]);

  const hits: SearchHit[] = [
    // Clients first: on a service call the address is what the caller gives you.
    ...clients.map((c) => ({
      kind: "client" as const,
      id: c.id,
      title: c.name,
      sub: [c.address, c.city, c.phone].filter(Boolean).join(" · ") || "No contact on file",
      status: "COMPLETED",
      href: `/clients/${c.id}`,
    })),
    ...jobs.map((j) => ({
      kind: "job" as const,
      id: j.id,
      title: j.title,
      sub: `${j.clientName} · ${j.address}`,
      status: j.status,
      href: `/projects/${j.id}`,
    })),
    ...leads.map((l) => ({
      kind: "lead" as const,
      id: l.id,
      title: l.name,
      sub: [l.jobType, l.city, l.phone].filter(Boolean).join(" · ") || "General inquiry",
      status: l.status,
      href: `/leads/${l.id}`,
    })),
    ...invoices.map((inv) => ({
      kind: "invoice" as const,
      id: inv.id,
      title: inv.number,
      sub: inv.clientName,
      status: inv.status,
      href: `/invoices/${inv.id}`,
    })),
  ];

  return NextResponse.json(hits);
}
