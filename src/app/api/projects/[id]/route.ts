import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/guard";
import { scopedUserId } from "@/lib/scope";
import { parseDayInput } from "@/lib/dates";

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireUser();
  if (!guard.ok) return guard.response;
  const { tenantId, role } = guard.identity;

  const project = await prisma.project.findFirst({
    where: { id: params.id, tenantId },
    include: {
      lead: { select: { id: true, name: true, source: true } },
      assignedTo: { select: { id: true, name: true } },
      estimates: { orderBy: { createdAt: "desc" } },
      tasks: {
        include: { assignedTo: { select: { id: true, name: true } } },
        orderBy: { createdAt: "desc" },
      },
      invoices: {
        orderBy: { issuedAt: "desc" },
        include: { payments: { select: { amount: true } } },
      },
      payments: { orderBy: { date: "desc" } },
      expenses: { orderBy: { date: "desc" } },
    },
  });

  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  /**
   * The books are the owner's. A tech opening the same job card was reading the quoted
   * price, the margin and every invoice on it — the rail hides the finance screens, and
   * this payload handed the same numbers over anyway. The field needs the address, the
   * work and its tasks; the money rides with `viewerRole` so the page knows what to draw.
   */
  if (role !== "ADMIN") {
    return NextResponse.json({
      ...project,
      estimates: [],
      invoices: [],
      payments: [],
      expenses: [],
      viewerRole: role,
    });
  }

  return NextResponse.json({ ...project, viewerRole: role });
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireUser();
  if (!guard.ok) return guard.response;
  const { tenantId, role } = guard.identity;

  const existing = await prisma.project.findFirst({ where: { id: params.id, tenantId } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json();

  const assignee = await scopedUserId(tenantId, body.assignedToId);
  if (!assignee.ok) return NextResponse.json({ error: "Unknown assignee" }, { status: 400 });

  /**
   * Who owns a job is the dispatcher's call. The crew select on the job card sends the
   * whole project back on every save, so a tech pressing «Start job» was also posting
   * `assignedToId: null` — one tap took him off the work order and out of the day plan.
   */
  const assignedToId =
    role === "ADMIN" && "assignedToId" in body ? assignee.value ?? null : undefined;

  const project = await prisma.project.update({
    where: { id: params.id },
    data: {
      clientName: body.clientName,
      phone: body.phone,
      email: body.email,
      address: body.address,
      title: body.title,
      description: body.description,
      jobType: body.jobType,
      status: body.status,
      scheduledDate: parseDayInput(body.scheduledDate),
      completedDate: parseDayInput(body.completedDate),
      assignedToId,
    },
  });

  return NextResponse.json(project);
}
