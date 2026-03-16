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
    include: { assignedTo: { select: { id: true, name: true } } },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(leads);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tenantId = (session.user as any).tenantId as string;

  const body = await req.json();
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
      assignedToId: body.assignedToId,
    },
  });

  return NextResponse.json(lead, { status: 201 });
}
