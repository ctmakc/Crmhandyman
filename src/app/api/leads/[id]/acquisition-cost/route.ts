import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/guard";
import {
  leadFeeApiValue,
  leadFeeDescription,
  leadFeeExpenseId,
  parseLeadFee,
} from "@/lib/lead-fee";

async function scopedLead(tenantId: string, id: string) {
  return prisma.lead.findFirst({
    where: { tenantId, id },
    select: { id: true, source: true, createdAt: true },
  });
}

/** Owner-only: field crew should not see what the shop pays to acquire customers. */
export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  const { tenantId } = guard.identity;

  const lead = await scopedLead(tenantId, params.id);
  if (!lead) return NextResponse.json({ error: "Lead not found" }, { status: 404 });

  const fee = await prisma.expense.findFirst({
    where: { id: leadFeeExpenseId(lead.id), tenantId, projectId: null },
    select: { amountCents: true },
  });

  return NextResponse.json({ amount: leadFeeApiValue(fee?.amountCents), source: lead.source });
}

/**
 * PUT { amount: 12.34 }. Blank/null removes the direct fee. This writes the accounting
 * ledger, not Lead: one source of financial truth and no money exposed on worker payloads.
 */
export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  const { tenantId } = guard.identity;

  const lead = await scopedLead(tenantId, params.id);
  if (!lead) return NextResponse.json({ error: "Lead not found" }, { status: 404 });

  const body = await req.json().catch(() => null);
  const parsed = parseLeadFee(body?.amount);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const id = leadFeeExpenseId(lead.id);
  if (parsed.cents === null) {
    await prisma.expense.deleteMany({ where: { id, tenantId, projectId: null } });
    return NextResponse.json({ amount: null, source: lead.source });
  }

  const fee = await prisma.expense.upsert({
    where: { id },
    create: {
      id,
      tenantId,
      amountCents: parsed.cents,
      category: "OTHER",
      description: leadFeeDescription(lead.source, lead.id),
      // Source-to-cash reports cohort acquisition spend with the lead's arrival period.
      date: lead.createdAt,
    },
    update: {
      amountCents: parsed.cents,
      category: "OTHER",
      description: leadFeeDescription(lead.source, lead.id),
      date: lead.createdAt,
    },
    select: { amountCents: true },
  });

  return NextResponse.json({ amount: leadFeeApiValue(fee.amountCents), source: lead.source });
}
