import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const q = searchParams.get("q");

  const projects = await prisma.project.findMany({
    where: {
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

  const body = await req.json();
  const project = await prisma.project.create({
    data: {
      clientName: body.clientName,
      phone: body.phone,
      email: body.email,
      address: body.address,
      title: body.title,
      description: body.description,
      jobType: body.jobType,
      scheduledDate: body.scheduledDate ? new Date(body.scheduledDate) : undefined,
      assignedToId: body.assignedToId,
    },
  });

  return NextResponse.json(project, { status: 201 });
}
