import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/guard";
import { record } from "@/lib/audit";
import {
  LEAD_OUTCOMES,
  followUpDate,
  leadOutcome,
  leadTaskMarker,
  outcomePlan,
} from "@/lib/lead-sales";

function readMeta(meta: string | null): Record<string, unknown> | null {
  if (!meta) return null;
  try {
    return JSON.parse(meta) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireUser();
  if (!guard.ok) return guard.response;
  const { tenantId } = guard.identity;

  const lead = await prisma.lead.findFirst({
    where: { id: params.id, tenantId },
    select: { id: true },
  });
  if (!lead) return NextResponse.json({ error: "Lead not found" }, { status: 404 });

  const marker = leadTaskMarker(params.id);
  const [activity, followUps] = await Promise.all([
    prisma.auditLog.findMany({
      where: {
        tenantId,
        entity: "Lead",
        entityId: params.id,
        action: { startsWith: "lead.activity." },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    prisma.task.findMany({
      where: {
        tenantId,
        description: { contains: marker },
      },
      include: { assignedTo: { select: { id: true, name: true } } },
      orderBy: [{ status: "asc" }, { dueDate: "asc" }],
    }),
  ]);

  return NextResponse.json({
    activity: activity.map((entry) => ({ ...entry, meta: readMeta(entry.meta) })),
    followUps,
  });
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireUser();
  if (!guard.ok) return guard.response;
  const { id: actorId, tenantId } = guard.identity;

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "The activity body is not valid JSON" }, { status: 400 });
  }

  const outcome = leadOutcome(body.outcome);
  if (!outcome) {
    return NextResponse.json(
      { error: "Unknown lead outcome", field: "outcome", allowed: [...LEAD_OUTCOMES] },
      { status: 400 }
    );
  }

  const followUpAt = followUpDate(body.followUpAt);
  if (followUpAt === null) {
    return NextResponse.json({ error: "Follow-up time is not a valid date" }, { status: 400 });
  }

  const note = typeof body.note === "string" ? body.note.trim() : "";
  if (note.length > 2000) {
    return NextResponse.json({ error: "Activity note is too long" }, { status: 400 });
  }

  const lead = await prisma.lead.findFirst({
    where: { id: params.id, tenantId },
    select: {
      id: true,
      name: true,
      phone: true,
      source: true,
      status: true,
      assignedToId: true,
      project: { select: { id: true } },
    },
  });
  if (!lead) return NextResponse.json({ error: "Lead not found" }, { status: 404 });

  const plan = outcomePlan(outcome);
  const marker = leadTaskMarker(lead.id);
  const assignedToId = lead.assignedToId || actorId;

  // Any recorded attempt closes the previous callback promise for this lead. If this
  // attempt needs another touch, a fresh task is created below with the new due time.
  await prisma.$transaction(async (tx) => {
    await tx.task.updateMany({
      where: {
        tenantId,
        status: { in: ["TODO", "IN_PROGRESS"] },
        description: { contains: marker },
      },
      data: { status: "DONE" },
    });

    await tx.lead.update({
      where: { id: lead.id },
      data: { status: plan.status },
    });

    if (followUpAt && !plan.terminal) {
      await tx.task.create({
        data: {
          tenantId,
          title: `Follow up — ${lead.name}`,
          description: [
            marker,
            lead.phone ? `Phone: ${lead.phone}` : null,
            `Outcome: ${plan.label}`,
            note || null,
          ]
            .filter(Boolean)
            .join("\n"),
          assignedToId,
          createdById: actorId,
          dueDate: followUpAt,
        },
      });
    }
  });

  const followUpText = followUpAt && !plan.terminal ? `; follow-up ${followUpAt.toISOString()}` : "";
  await record({
    tenantId,
    actor: { id: actorId },
    action: `lead.activity.${outcome.toLowerCase()}`,
    entity: "Lead",
    entityId: lead.id,
    summary: `Worked ${lead.name}: ${plan.label}${followUpText}${note ? ` — ${note}` : ""}`,
    meta: {
      outcome,
      previousStatus: lead.status,
      status: plan.status,
      source: lead.source,
      phone: lead.phone,
      followUpAt: followUpAt?.toISOString() ?? null,
      note: note || null,
      projectId: lead.project?.id ?? null,
    },
  });

  const updated = await prisma.lead.findFirst({
    where: { id: lead.id, tenantId },
    include: {
      assignedTo: { select: { id: true, name: true } },
      project: { select: { id: true, title: true, status: true } },
    },
  });

  return NextResponse.json({ lead: updated, outcome, followUpAt: followUpAt?.toISOString() ?? null });
}
