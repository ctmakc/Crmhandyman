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
  if (!session) return NextResponse.json({ error: "You are signed out — sign in again" }, { status: 401 });
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
  if (!session) return NextResponse.json({ error: "You are signed out — sign in again" }, { status: 401 });
  const { tenantId } = sessionTenant(session);

  // A body that is not JSON is a bad request, never a crash. `req.json()` throws on a
  // truncated or non-JSON payload, and an unguarded throw here answered 500 with an empty
  // body — the caller could not tell a malformed request from a dead server.
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "That job could not be read — the request body was not valid JSON" }, { status: 400 });
  }
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "That job could not be read — the request body was empty" }, { status: 400 });
  }

  // A job needs a customer to bill, a name to find it by, and an address to drive to —
  // three columns the table stores NOT NULL. A partial payload used to reach `project.create`
  // and let the database throw, which answered 500 AFTER `resolveClient` had already minted
  // the customer: an orphan Client the crew has no button to delete. Refused up front on
  // the same three fields the form marks required, and nothing is created at all.
  const text = (raw: unknown) => (typeof raw === "string" ? raw.trim() : "");
  const clientName = text(body.clientName);
  const title = text(body.title);
  const address = text(body.address);
  const missing = [
    !clientName && "a client name",
    !title && "a job title",
    !address && "an address",
  ].filter(Boolean);
  if (missing.length)
    return NextResponse.json({ error: `A job needs ${missing.join(", ")}.` }, { status: 400 });

  // A job cannot be dispatched to another contractor's employee.
  const assignee = await scopedUserId(tenantId, body.assignedToId);
  if (!assignee.ok) return NextResponse.json({ error: "That crew member is not on this desk" }, { status: 400 });

  // Every job belongs to a client — either the one picked in the form, or the one
  // this name/phone/address already resolves to. The picked one is a claim: a job hung
  // off a stranger's customer showed up in their dossier, carrying money they could not
  // erase, because the row belonged to the sender's workspace.
  const picked = await scopedClientId(tenantId, body.clientId);
  if (!picked.ok) return NextResponse.json({ error: "Client not found" }, { status: 404 });

  // Resolving the client can CREATE one, and the job it hangs off can still fail — a
  // scheduledDate the driver rejects, a write that races a delete. Both live in one
  // `$transaction` so a failed job never leaves a customer behind: the resolver reads and
  // writes through the same `tx`, and if `create` throws the mint rolls back with it.
  const project = await prisma.$transaction(async (tx) => {
    const clientId =
      picked.value ||
      (await resolveClient(
        tenantId,
        { name: clientName, phone: body.phone as string | null, email: body.email as string | null, address },
        tx
      ));

    return tx.project.create({
      data: {
        tenantId,
        clientId,
        clientName,
        phone: body.phone as string | null | undefined,
        email: body.email as string | null | undefined,
        address,
        title,
        description: body.description as string | null | undefined,
        jobType: body.jobType as string | null | undefined,
        scheduledDate: parseDayInput(body.scheduledDate),
        durationMinutes: parseDuration(body.durationMinutes),
        assignedToId: assignee.value,
      },
    });
  });

  return NextResponse.json(
    { ...project, conflicts: await doubleBooked(tenantId, project) },
    { status: 201 }
  );
}
