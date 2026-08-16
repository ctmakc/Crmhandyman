import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/guard";
import { prisma } from "@/lib/prisma";

/**
 * Renaming the business is the tenant's own business. Moving to a paid plan is not:
 * this endpoint used to let any admin set `plan: PAID, expiresAt: null` on themselves,
 * which is the whole paywall. Upgrades belong to the operator panel or a payment webhook.
 */
export async function POST(req: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  const { tenantId } = guard.identity;

  const body = await req.json();
  const businessName = typeof body.businessName === "string" ? body.businessName.trim() : "";
  if (!businessName) {
    return NextResponse.json({ error: "businessName required" }, { status: 400 });
  }

  await prisma.tenant.update({
    where: { id: tenantId },
    data: { businessName },
  });

  return NextResponse.json({ ok: true });
}
