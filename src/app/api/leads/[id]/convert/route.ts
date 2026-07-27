import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { resolveClient } from "@/lib/client-resolver";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tenantId = (session.user as any).tenantId as string;

  const body = await req.json();
  const lead = await prisma.lead.findFirst({
    where: { id: params.id, tenantId },
    include: { project: { select: { id: true } } },
  });
  if (!lead) return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  if (lead.project) return NextResponse.json({ error: "Already converted" }, { status: 400 });

  // Carry the lead's client through, or resolve one now, so the new job lands on the
  // same record as any previous work at this address.
  const clientId =
    lead.clientId ||
    (await resolveClient(tenantId, {
      name: lead.name,
      phone: lead.phone,
      email: lead.email,
      address: body.address || lead.address,
      city: lead.city,
    }));

  const [project] = await prisma.$transaction([
    prisma.project.create({
      data: {
        tenantId,
        clientId,
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
      data: { status: "CONVERTED", clientId },
    }),
  ]);

  return NextResponse.json(project, { status: 201 });
}
