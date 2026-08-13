import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { resolveClient } from "@/lib/client-resolver";
import { sessionTenant } from "@/lib/session";
import { scopedClientId, scopedUserId } from "@/lib/scope";
import { parseDayInput } from "@/lib/dates";
import { inDollars } from "@/lib/money";
import { PROJECT_STATUSES, badChoice, choice } from "@/lib/enums";
import { dayWindow, intersectsWindow, parseDuration, weekWindow, MAX_SPAN_DAYS } from "@/lib/schedule";
import { doubleBooked } from "@/lib/schedule-db";

/**
 * The rail draws a job as a run rather than a dot, so it needs the name of whoever holds
 * it; `assignedToId` and `durationMinutes` are columns and ride along on their own.
 * Load is then counted off the real assignment instead of dividing jobs by heads.
 */
const CREW_ON_JOB = { assignedTo: { select: { id: true, name: true } } } as const;

/**
 * A window is asked for by the day rail, and a job that started before the window can
 * still be running inside it. SQLite cannot add `durationMinutes` to `scheduledDate` in
 * a WHERE clause, so the query reaches back one maximum span and the run length is
 * applied in `intersectsWindow` — the cap is what keeps that reach bounded.
 */
function windowRange(param: string | null, dateParam: string | null) {
  if (param !== "week" && param !== "day") return null;
  const anchor = parseDayInput(dateParam) ?? new Date();
  return param === "week" ? weekWindow(anchor) : dayWindow(anchor);
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { tenantId, role } = sessionTenant(session);

  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q");
  const range = windowRange(searchParams.get("window"), searchParams.get("date"));

  const status = choice(PROJECT_STATUSES, searchParams.get("status"));
  if (status === null)
    return NextResponse.json(badChoice("job status", PROJECT_STATUSES), { status: 400 });

  const reach = range
    ? (() => {
        const from = new Date(range.from);
        from.setDate(from.getDate() - MAX_SPAN_DAYS);
        return { gte: from, lt: range.to };
      })()
    : undefined;

  /**
   * The books are the owner's, on the list exactly as on the job card.
   *
   * `GET /api/projects/[id]` was taught to strip the money for a WORKER; the list it is
   * opened from kept serving it, so a hired tech reading one request had every quoted
   * price and every collection in the shop. The estimate and payment rows are dropped
   * for the crew rather than blanked, because the yard screen only ever counted them.
   */
  const showsMoney = role === "ADMIN";

  const projects = await prisma.project.findMany({
    where: {
      tenantId,
      ...(status ? { status } : {}),
      ...(reach ? { scheduledDate: reach } : {}),
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
      ...(showsMoney
        ? {
            estimates: { select: { id: true, totalCents: true, status: true } },
            payments: { select: { amountCents: true } },
          }
        : {}),
      tasks: { select: { id: true, status: true } },
      ...CREW_ON_JOB,
    },
    orderBy: range ? { scheduledDate: "asc" } : { updatedAt: "desc" },
  });

  const inRange = range
    ? projects.filter((p) => intersectsWindow(p, range.from, range.to))
    : projects;

  return NextResponse.json(
    showsMoney
      ? inDollars(inRange)
      : inRange.map((p) => ({ ...p, estimates: [], payments: [], viewerRole: "WORKER" }))
  );
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
  // this name/phone/address already resolves to. The picked one is a claim: a job hung
  // off a stranger's customer showed up in their dossier, carrying money they could not
  // erase, because the row belonged to the sender's workspace.
  const picked = await scopedClientId(tenantId, body.clientId);
  if (!picked.ok) return NextResponse.json({ error: "Client not found" }, { status: 404 });

  const clientId =
    picked.value ||
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
      durationMinutes: parseDuration(body.durationMinutes),
      assignedToId: assignee.value,
    },
  });

  return NextResponse.json(
    { ...project, conflicts: await doubleBooked(tenantId, project) },
    { status: 201 }
  );
}
