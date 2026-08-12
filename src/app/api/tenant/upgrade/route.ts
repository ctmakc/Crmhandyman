import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { sessionTenant } from "@/lib/session";
import { prisma } from "@/lib/prisma";

/**
 * Renaming the business is the tenant's own business. Moving to a paid plan is not:
 * this endpoint used to let any admin set `plan: PAID, expiresAt: null` on themselves,
 * which is the whole paywall. Upgrades belong to the operator panel or a payment webhook.
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { tenantId, role } = sessionTenant(session);
  if (role !== "ADMIN") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

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
