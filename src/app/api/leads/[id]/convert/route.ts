import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const lead = await prisma.lead.findUnique({
    where: { id: params.id },
    include: { project: { select: { id: true } } },
  });
  if (!lead) return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  if (lead.project) return NextResponse.json({ error: "Already converted" }, { status: 400 });

  const [project] = await prisma.$transaction([
    prisma.project.create({
      data: {
        leadId: params.id,
        clientName: lead.name,
        phone: lead.phone,
        email: lead.email,
        address: body.address || lead.address || "",
        title: body.title || `${lead.jobType || "Job"} for ${lead.name}`,
        description: body.description,
        jobType: lead.jobType,
        scheduledDate: body.scheduledDate ? new Date(body.scheduledDate) : undefined,
        assignedToId: body.assignedToId,
      },
    }),
    prisma.lead.update({
      where: { id: params.id },
      data: { status: "CONVERTED" },
    }),
  ]);

  return NextResponse.json(project, { status: 201 });
}
