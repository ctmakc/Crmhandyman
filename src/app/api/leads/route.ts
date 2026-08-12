import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sessionTenant } from "@/lib/session";
import { scopedUserId } from "@/lib/scope";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { tenantId } = sessionTenant(session);

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const source = searchParams.get("source");
  const q = searchParams.get("q");

  const leads = await prisma.lead.findMany({
    where: {
      tenantId,
      ...(status ? { status: status as never } : {}),
      ...(source ? { source: source as never } : {}),
      ...(q ? {
        OR: [
          { name: { contains: q } },
          { email: { contains: q } },
          { phone: { contains: q } },
          { city: { contains: q } },
        ],
      } : {}),
    },
    include: {
      assignedTo: { select: { id: true, name: true } },
      // The call sheet's closed lane links CONVERTED leads straight to their job.
      project: { select: { id: true, title: true, status: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(leads);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { tenantId } = sessionTenant(session);

  const body = await req.json();

  // Work handed to a stranger's employee also handed their name back through
  // `assignedTo` on the list below.
  const assignee = await scopedUserId(tenantId, body.assignedToId);
  if (!assignee.ok) return NextResponse.json({ error: "Unknown assignee" }, { status: 400 });

  const lead = await prisma.lead.create({
    data: {
      tenantId,
      name: body.name,
      phone: body.phone,
      email: body.email,
      address: body.address,
      city: body.city,
      source: body.source || "MANUAL",
      jobType: body.jobType,
      notes: body.notes,
      assignedToId: assignee.value,
    },
  });

  return NextResponse.json(lead, { status: 201 });
}
