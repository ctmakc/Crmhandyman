import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

import { sessionTenant } from "@/lib/session";
import type { Session } from "next-auth";

const SUPER_ADMIN_EMAILS = (process.env.SUPER_ADMIN_EMAILS || "")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

/** Unset means the panel does not exist — a missing variable must not open it. */
const PLATFORM_TENANT_SLUG = (process.env.PLATFORM_TENANT_SLUG || "").trim();

/**
 * An email alone is not an identity here: users are unique per tenant, so anyone could
 * open a workspace on the operator's address and inherit this panel over every tenant.
 * The account must also sit in the platform's own workspace and be an admin there.
 */
function isSuperAdmin(session: Session | null) {
  if (!session?.user?.email || !PLATFORM_TENANT_SLUG) return false;
  if (!SUPER_ADMIN_EMAILS.includes(session.user.email.toLowerCase())) return false;

  const { tenantSlug, role } = sessionTenant(session);
  return tenantSlug === PLATFORM_TENANT_SLUG && role === "ADMIN";
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!isSuperAdmin(session)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const tenants = await prisma.tenant.findMany({
    include: { _count: { select: { users: true, leads: true, projects: true } } },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(tenants);
}

export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!isSuperAdmin(session)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { id, plan, expiresAt, businessName } = body;

  const tenant = await prisma.tenant.update({
    where: { id },
    data: {
      plan: plan || undefined,
      expiresAt: expiresAt !== undefined ? (expiresAt ? new Date(expiresAt) : null) : undefined,
      businessName: businessName || undefined,
    },
  });

  return NextResponse.json(tenant);
}

export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!isSuperAdmin(session)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  // Delete all tenant data in dependency order. Clients, equipment, contracts and
  // invoices arrived in later waves and were never added here, so every foreign key
  // still pointed at the tenant and the delete failed at the last statement.
  await prisma.$transaction([
    prisma.expense.deleteMany({ where: { tenantId: id } }),
    prisma.payment.deleteMany({ where: { tenantId: id } }),
    prisma.invoice.deleteMany({ where: { tenantId: id } }),
    prisma.task.deleteMany({ where: { tenantId: id } }),
    prisma.estimate.deleteMany({ where: { tenantId: id } }),
    prisma.equipment.deleteMany({ where: { tenantId: id } }),
    prisma.serviceContract.deleteMany({ where: { tenantId: id } }),
    prisma.project.deleteMany({ where: { tenantId: id } }),
    prisma.lead.deleteMany({ where: { tenantId: id } }),
    prisma.client.deleteMany({ where: { tenantId: id } }),
    prisma.channelIntegration.deleteMany({ where: { tenantId: id } }),
    prisma.user.deleteMany({ where: { tenantId: id } }),
    prisma.tenant.delete({ where: { id } }),
  ]);

  return NextResponse.json({ ok: true });
}
