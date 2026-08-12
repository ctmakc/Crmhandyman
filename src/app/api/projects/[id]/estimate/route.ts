import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/guard";
import { record, money, jobLabel } from "@/lib/audit";
import { parseDayInput } from "@/lib/dates";
import { round2 } from "@/lib/money";
import { docRef } from "@/lib/document";

/** The project must belong to the caller's tenant before anything is read or written onto it. */
async function ownedProject(projectId: string, tenantId: string) {
  return prisma.project.findFirst({ where: { id: projectId, tenantId }, select: { id: true } });
}

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  // A price is the owner's business. A tech reading this route saw what the job was
  // quoted at and what the margin on it must be.
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  const { tenantId } = guard.identity;

  if (!(await ownedProject(params.id, tenantId)))
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  const estimates = await prisma.estimate.findMany({
    where: { projectId: params.id, tenantId },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(estimates);
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  const { tenantId } = guard.identity;

  if (!(await ownedProject(params.id, tenantId)))
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json();
  const lineItems = body.lineItems as Array<{
    description: string;
    qty: number;
    unit: string;
    unitPrice: number;
  }>;

  // Rounded before it is stored: a raw float product puts 31.525000000000002 on paper
  // and the number the client is asked for stops being a number they can transfer.
  const subtotal = round2(lineItems.reduce((sum, item) => sum + item.qty * item.unitPrice, 0));
  const taxRate = body.taxRate ?? 0.13;
  const tax = round2(subtotal * taxRate);
  const total = round2(subtotal + tax);

  const estimate = await prisma.estimate.create({
    data: {
      tenantId,
      projectId: params.id,
      lineItems: JSON.stringify(lineItems),
      subtotal,
      tax,
      total,
      notes: body.notes,
      validUntil: parseDayInput(body.validUntil),
      status: "DRAFT",
    },
  });

  return NextResponse.json(estimate, { status: 201 });
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  const { tenantId } = guard.identity;

  const body = await req.json();

  // Scope by id AND tenant AND the project in the URL: accepting a bare body.id let
  // anyone flip another contractor's estimate to ACCEPTED.
  const owned = await prisma.estimate.findFirst({
    where: { id: body.id, tenantId, projectId: params.id },
    // status comes along so the journal can say what the estimate moved away from.
    select: { id: true, status: true },
  });
  if (!owned) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const estimate = await prisma.estimate.update({
    where: { id: owned.id },
    data: {
      status: body.status,
      notes: body.notes,
    },
  });

  if (body.status && body.status !== owned.status) {
    const ref = docRef("EST", estimate.id, estimate.createdAt);
    // An accepted price is the one a client argues about later, so the decision
    // words go in plainly instead of a FROM → TO transition.
    const verb =
      body.status === "ACCEPTED"
        ? "accepted"
        : body.status === "REJECTED"
        ? "rejected"
        : `moved from ${owned.status} to ${body.status}`;
    await record({
      tenantId,
      actor: guard.identity,
      action:
        body.status === "ACCEPTED"
          ? "estimate.accept"
          : body.status === "REJECTED"
          ? "estimate.reject"
          : "estimate.status",
      entity: "Estimate",
      entityId: estimate.id,
      summary:
        `Estimate ${ref} (${money(estimate.total)}) ${verb} on ` +
        `${await jobLabel(tenantId, params.id)}`,
      meta: { from: owned.status, to: body.status, total: estimate.total, projectId: params.id },
    });
  }

  return NextResponse.json(estimate);
}
