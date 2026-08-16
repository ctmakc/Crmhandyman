import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/guard";
import { scopedUserId } from "@/lib/scope";
import { LEAD_SOURCES, LEAD_STATUSES, badChoice, choice } from "@/lib/enums";

export async function GET(req: NextRequest) {
  const guard = await requireUser();
  if (!guard.ok) return guard.response;
  const { tenantId } = guard.identity;

  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q");

  // A filter value the schema does not know reached the enum column and answered 500;
  // a hand-typed query string is the one place that happens by accident.
  const status = choice(LEAD_STATUSES, searchParams.get("status"));
  if (status === null) return NextResponse.json(badChoice("lead status", LEAD_STATUSES), { status: 400 });
  const source = choice(LEAD_SOURCES, searchParams.get("source"));
  if (source === null) return NextResponse.json(badChoice("lead source", LEAD_SOURCES), { status: 400 });

  const leads = await prisma.lead.findMany({
    where: {
      tenantId,
      ...(status ? { status } : {}),
      ...(source ? { source } : {}),
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
  const guard = await requireUser();
  if (!guard.ok) return guard.response;
  const { tenantId } = guard.identity;

  const body = await req.json();

  // Work handed to a stranger's employee also handed their name back through
  // `assignedTo` on the list below.
  const assignee = await scopedUserId(tenantId, body.assignedToId);
  if (!assignee.ok) return NextResponse.json({ error: "That crew member is not on this desk" }, { status: 400 });

  const source = choice(LEAD_SOURCES, body.source);
  if (source === null) return NextResponse.json(badChoice("lead source", LEAD_SOURCES), { status: 400 });

  // No alert on this path, on purpose. A lead reaches this route because somebody at the
  // desk typed it in — he is looking at the screen, and telling him about the row he just
  // entered is how a person learns to ignore the channel that matters. `notifyNewLead`
  // hangs off the doors a lead arrives through on its own: intake, mail, Facebook,
  // Instagram. The digest sweep skips MANUAL leads for the same reason.
  const lead = await prisma.lead.create({
    data: {
      tenantId,
      name: body.name,
      phone: body.phone,
      email: body.email,
      address: body.address,
      city: body.city,
      source: source ?? "MANUAL",
      jobType: body.jobType,
      notes: body.notes,
      assignedToId: assignee.value,
    },
  });

  return NextResponse.json(lead, { status: 201 });
}
