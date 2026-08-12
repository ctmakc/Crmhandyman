import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { resolveClient } from "@/lib/client-resolver";
import { sessionTenant } from "@/lib/session";
import { scopedUserId } from "@/lib/scope";
import { parseDayInput } from "@/lib/dates";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { tenantId } = sessionTenant(session);

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const q = searchParams.get("q");

  const projects = await prisma.project.findMany({
    where: {
      tenantId,
      ...(status ? { status: status as never } : {}),
      ...(q ? {
        OR: [
          { title: { contains: q } },
          { clientName: { contains: q } },
          { address: { contains: q } },
        ],
      } : {}),
    },
    include: {
      client: { select: { id: true, name: true } },
      estimates: { select: { id: true, total: true, status: true } },
      payments: { select: { amount: true } },
      tasks: { select: { id: true, status: true } },
    },
    orderBy: { updatedAt: "desc" },
  });

  return NextResponse.json(projects);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { tenantId } = sessionTenant(session);

  const body = await req.json();

  // A job cannot be dispatched to another contractor's employee.
  const assignee = await scopedUserId(tenantId, body.assignedToId);
  if (!assignee.ok) return NextResponse.json({ error: "Unknown assignee" }, { status: 400 });

  // Every job belongs to a client — either the one picked in the form, or the one
  // this name/phone/address already resolves to.
  const clientId =
    body.clientId ||
    (await resolveClient(tenantId, {
      name: body.clientName,
      phone: body.phone,
      email: body.email,
      address: body.address,
    }));

  const project = await prisma.project.create({
    data: {
      tenantId,
      clientId,
      clientName: body.clientName,
      phone: body.phone,
      email: body.email,
      address: body.address,
      title: body.title,
      description: body.description,
      jobType: body.jobType,
      scheduledDate: parseDayInput(body.scheduledDate),
      assignedToId: assignee.value,
    },
  });

  return NextResponse.json(project, { status: 201 });
}
