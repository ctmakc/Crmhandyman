import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/guard";

const MARKER = /^\[\[LEAD:([^\]]+)\]\]/;

export async function GET(_: NextRequest) {
  const guard = await requireUser();
  if (!guard.ok) return guard.response;
  const { tenantId } = guard.identity;

  const tasks = await prisma.task.findMany({
    where: {
      tenantId,
      status: { in: ["TODO", "IN_PROGRESS"] },
      dueDate: { not: null },
      description: { startsWith: "[[LEAD:" },
    },
    include: { assignedTo: { select: { id: true, name: true } } },
    orderBy: { dueDate: "asc" },
    take: 100,
  });

  const parsed = tasks
    .map((task) => ({ task, leadId: MARKER.exec(task.description || "")?.[1] || null }))
    .filter((row): row is { task: (typeof tasks)[number]; leadId: string } => !!row.leadId);

  // Array.from works under the repository's current TypeScript target without asking
  // the whole app to opt into downlevel Set iteration just for this small dedupe.
  const leadIds = Array.from(new Set(parsed.map((row) => row.leadId)));
  const leads = leadIds.length
    ? await prisma.lead.findMany({
        where: { tenantId, id: { in: leadIds } },
        select: {
          id: true,
          name: true,
          phone: true,
          city: true,
          jobType: true,
          status: true,
          source: true,
        },
      })
    : [];
  const byId = new Map(leads.map((lead) => [lead.id, lead]));

  return NextResponse.json(
    parsed.flatMap(({ task, leadId }) => {
      const lead = byId.get(leadId);
      if (!lead) return [];
      return [
        {
          id: task.id,
          dueDate: task.dueDate,
          status: task.status,
          assignedTo: task.assignedTo,
          lead,
        },
      ];
    })
  );
}
