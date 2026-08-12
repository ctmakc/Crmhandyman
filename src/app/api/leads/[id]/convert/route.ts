import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { resolveClient } from "@/lib/client-resolver";
import { record, actorFromSession } from "@/lib/audit";
import { sessionTenant } from "@/lib/session";
import { scopedUserId } from "@/lib/scope";
import { parseDayInput } from "@/lib/dates";
import { docRef } from "@/lib/document";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { tenantId } = sessionTenant(session);

  const body = await req.json();

  // The «Open a job» dialog sends assignedToId: "" when nobody is picked. Passed
  // straight through, the empty string hit the foreign key and every single press of
  // the button answered 500 — the one step of the whole desk that has to work.
  const assignee = await scopedUserId(tenantId, body.assignedToId);
  if (!assignee.ok) return NextResponse.json({ error: "Unknown assignee" }, { status: 400 });
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
        scheduledDate: parseDayInput(body.scheduledDate),
        assignedToId: assignee.value,
      },
    }),
    prisma.lead.update({
      where: { id: params.id },
      data: { status: "CONVERTED", clientId },
    }),
  ]);

  await record({
    tenantId,
    actor: actorFromSession(session),
    action: "lead.convert",
    entity: "Project",
    entityId: project.id,
    summary:
      `Opened job ${docRef("WO", project.id, project.createdAt)} ` +
      `"${project.title}" for ${lead.name} from the ${lead.source} lead`,
    meta: { leadId: params.id, source: lead.source, clientId, address: project.address },
  });

  return NextResponse.json(project, { status: 201 });
}
