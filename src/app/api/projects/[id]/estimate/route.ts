import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/guard";
import { record, money, jobLabel } from "@/lib/audit";
import { parseDayInput } from "@/lib/dates";
import {
  inDollars,
  lineItemsFromInput,
  lineItemsJsonInDollars,
  lineItemsToJson,
  parseTaxRate,
  quoteTotals,
} from "@/lib/money";
import { docRef } from "@/lib/document";
import { ESTIMATE_STATUSES, badChoice, choice } from "@/lib/enums";
import {
  MOVING_RATE_CARD_CHANNEL,
  containsMovingRateLines,
  decodeMovingRateCard,
  repriceMovingLinesCents,
} from "@/lib/moving-rate-card";

/** One door out: amounts in dollars, lines in dollars, the shape the desk has always read. */
const estimateOut = <T extends { lineItems: string }>(estimate: T) => ({
  ...inDollars(estimate),
  lineItems: lineItemsJsonInDollars(estimate.lineItems),
});

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
    return NextResponse.json({ error: "That record is gone — it was deleted, or the link points at another workspace" }, { status: 404 });

  const estimates = await prisma.estimate.findMany({
    where: { projectId: params.id, tenantId },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(estimates.map(estimateOut));
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  const { tenantId } = guard.identity;

  if (!(await ownedProject(params.id, tenantId)))
    return NextResponse.json({ error: "That record is gone — it was deleted, or the link points at another workspace" }, { status: 404 });

  const body = await req.json();

  // The form posts dollars; this is where they stop being dollars. Every amount below,
  // and every amount stored, is a whole number of cents.
  let lineItems = lineItemsFromInput(body.lineItems);

  // The generic price book ships with illustrative moving numbers for demos. They are
  // never authoritative. Any recognisable moving line is re-priced from this workspace's
  // own rate card here at the server edge, so a stale browser or crafted POST cannot save
  // somebody else's demo rate under a real estimate number.
  if (containsMovingRateLines(lineItems)) {
    const config = await prisma.channelIntegration.findUnique({
      where: { tenantId_channel: { tenantId, channel: MOVING_RATE_CARD_CHANNEL } },
      select: { config: true, isActive: true },
    });
    const card = config?.isActive ? decodeMovingRateCard(config.config) : null;
    if (!card) {
      return NextResponse.json(
        {
          error: "Set the moving rate card before saving a moving estimate",
          settingsUrl: "/settings/moving-rates",
        },
        { status: 409 }
      );
    }
    lineItems = repriceMovingLinesCents(lineItems, card);
  }

  // A fraction, never a percentage. `13` here means 1300% and once produced a real
  // invoice with $1,300.00 of tax on $100.00 of work.
  const taxRate = parseTaxRate(body.taxRate);
  if (taxRate === null)
    return NextResponse.json(
      { error: "Tax rate is a fraction between 0 and 0.3 — 13% is 0.13", field: "taxRate" },
      { status: 400 }
    );

  const { subtotalCents, taxCents, totalCents } = quoteTotals(lineItems, taxRate);

  const estimate = await prisma.estimate.create({
    data: {
      tenantId,
      projectId: params.id,
      lineItems: lineItemsToJson(lineItems),
      subtotalCents,
      taxCents,
      totalCents,
      notes: body.notes,
      validUntil: parseDayInput(body.validUntil),
      status: "DRAFT",
    },
  });

  return NextResponse.json(estimateOut(estimate), { status: 201 });
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  const { tenantId } = guard.identity;

  const body = await req.json();

  const status = choice(ESTIMATE_STATUSES, body.status);
  if (status === null)
    return NextResponse.json(badChoice("estimate status", ESTIMATE_STATUSES), { status: 400 });

  // Scope by id AND tenant AND the project in the URL: accepting a bare body.id let
  // anyone flip another contractor's estimate to ACCEPTED.
  const owned = await prisma.estimate.findFirst({
    where: { id: body.id, tenantId, projectId: params.id },
    // status comes along so the journal can say what the estimate moved away from.
    select: { id: true, status: true },
  });
  if (!owned) return NextResponse.json({ error: "That record is gone — it was deleted, or the link points at another workspace" }, { status: 404 });

  const estimate = await prisma.estimate.update({
    where: { id: owned.id },
    data: {
      status,
      notes: body.notes,
    },
  });

  if (status && status !== owned.status) {
    const ref = docRef("EST", estimate.id, estimate.createdAt);
    // An accepted price is the one a client argues about later, so the decision
    // words go in plainly instead of a FROM → TO transition.
    const verb =
      status === "ACCEPTED"
        ? "accepted"
        : status === "REJECTED"
        ? "rejected"
        : `moved from ${owned.status} to ${status}`;
    await record({
      tenantId,
      actor: guard.identity,
      action:
        status === "ACCEPTED"
          ? "estimate.accept"
          : status === "REJECTED"
          ? "estimate.reject"
          : "estimate.status",
      entity: "Estimate",
      entityId: estimate.id,
      summary:
        `Estimate ${ref} (${money(estimate.totalCents)}) ${verb} on ` +
        `${await jobLabel(tenantId, params.id)}`,
      meta: {
        from: owned.status,
        to: status,
        totalCents: estimate.totalCents,
        projectId: params.id,
      },
    });
  }

  return NextResponse.json(estimateOut(estimate));
}
