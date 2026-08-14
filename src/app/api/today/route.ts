import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/guard";
import { sessionTenant } from "@/lib/session";

/**
 * Today's stops for field mode.
 *
 * A worker sees their own board; an admin sees the whole day. Unfinished work from
 * previous days is carried forward — a job that was not closed yesterday is still a
 * stop today, and hiding it is how jobs get lost.
 */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "You are signed out — sign in again" }, { status: 401 });
  const { tenantId, id: userId, role } = sessionTenant(session);

  return NextResponse.json(await board(tenantId, userId, role));
}

const FIELD_STATUSES = ["SCHEDULED", "IN_PROGRESS", "COMPLETED", "CANCELLED"] as const;
type FieldStatus = (typeof FIELD_STATUSES)[number];

/** What the field can move a job to. Cancelling stays a dispatcher's decision. */
const FIELD_TARGETS: FieldStatus[] = ["IN_PROGRESS", "COMPLETED"];

/** One phone, one dead zone: more than this is a broken client, not a working day. */
const MAX_BATCH = 50;

type ActionInput = { id: string; jobId: string; from: FieldStatus; to: FieldStatus };
type Outcome = "applied" | "conflict" | "gone" | "invalid";

/**
 * The field's write door — one status change, or a batch of them queued while the phone
 * had no signal (src/lib/offline-queue.ts).
 *
 * COMPARE AND SET. Each action carries `from`: the status the tech was looking at when
 * he tapped. The update only fires while the job is still in that state, so the
 * dispatcher who cancelled the job an hour ago wins and the tap comes back as a
 * conflict the tech can read. The server wins, and the person is told it happened.
 *
 * IDEMPOTENT BY CONSTRUCTION. A job already sitting on the target status answers
 * `applied` without writing: the elevator that kills the connection mid-request leaves
 * the tech tapping again, and the second tap must not be a second event. `updateMany`
 * scoped to `{id, tenantId, status: from}` makes that safe under two phones at once —
 * the loser matches nothing, re-reads, and sees its own outcome.
 *
 * The whole batch is answered per action; one rejected tap never blocks the others.
 */
export async function POST(req: NextRequest) {
  const guard = await requireUser();
  if (!guard.ok) return guard.response;
  const { tenantId, id: userId, role } = guard.identity;

  const body = await req.json().catch(() => null);
  const raw = Array.isArray(body?.actions) ? body.actions : null;
  if (!raw) return NextResponse.json({ error: "actions[] required" }, { status: 400 });
  if (raw.length > MAX_BATCH) {
    return NextResponse.json({ error: `at most ${MAX_BATCH} actions` }, { status: 413 });
  }

  const results: Array<{ id: string; jobId: string; outcome: Outcome; status: FieldStatus | null }> =
    [];

  for (const item of raw as ActionInput[]) {
    const id = typeof item?.id === "string" ? item.id : "";
    const jobId = typeof item?.jobId === "string" ? item.jobId : "";
    const from = item?.from;
    const to = item?.to;

    if (!id || !jobId || !FIELD_STATUSES.includes(from) || !FIELD_TARGETS.includes(to)) {
      results.push({ id, jobId, outcome: "invalid", status: null });
      continue;
    }

    // Tenant scope first, always: the id came off a phone and is a claim, not a fact.
    const job = await prisma.project.findFirst({
      where: { id: jobId, tenantId },
      select: { id: true, status: true },
    });
    if (!job) {
      results.push({ id, jobId, outcome: "gone", status: null });
      continue;
    }
    if (job.status === to) {
      // Already there — a replay, or the dispatcher did it for him. Nothing to write.
      results.push({ id, jobId, outcome: "applied", status: to });
      continue;
    }
    if (job.status !== from) {
      results.push({ id, jobId, outcome: "conflict", status: job.status as FieldStatus });
      continue;
    }

    const written = await prisma.project.updateMany({
      where: { id: jobId, tenantId, status: from },
      // Finishing stamps the day it was finished. The column had no writer at all, so
      // the owner's P&L counted zero closed jobs in every month it has ever had.
      data: { status: to, ...(to === "COMPLETED" ? { completedDate: new Date() } : {}) },
    });

    if (written.count === 1) {
      results.push({ id, jobId, outcome: "applied", status: to });
      continue;
    }

    // Someone moved it between the read and the write. Read the truth back and report it.
    const now = await prisma.project.findFirst({
      where: { id: jobId, tenantId },
      select: { status: true },
    });
    if (!now) results.push({ id, jobId, outcome: "gone", status: null });
    else if (now.status === to) results.push({ id, jobId, outcome: "applied", status: to });
    else results.push({ id, jobId, outcome: "conflict", status: now.status as FieldStatus });
  }

  // The fresh board rides back with the batch: the phone that just reconnected needs
  // both answers, and asking for them separately is a second round trip in a dead zone.
  return NextResponse.json({ results, jobs: await board(tenantId, userId, role) });
}

async function board(tenantId: string, userId: string, role: string) {
  const isAdmin = role === "ADMIN";

  const endOfToday = new Date();
  endOfToday.setHours(23, 59, 59, 999);
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  /**
   * «Today, plus whatever was never closed out» is one condition, and it belongs in the
   * query. Asking only for everything scheduled up to tonight and then dropping the
   * closed history in JavaScript meant the phone's first screen read every job the shop
   * had ever completed — a season of them — to show the four stops on the truck.
   *
   * The columns are named too: the board draws ten fields and four off each piece of
   * equipment, and pulling whole rows carried the description of every furnace in the
   * customer base out to a phone on cellular data.
   */
  const relevant = await prisma.project.findMany({
    where: {
      tenantId,
      status: { in: ["SCHEDULED", "IN_PROGRESS", "COMPLETED"] },
      scheduledDate: { lte: endOfToday },
      OR: [{ scheduledDate: { gte: startOfToday } }, { status: { not: "COMPLETED" } }],
      ...(isAdmin ? {} : { assignedToId: userId }),
    },
    select: {
      id: true,
      title: true,
      clientName: true,
      address: true,
      phone: true,
      jobType: true,
      status: true,
      scheduledDate: true,
      // How long the job runs. Without it the board reads a four-day renovation as a
      // one-day stop and stamps it CARRIED every morning from the second day on.
      durationMinutes: true,
      description: true,
      assignedToId: true,
      client: {
        select: {
          // Scoped in its own right. The job is this workspace's, and its client was
          // reached through it — but the iron hanging off that client is a relation of
          // its own, and an unscoped one served a neighbour's furnace serials to a phone.
          equipment: {
            where: { tenantId },
            select: { kind: true, brand: true, model: true, serial: true },
          },
        },
      },
    },
    orderBy: { scheduledDate: "asc" },
  });

  return relevant.map((p) => ({
    id: p.id,
    title: p.title,
    clientName: p.clientName,
    address: p.address,
    phone: p.phone,
    jobType: p.jobType,
    status: p.status,
    scheduledDate: p.scheduledDate,
    durationMinutes: p.durationMinutes,
    description: p.description,
    assignedToId: p.assignedToId,
    equipment: (p.client?.equipment ?? []).map((e) => ({
      kind: e.kind,
      brand: e.brand,
      model: e.model,
      serial: e.serial,
    })),
  }));
}
