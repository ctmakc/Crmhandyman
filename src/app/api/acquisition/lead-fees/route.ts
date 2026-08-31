import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/guard";
import { leadFeeApiValue, leadFeeExpenseId } from "@/lib/lead-fee";

const DIRECT_FEE_SOURCES = [
  "GOOGLE_LSA",
  "HOMESTARS",
  "BARK",
  "URBANTASKER",
  "MOVINGWALDO",
] as const;

/**
 * Owner worksheet for sources where the marketplace can charge for an individual lead.
 * The latest 500 is intentionally a desk, not an accounting export; old costs remain in
 * Expense and in historical reports even after they fall off this setup screen.
 */
export async function GET(_: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  const { tenantId } = guard.identity;

  const leads = await prisma.lead.findMany({
    where: { tenantId, source: { in: [...DIRECT_FEE_SOURCES] } },
    select: {
      id: true,
      name: true,
      source: true,
      jobType: true,
      city: true,
      status: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
    take: 500,
  });

  const feeIds = leads.map((lead) => leadFeeExpenseId(lead.id));
  const fees = feeIds.length
    ? await prisma.expense.findMany({
        where: { tenantId, projectId: null, id: { in: feeIds } },
        select: { id: true, amountCents: true },
      })
    : [];
  const byId = new Map(fees.map((fee) => [fee.id, fee.amountCents]));

  return NextResponse.json(
    leads.map((lead) => ({
      ...lead,
      acquisitionCost: leadFeeApiValue(byId.get(leadFeeExpenseId(lead.id))),
    }))
  );
}
