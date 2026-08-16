import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { resolveClient } from "@/lib/client-resolver";
import { writeAuditEvent } from "@/lib/audit";

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

  let assignedToId: string | undefined;
  if (body.assignedToId) {
    const worker = await prisma.user.findFirst({
      where: { id: String(body.assignedToId), tenantId },
      select: { id: true },
    });
    if (!worker) return NextResponse.json({ error: "Crew member not found" }, { status: 404 });
    assignedToId = worker.id;
  }

  const address = String(body.address || lead.address || "").trim();
  const clientId =
    lead.clientId ||
    (await resolveClient(tenantId, {
      name: lead.name,
      phone: lead.phone,
      email: lead.email,
      address,
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
        address,
        title: String(body.title || `${lead.jobType || "Job"} for ${lead.name}`).slice(0, 300),
        description: body.description ? String(body.description).slice(0, 5000) : undefined,
        jobType: lead.jobType,
        scheduledDate: body.scheduledDate ? new Date(body.scheduledDate) : undefined,
        assignedToId,
      },
    }),
    prisma.lead.update({
      where: { id: params.id },
      data: { status: "CONVERTED", clientId },
    }),
  ]);

  await writeAuditEvent({
    tenantId,
    actorEmail: session.user?.email,
    action: "lead.converted",
    entityType: "lead",
    entityId: lead.id,
    summary: `Lead converted to job: ${project.title}`,
    metadata: { projectId: project.id, clientId, assignedToId: project.assignedToId },
  });
  return NextResponse.json(project, { status: 201 });
}
